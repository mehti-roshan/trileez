namespace Trilez.Agent.Presentation;

/// <summary>
/// Captures a JPEG only while the employee has accepted an active server session.
/// A failed authorization check stops capture before the next frame. Pixels are not stored locally.
/// </summary>
public interface IScreenCapturer : IDisposable
{
    bool IsCapturing { get; }
    int MonitorCount { get; }
    void Start();
    void Stop();
    void ApplyProfile(ScreenCaptureProfile profile);
    byte[]? CaptureJpeg();
}

public sealed class ScreenChannel
{
    public required TrilezApiClient Client { get; init; }
    public required string DeviceId { get; init; }
    public required string Credential { get; init; }
    public bool Active { get; init; }
}

public sealed class ScreenShareCoordinator : IDisposable
{
    public const int MaxFrameBytes = 400_000;
    private readonly IScreenCapturer _capturer;
    private readonly IHeartbeatTicker _pollTicker;
    private readonly IHeartbeatTicker _frameTicker;
    private readonly Func<ScreenChannel?> _channel;
    private readonly Action<TrilezApiException>? _onAuthorization;
    private readonly TimeSpan _pollInterval;
    private readonly TimeSpan _frameInterval;
    private readonly ScreenRateController _rate;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly object _startLock = new();
    private readonly object _sendLock = new();
    private int _stopRequested;
    private int _ending;
    private int _sendGeneration;
    private bool _started;
    private bool _frameRunning;
    private bool _draining;
    private bool _localAccepted;
    private bool _confirmFailed;
    private string? _sessionId;
    private string? _appliedMode;
    private int _appliedFps = -1;
    private int _appliedEdge = -1;
    private int _appliedQuality = -1;
    private bool _appliedFallback;
    private TimeSpan _activeFrameInterval;
    private DateTimeOffset _confirmedAt;
    private ScreenSession? _lastSession;
    private byte[]? _pending;
    private Task _drain = Task.CompletedTask;

    public ScreenShareCoordinator(
        IScreenCapturer capturer,
        IHeartbeatTicker pollTicker,
        IHeartbeatTicker frameTicker,
        Func<ScreenChannel?> channel,
        Action<TrilezApiException>? onAuthorization = null,
        TimeSpan? pollInterval = null,
        TimeSpan? frameInterval = null,
        TimeSpan? qualityStepCooldown = null)
    {
        _capturer = capturer ?? throw new ArgumentNullException(nameof(capturer));
        _pollTicker = pollTicker ?? throw new ArgumentNullException(nameof(pollTicker));
        _frameTicker = frameTicker ?? throw new ArgumentNullException(nameof(frameTicker));
        _channel = channel ?? throw new ArgumentNullException(nameof(channel));
        _onAuthorization = onAuthorization;
        _pollInterval = ClampPoll(pollInterval);
        _frameInterval = ClampFrame(frameInterval);
        _rate = new ScreenRateController(qualityStepCooldown);
        Snapshot = ScreenShareSnapshot.Idle();
    }

    public Task TransmitIdle => _drain;

    public ScreenShareSnapshot Snapshot { get; private set; }
    public TimeSpan PollInterval => _pollInterval;
    public TimeSpan FrameInterval => _frameInterval;
    public event EventHandler? Changed;

    public static TimeSpan ClampPoll(TimeSpan? value)
    {
        var interval = value ?? TimeSpan.FromSeconds(5);
        if (interval < TimeSpan.FromSeconds(2)) return TimeSpan.FromSeconds(2);
        if (interval > TimeSpan.FromSeconds(30)) return TimeSpan.FromSeconds(30);
        return interval;
    }

    public static TimeSpan ClampFrame(TimeSpan? value)
    {
        var interval = value ?? TimeSpan.FromMilliseconds(500);
        if (interval < TimeSpan.FromMilliseconds(200)) return TimeSpan.FromMilliseconds(200);
        if (interval > TimeSpan.FromMilliseconds(1000)) return TimeSpan.FromMilliseconds(1000);
        return interval;
    }

    public void Start()
    {
        var channel = _channel();
        if (channel is not { Active: true })
        {
            StopCapture();
            Publish(ScreenShareSnapshot.Stopped());
            return;
        }
        lock (_startLock)
        {
            if (_started) return;
            _started = true;
            Volatile.Write(ref _stopRequested, 0);
        }
        _pollTicker.Start(_pollInterval, PollAsync);
    }

    public void StopCapture()
    {
        lock (_sendLock)
        {
            _sendGeneration++;
            _pending = null;
            _draining = false;
        }
        _capturer.Stop();
    }

    public void StopLocal()
    {
        Volatile.Write(ref _stopRequested, 1);
        lock (_startLock) { _started = false; }
        _pollTicker.Stop();
        StopFrameTicker();
        StopCapture();
        _localAccepted = false;
        _sessionId = null;
        Publish(ScreenShareSnapshot.Stopped());
        if (!_gate.Wait(0)) return;
        try { Publish(ScreenShareSnapshot.Stopped()); }
        finally { _gate.Release(); }
    }

    public async Task StopAsync(string reason, CancellationToken cancellationToken = default)
    {
        var sessionId = _sessionId;
        var channel = _channel();
        Volatile.Write(ref _stopRequested, 1);
        Volatile.Write(ref _ending, 1);
        lock (_startLock) { _started = false; }
        _pollTicker.Stop();
        StopFrameTicker();
        StopCapture();
        _localAccepted = false;
        _sessionId = null;
        try
        {
            await _gate.WaitAsync(cancellationToken);
            _gate.Release();
        }
        catch (OperationCanceledException)
        {
            Publish(ScreenShareSnapshot.Stopped());
            return;
        }
        if (channel is not null && !string.IsNullOrWhiteSpace(sessionId))
        {
            try
            {
                var ended = await channel.Client.EndScreenSessionAsync(channel.DeviceId, sessionId, channel.Credential, reason, cancellationToken);
                Publish(Describe(ended, canAccept: false, canStop: false));
                return;
            }
            catch (TrilezApiException)
            {
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
            }
        }
        Publish(ScreenShareSnapshot.Stopped());
    }

    public async Task<ScreenCommandResult> AcceptAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            await _gate.WaitAsync(cancellationToken);
        }
        catch (OperationCanceledException)
        {
            return ScreenCommandResult.Fail(PresentationText.GenericFailure);
        }
        try
        {
            if (Volatile.Read(ref _stopRequested) == 1) return ScreenCommandResult.Fail(PresentationText.ScreenShareNotRequested);
            if (Snapshot.Phase != "requested" || string.IsNullOrWhiteSpace(_sessionId))
                return ScreenCommandResult.Fail(PresentationText.ScreenShareNotRequested);
            var channel = _channel();
            if (channel is not { Active: true }) return ScreenCommandResult.Expired(UserMessages.For(401, "SESSION_REVOKED"));
            var session = await channel.Client.AcceptScreenSessionAsync(channel.DeviceId, _sessionId, channel.Credential, cancellationToken);
            if (!string.Equals(session.State, "active", StringComparison.Ordinal) || string.IsNullOrWhiteSpace(session.Id))
                return ScreenCommandResult.Fail(PresentationText.GenericFailure);
            _localAccepted = true;
            _sessionId = session.Id;
            _lastSession = session;
            _confirmedAt = DateTimeOffset.UtcNow;
            _confirmFailed = false;
            NoteSessionQuality(session);
            ApplyEffective();
            Publish(Describe(session, canAccept: false, canStop: true));
            return ScreenCommandResult.Ok(PresentationText.ScreenShareAccepted);
        }
        catch (TrilezApiException error)
        {
            StopCapture();
            return FailFrom(error);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<ScreenCommandResult> DecideControlAsync(string action, CancellationToken cancellationToken = default)
    {
        if (action is not ("grant" or "deny" or "revoke"))
            return ScreenCommandResult.Fail(PresentationText.ScreenControlUnavailable);
        try
        {
            await _gate.WaitAsync(cancellationToken);
        }
        catch (OperationCanceledException)
        {
            return ScreenCommandResult.Fail(PresentationText.GenericFailure);
        }
        try
        {
            if (Volatile.Read(ref _stopRequested) == 1 || string.IsNullOrWhiteSpace(_sessionId))
                return ScreenCommandResult.Fail(PresentationText.ScreenControlUnavailable);
            var grantId = _lastSession?.ControlGrantId;
            if (string.IsNullOrWhiteSpace(grantId))
                return ScreenCommandResult.Fail(PresentationText.ScreenControlUnavailable);
            var channel = _channel();
            if (channel is not { Active: true }) return ScreenCommandResult.Expired(UserMessages.For(401, "SESSION_REVOKED"));
            var session = await channel.Client.DecideScreenControlAsync(channel.DeviceId, _sessionId, channel.Credential, action, grantId, cancellationToken);
            _lastSession = session;
            _confirmedAt = DateTimeOffset.UtcNow;
            _confirmFailed = false;
            Publish(Describe(session, canAccept: false, canStop: string.Equals(session.State, "active", StringComparison.Ordinal)));
            return ScreenCommandResult.Ok(PresentationText.ScreenControlDecided);
        }
        catch (TrilezApiException error)
        {
            return FailFrom(error);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<ScreenCommandResult> StopSharingAsync(string reason, CancellationToken cancellationToken = default)
    {
        var sessionId = _sessionId;
        var channel = _channel();
        Volatile.Write(ref _ending, 1);
        StopCapture();
        StopFrameTicker();
        _localAccepted = false;
        _sessionId = null;
        try
        {
            if (string.IsNullOrWhiteSpace(sessionId) || channel is not { Active: true })
            {
                Publish(ScreenShareSnapshot.Idle());
                return ScreenCommandResult.Fail(PresentationText.ScreenShareNotRequested);
            }
            var ended = await channel.Client.EndScreenSessionAsync(channel.DeviceId, sessionId, channel.Credential, reason, cancellationToken);
            Publish(Describe(ended, canAccept: false, canStop: false));
            return ScreenCommandResult.Ok(PresentationText.ScreenShareStoppedByEmployee);
        }
        catch (TrilezApiException error)
        {
            StopCapture();
            return FailFrom(error);
        }
        finally
        {
            Volatile.Write(ref _ending, 0);
        }
    }

    public void Dispose()
    {
        StopCapture();
        _pollTicker.Stop();
        StopFrameTicker();
        _gate.Dispose();
    }

    private async Task PollAsync(CancellationToken cancellationToken)
    {
        if (!await _gate.WaitAsync(0, cancellationToken)) return;
        try
        {
            if (Volatile.Read(ref _stopRequested) == 1 || Volatile.Read(ref _ending) == 1) return;
            var channel = _channel();
            if (channel is not { Active: true })
            {
                StopCapture();
                Publish(ScreenShareSnapshot.Stopped());
                return;
            }
            ScreenSession? session;
            try
            {
                session = await channel.Client.GetScreenSessionAsync(channel.DeviceId, channel.Credential, cancellationToken);
            }
            catch (TrilezApiException error)
            {
                HandleFailure(error);
                return;
            }
            if (Volatile.Read(ref _stopRequested) == 1 || Volatile.Read(ref _ending) == 1)
            {
                StopCapture();
                return;
            }
            await ApplyPolledSessionAsync(channel, session, cancellationToken);
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task ApplyPolledSessionAsync(ScreenChannel channel, ScreenSession? session, CancellationToken cancellationToken)
    {
        if (session is null || string.IsNullOrWhiteSpace(session.Id))
        {
            StopCapture();
            _localAccepted = false;
            _sessionId = null;
            StopFrameTicker();
            Publish(ScreenShareSnapshot.Idle());
            return;
        }
        if (string.Equals(session.State, "requested", StringComparison.Ordinal))
        {
            StopCapture();
            _localAccepted = false;
            _sessionId = session.Id;
            _lastSession = session;
            StopFrameTicker();
            NoteSessionQuality(session);
            Publish(Describe(session, canAccept: true, canStop: true));
            return;
        }
        if (string.Equals(session.State, "active", StringComparison.Ordinal))
        {
            var sameSession = _localAccepted && string.Equals(_sessionId, session.Id, StringComparison.Ordinal);
            if (!sameSession)
            {
                StopCapture();
                _localAccepted = false;
                StopFrameTicker();
                if (Volatile.Read(ref _ending) == 1 || Volatile.Read(ref _stopRequested) == 1) return;
                try
                {
                    await channel.Client.EndScreenSessionAsync(channel.DeviceId, session.Id, channel.Credential, "agent_lost", cancellationToken);
                }
                catch (TrilezApiException error)
                {
                    HandleFailure(error);
                    return;
                }
                _sessionId = null;
                Publish(Describe(session, canAccept: false, canStop: false, endedOverride: "agent_lost"));
                return;
            }
            _sessionId = session.Id;
            _lastSession = session;
            _confirmedAt = DateTimeOffset.UtcNow;
            _confirmFailed = false;
            NoteSessionQuality(session);
            ApplyEffective();
            Publish(Describe(session, canAccept: false, canStop: true));
            return;
        }
        StopCapture();
        _localAccepted = false;
        _sessionId = null;
        StopFrameTicker();
        Publish(Describe(session, canAccept: false, canStop: false));
    }

    private async Task FrameAsync(CancellationToken cancellationToken)
    {
        if (!await _gate.WaitAsync(0, cancellationToken))
        {
            if (_localAccepted && IsHighRate()) _rate.Observe(new ScreenTransferSample(DateTimeOffset.UtcNow, 0, null, false, true, false));
            return;
        }
        byte[]? jpeg = null;
        ScreenChannel? channel = null;
        var sessionId = _sessionId;
        var highRate = false;
        try
        {
            if (Volatile.Read(ref _stopRequested) == 1 || Volatile.Read(ref _ending) == 1 || !_localAccepted || string.IsNullOrWhiteSpace(_sessionId))
            {
                StopCapture();
                return;
            }
            channel = _channel();
            if (channel is not { Active: true })
            {
                StopCapture();
                return;
            }
            ScreenSession? session;
            var freshHigh = IsHighRate() && !_confirmFailed && _lastSession is not null && DateTimeOffset.UtcNow - _confirmedAt < TimeSpan.FromSeconds(1);
            if (freshHigh)
            {
                session = _lastSession;
            }
            else
            {
                try
                {
                    session = await channel.Client.GetScreenSessionAsync(channel.DeviceId, channel.Credential, cancellationToken);
                }
                catch (TrilezApiException error)
                {
                    HandleFailure(error);
                    return;
                }
                if (session is not null)
                {
                    _lastSession = session;
                    _confirmedAt = DateTimeOffset.UtcNow;
                    _confirmFailed = false;
                    NoteSessionQuality(session);
                }
            }
            if (!MayCapture(session))
            {
                StopCapture();
                if (session is null || !string.Equals(session.State, "active", StringComparison.Ordinal))
                {
                    _localAccepted = false;
                    StopFrameTicker();
                    Publish(session is null || string.IsNullOrWhiteSpace(session.Id) ? ScreenShareSnapshot.Idle() : Describe(session, false, false));
                }
                return;
            }
            ApplyEffective();
            _capturer.Start();
            jpeg = _capturer.CaptureJpeg();
            if (!_capturer.IsCapturing || Volatile.Read(ref _stopRequested) == 1 || Volatile.Read(ref _ending) == 1 || !_localAccepted)
            {
                StopCapture();
                jpeg = null;
                return;
            }
            if (!IsUploadable(jpeg))
            {
                _rate.Observe(new ScreenTransferSample(DateTimeOffset.UtcNow, 0, null, false, false, true));
                if (_lastSession is not null) Publish(Describe(_lastSession, false, true));
                jpeg = null;
                return;
            }
            highRate = IsHighRate();
            sessionId = _sessionId;
            if (!highRate)
            {
                var started = DateTimeOffset.UtcNow;
                try
                {
                    await channel.Client.UploadScreenFrameAsync(channel.DeviceId, sessionId!, channel.Credential, jpeg!, cancellationToken);
                    var elapsed = (int)Math.Max(0, (DateTimeOffset.UtcNow - started).TotalMilliseconds);
                    _rate.Observe(new ScreenTransferSample(DateTimeOffset.UtcNow, jpeg!.Length, elapsed, true, false, false));
                    _confirmedAt = DateTimeOffset.UtcNow;
                    _confirmFailed = false;
                    if (_lastSession is not null) Publish(Describe(_lastSession, false, true));
                }
                catch (TrilezApiException error)
                {
                    HandleFailure(error);
                }
                jpeg = null;
            }
        }
        finally
        {
            _gate.Release();
        }
        if (highRate && jpeg is not null && channel is not null && !string.IsNullOrWhiteSpace(sessionId))
            EnqueueFrame(channel, sessionId, jpeg);
    }

    private bool IsHighRate() => _rate.Effective.Mode == "high" && !_rate.Effective.FellBack;

    private void NoteSessionQuality(ScreenSession session) =>
        _rate.Configure(ScreenQuality.Clamp(session.QualityMode, session.MaxFps, session.MaxEdge, session.JpegQuality));

    private void ApplyEffective()
    {
        var settings = _rate.Effective;
        _capturer.ApplyProfile(new ScreenCaptureProfile(settings.Edge, settings.Quality, MaxFrameBytes, settings.Mode == "high" && !settings.FellBack));
        var changed = settings.Mode != _appliedMode || settings.Fps != _appliedFps || settings.Edge != _appliedEdge || settings.Quality != _appliedQuality || settings.FellBack != _appliedFallback;
        if (changed)
        {
            DiscardPending();
            _appliedMode = settings.Mode;
            _appliedFps = settings.Fps;
            _appliedEdge = settings.Edge;
            _appliedQuality = settings.Quality;
            _appliedFallback = settings.FellBack;
        }
        if (_localAccepted) EnsureFrameTicker(TickInterval(settings));
    }

    private TimeSpan TickInterval(ScreenCaptureSettings settings)
    {
        var interval = ScreenQuality.IntervalFor(settings);
        if ((settings.Mode != "high" || settings.FellBack) && settings.Fps <= 2 && interval < _frameInterval)
            return _frameInterval;
        return interval;
    }

    private void EnqueueFrame(ScreenChannel channel, string sessionId, byte[] jpeg)
    {
        var generation = 0;
        lock (_sendLock)
        {
            generation = _sendGeneration;
            if (_draining)
            {
                if (_pending is not null) _rate.Observe(new ScreenTransferSample(DateTimeOffset.UtcNow, 0, null, false, true, false));
                _pending = jpeg;
                return;
            }
            _pending = jpeg;
            _draining = true;
            _drain = DrainAsync(channel, sessionId, generation);
        }
    }

    private async Task DrainAsync(ScreenChannel channel, string sessionId, int generation)
    {
        try
        {
            while (Volatile.Read(ref _stopRequested) == 0 && Volatile.Read(ref _ending) == 0 && generation == _sendGeneration)
            {
                byte[]? frame = null;
                lock (_sendLock)
                {
                    if (_pending is null || generation != _sendGeneration) return;
                    frame = _pending;
                    _pending = null;
                }
                if (frame is null) return;
                var started = DateTimeOffset.UtcNow;
                try
                {
                    await channel.Client.UploadScreenFrameAsync(channel.DeviceId, sessionId, channel.Credential, frame, CancellationToken.None);
                }
                catch (TrilezApiException error)
                {
                    if (generation != _sendGeneration || Volatile.Read(ref _stopRequested) == 1) return;
                    HandleFailure(error);
                    return;
                }
                if (generation != _sendGeneration || Volatile.Read(ref _stopRequested) == 1 || Volatile.Read(ref _ending) == 1) return;
                var elapsed = (int)Math.Max(0, (DateTimeOffset.UtcNow - started).TotalMilliseconds);
                _rate.Observe(new ScreenTransferSample(DateTimeOffset.UtcNow, frame.Length, elapsed, true, false, false));
                _confirmedAt = DateTimeOffset.UtcNow;
                _confirmFailed = false;
                var settings = _rate.Effective;
                if (settings.Mode != _appliedMode || settings.Fps != _appliedFps || settings.Edge != _appliedEdge || settings.Quality != _appliedQuality || settings.FellBack != _appliedFallback)
                    ApplyEffective();
                if (_lastSession is not null) Publish(Describe(_lastSession, false, true));
            }
        }
        finally
        {
            var restart = false;
            lock (_sendLock)
            {
                if (generation == _sendGeneration)
                {
                    if (_pending is not null && Volatile.Read(ref _stopRequested) == 0 && Volatile.Read(ref _ending) == 0)
                        restart = true;
                    else
                        _draining = false;
                }
            }
            if (restart) _drain = DrainAsync(channel, sessionId, generation);
        }
    }

    private void DiscardPending()
    {
        lock (_sendLock) { _pending = null; }
    }

    private bool MayCapture(ScreenSession? session) =>
        Volatile.Read(ref _stopRequested) == 0
        && Volatile.Read(ref _ending) == 0
        && _localAccepted
        && session is not null
        && string.Equals(session.State, "active", StringComparison.Ordinal)
        && string.Equals(session.Id, _sessionId, StringComparison.Ordinal);

    private static bool IsUploadable(byte[]? jpeg) =>
        jpeg is not null && jpeg.Length >= 4 && jpeg.Length <= MaxFrameBytes && jpeg[0] == 0xFF && jpeg[1] == 0xD8;

    private void HandleFailure(TrilezApiException error)
    {
        _confirmFailed = true;
        StopCapture();
        if (IsTerminal(error))
        {
            Halt(error);
            return;
        }
        if (error.Code is "SCREEN_SESSION_ENDED" or "SCREEN_NOT_ACTIVE")
        {
            _localAccepted = false;
            _sessionId = null;
            StopFrameTicker();
            Publish(new ScreenShareSnapshot { Phase = "ended", Message = error.Message });
            return;
        }
        if (IsTransient(error))
        {
            Publish(new ScreenShareSnapshot
            {
                Phase = "offline",
                SessionId = _sessionId,
                SupportName = Snapshot.SupportName,
                Message = error.Message,
                CanStop = !string.IsNullOrWhiteSpace(_sessionId),
            });
            return;
        }
        Publish(new ScreenShareSnapshot { Phase = Snapshot.Phase, SessionId = _sessionId, SupportName = Snapshot.SupportName, Message = error.Message, CanStop = Snapshot.CanStop });
    }

    private ScreenCommandResult FailFrom(TrilezApiException error)
    {
        if (IsTerminal(error))
        {
            Halt(error);
            return error.Status == 401 || error.Code == "SESSION_REVOKED"
                ? ScreenCommandResult.Expired(error.Message)
                : ScreenCommandResult.Fail(error.Message);
        }
        if (IsTransient(error))
        {
            Publish(new ScreenShareSnapshot { Phase = "offline", Message = error.Message, CanStop = !string.IsNullOrWhiteSpace(_sessionId), SessionId = _sessionId });
            return ScreenCommandResult.Fail(error.Message);
        }
        return ScreenCommandResult.Fail(error.Message);
    }

    private void Halt(TrilezApiException error)
    {
        Volatile.Write(ref _stopRequested, 1);
        lock (_startLock) { _started = false; }
        _pollTicker.Stop();
        StopFrameTicker();
        StopCapture();
        _localAccepted = false;
        _sessionId = null;
        Publish(ScreenShareSnapshot.Stopped(error.Message));
        _onAuthorization?.Invoke(error);
    }

    private void EnsureFrameTicker(TimeSpan interval)
    {
        if (Volatile.Read(ref _stopRequested) == 1) return;
        if (_frameRunning && _activeFrameInterval == interval) return;
        _activeFrameInterval = interval;
        _frameRunning = true;
        _frameTicker.Start(interval, FrameAsync);
    }

    private void StopFrameTicker()
    {
        _frameRunning = false;
        _frameTicker.Stop();
    }

    private static bool IsTerminal(TrilezApiException error) =>
        error.Code is "DEVICE_REVOKED" or "DEVICE_CREDENTIAL_REJECTED" or "DEVICE_DISABLED" or "SCREEN_CAPABILITY" or "SESSION_REVOKED"
        || error.Status == 401;

    private static bool IsTransient(TrilezApiException error) =>
        error.Status is 0 or 408 or 429 || error.Status >= 500 || error.Code == "OFFLINE";

    private ScreenShareSnapshot Describe(ScreenSession session, bool canAccept, bool canStop, string? endedOverride = null)
    {
        var phase = endedOverride is null ? (session.State ?? "idle") : "ended";
        var reason = endedOverride ?? session.EndReason;
        return new ScreenShareSnapshot
        {
            Phase = phase,
            SessionId = session.Id,
            SupportName = session.SupportName,
            RequestedAt = session.RequestedAt,
            StartedAt = session.StartedAt,
            EndedAt = endedOverride is null ? session.EndedAt : DateTimeOffset.UtcNow,
            EndReason = reason,
            Message = phase switch
            {
                "requested" => "تا پذیرش شما تصویری گرفته نمی‌شود.",
                "active" => "در حال فرستادن تصویر برای کمک پشتیبانی.",
                "ended" => ReasonText(reason),
                _ => null,
            },
            CanAccept = canAccept,
            CanStop = canStop,
            ControlState = string.IsNullOrWhiteSpace(session.ControlState) ? "off" : session.ControlState,
            ControlGrantId = session.ControlGrantId,
            ControlExpiresAt = session.ControlExpiresAt,
            InputPlane = string.IsNullOrWhiteSpace(session.InputPlane) ? "unavailable" : session.InputPlane,
            PermittedCapabilities = session.PermittedCapabilities ?? [],
        };
    }

    private static string ReasonText(string? reason) => reason switch
    {
        "employee_stop" => "شما اشتراک را متوقف کردید.",
        "rejected" => "درخواست پشتیبانی رد شد.",
        "shutdown" => "برنامه بسته شد و اشتراک پایان یافت.",
        "agent_lost" => "ارتباط عامل قطع شد و اشتراک پایان یافت.",
        "support_end" => "پشتیبان جلسه را پایان داد.",
        "timeout" => "مهلت جلسه تمام شد.",
        _ => "جلسه اشتراک پایان یافت.",
    };

    private void Publish(ScreenShareSnapshot snapshot)
    {
        var metrics = _rate.Metrics;
        var effective = _rate.Effective;
        var controlState = snapshot.ControlState ?? (string.IsNullOrWhiteSpace(_lastSession?.ControlState) ? "off" : _lastSession!.ControlState!);
        var grantId = snapshot.ControlGrantId ?? _lastSession?.ControlGrantId;
        var permitted = snapshot.PermittedCapabilities is { Count: > 0 } ? snapshot.PermittedCapabilities : _lastSession?.PermittedCapabilities ?? [];
        var expires = snapshot.ControlExpiresAt ?? _lastSession?.ControlExpiresAt;
        var decision = RemoteInputGate.Evaluate(
            permitted.Contains("remote-control"),
            _lastSession?.State,
            controlState,
            grantId,
            grantId,
            expires,
            DateTimeOffset.UtcNow);
        Snapshot = new ScreenShareSnapshot
        {
            Phase = snapshot.Phase,
            SessionId = snapshot.SessionId,
            SupportName = snapshot.SupportName,
            RequestedAt = snapshot.RequestedAt,
            StartedAt = snapshot.StartedAt,
            EndedAt = snapshot.EndedAt,
            EndReason = snapshot.EndReason,
            Message = snapshot.Message,
            CanAccept = snapshot.CanAccept,
            CanStop = snapshot.CanStop,
            ControlState = controlState,
            ControlGrantId = grantId,
            ControlExpiresAt = expires,
            InputPlane = snapshot.InputPlane ?? "unavailable",
            InputBlockedReason = decision.Reason,
            PermittedCapabilities = permitted,
            CanGrantControl = snapshot.Phase == "active" && controlState == "requested" && !string.IsNullOrWhiteSpace(grantId),
            CanDenyControl = snapshot.Phase == "active" && controlState == "requested" && !string.IsNullOrWhiteSpace(grantId),
            CanRevokeControl = snapshot.Phase == "active" && (controlState == "requested" || controlState == "granted"),
            RequestedMode = _rate.Configured.Mode,
            EffectiveMode = effective.Mode,
            FellBack = effective.FellBack,
            TargetFps = _rate.Configured.MaxFps,
            EffectiveFps = effective.Fps,
            EffectiveEdge = effective.Edge,
            EffectiveQuality = effective.Quality,
            ActualFps = metrics.ActualFps,
            LatencyMs = metrics.LatencyMs,
            BandwidthBytesPerSecond = metrics.BandwidthBytesPerSecond,
            CaptureFailures = metrics.CaptureFailures,
            DroppedFrames = metrics.DroppedFrames,
            MonitorCount = _capturer.MonitorCount,
        };
        Changed?.Invoke(this, EventArgs.Empty);
    }
}
