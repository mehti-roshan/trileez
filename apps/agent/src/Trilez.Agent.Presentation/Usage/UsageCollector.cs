namespace Trilez.Agent.Presentation;

public interface IForegroundProbe
{
    UsageObservation Read(TimeSpan idleThreshold);
}

public interface IUsageSignals
{
    bool Locked { get; }
    UsageBoundary ConsumeBoundary();
}

public sealed class UsageChannel
{
    public required TrilezApiClient Client { get; init; }
    public required string DeviceId { get; init; }
    public required string Credential { get; init; }
    public bool Active { get; init; }
}

/// <summary>
/// Samples foreground usage on a background ticker, keeps an offline queue, and uploads bounded batches.
/// The desktop shell only reads <see cref="Snapshot"/>.
/// </summary>
public sealed class UsageCollector
{
    private readonly IForegroundProbe _probe;
    private readonly IUsageSignals? _signals;
    private readonly IUsageClock _clock;
    private readonly IHeartbeatTicker _ticker;
    private readonly IUsageQueueStore _store;
    private readonly Func<UsageChannel?> _channel;
    private readonly Action<TrilezApiException>? _onAuthorization;
    private readonly TimeSpan _sampleInterval;
    private readonly TimeSpan _policyRefresh;
    public const int MaxQueuedIntervals = 500;
    public const int MaxQueuedSessions = 80;
    public const int MaxQueuedBytes = 512 * 1024;
    public const int MaxRetentionDays = 30;
    public const string IncompleteUploadMessage = "بخشی از نمونه‌های استفاده تأیید نشد و دوباره ارسال می‌شود.";

    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly object _startLock = new();
    private UsageAggregator? _aggregator;
    private DateTimeOffset? _lastUploadAttempt;
    private volatile bool _started;

    public UsageCollector(
        IForegroundProbe probe,
        IUsageSignals? signals,
        IUsageClock clock,
        IHeartbeatTicker ticker,
        IUsageQueueStore store,
        Func<UsageChannel?> channel,
        TimeSpan? sampleInterval = null,
        TimeSpan? policyRefresh = null,
        Action<TrilezApiException>? onAuthorization = null)
    {
        _probe = probe ?? throw new ArgumentNullException(nameof(probe));
        _signals = signals;
        _clock = clock ?? throw new ArgumentNullException(nameof(clock));
        _ticker = ticker ?? throw new ArgumentNullException(nameof(ticker));
        _store = store ?? throw new ArgumentNullException(nameof(store));
        _channel = channel ?? throw new ArgumentNullException(nameof(channel));
        _onAuthorization = onAuthorization;
        _sampleInterval = sampleInterval is { } interval && interval > TimeSpan.Zero ? interval : TimeSpan.FromSeconds(1);
        _policyRefresh = policyRefresh ?? TimeSpan.FromSeconds(60);
        Snapshot = UsageSnapshot.Stopped();
    }

    public UsageSnapshot Snapshot { get; private set; }
    public event EventHandler? Changed;

    public void Start()
    {
        lock (_startLock)
        {
            if (_started) return;
            _started = true;
        }
        var state = _store.Load();
        if (state.Policy.FetchedAt is DateTimeOffset fetched && _clock.UtcNow - fetched < _policyRefresh && (!state.Policy.Enabled || state.Policy.Paused))
        {
            Halt();
            Publish(state, state.Policy.Paused ? "paused" : "disabled", state.Message);
            Persist(state);
            return;
        }
        CloseOpen(state, "restart");
        Persist(state);
        _aggregator = new UsageAggregator(_clock, _sampleInterval);
        _ticker.Start(_sampleInterval, TickAsync);
    }

    public void StopLocal(string reason)
    {
        lock (_startLock) { _started = false; }
        _ticker.Stop();
        var state = _store.Load();
        Finish(state, reason);
        Publish(state, "stopped", state.Message);
        Persist(state);
    }

    public async Task ShutdownAsync(string reason, CancellationToken cancellationToken = default)
    {
        lock (_startLock) { _started = false; }
        _ticker.Stop();
        await _gate.WaitAsync(cancellationToken);
        try
        {
            var state = _store.Load();
            Finish(state, reason);
            var channel = _channel();
            if (channel is { Active: true }) await Upload(state, channel, force: true, cancellationToken);
            Publish(state, "stopped", null);
            Persist(state);
        }
        finally { _gate.Release(); }
    }

    public async Task FlushAsync(CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            var state = _store.Load();
            if (_aggregator is not null) Merge(state);
            var channel = _channel();
            var phase = state.Phase;
            if (channel is { Active: true })
            {
                var ok = await Upload(state, channel, force: true, cancellationToken);
                phase = ok ? (state.Policy.Paused ? "paused" : state.Policy.Enabled ? "running" : "disabled") : "offline";
            }
            Publish(state, phase, state.Message);
            Persist(state);
        }
        finally { _gate.Release(); }
    }

    public async Task<UsageCommandResult> SetPausedAsync(bool paused, CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            var state = _store.Load();
            if (state.Policy.FetchedAt is null || !state.Policy.EmployeeMayPause)
                return UsageCommandResult.Fail(UserMessages.For(403, "USAGE_PAUSE_NOT_ALLOWED"));
            var channel = _channel();
            if (channel is not { Active: true })
                return UsageCommandResult.Expired(UserMessages.For(401, "SESSION_REVOKED"));
            try
            {
                await channel.Client.SetUsagePausedAsync(channel.DeviceId, channel.Credential, paused, cancellationToken);
            }
            catch (TrilezApiException error) when (error.Code == "DEVICE_CREDENTIAL_REJECTED")
            {
                return UsageCommandResult.Fail(error.Message);
            }
            catch (TrilezApiException error) when (error.Status == 0 || error.Status >= 500)
            {
                state.Policy.Paused = paused;
                if (paused)
                {
                    Finish(state, "manual");
                    lock (_startLock) { _started = false; }
                    _ticker.Stop();
                }
                Publish(state, paused ? "paused" : "offline", "تغییر وضعیت ذخیره شد و با اتصال بعدی همگام می‌شود.");
                Persist(state);
                if (!paused) Start();
                return UsageCommandResult.Ok(paused ? PresentationText.UsagePaused : PresentationText.UsageResumed);
            }
            catch (TrilezApiException error) when (error.Status == 401 || error.Code == "SESSION_REVOKED")
            {
                _onAuthorization?.Invoke(error);
                return UsageCommandResult.Expired(error.Message);
            }
            catch (TrilezApiException error)
            {
                return UsageCommandResult.Fail(error.Message);
            }
            state.Policy.Paused = paused;
            if (paused)
            {
                Finish(state, "manual");
                lock (_startLock) { _started = false; }
                _ticker.Stop();
            }
            Publish(state, paused ? "paused" : "running", null);
            Persist(state);
            if (!paused) Start();
            return UsageCommandResult.Ok(paused ? PresentationText.UsagePaused : PresentationText.UsageResumed);
        }
        finally { _gate.Release(); }
    }

    private async Task TickAsync(CancellationToken cancellationToken)
    {
        if (!await _gate.WaitAsync(0, cancellationToken)) return;
        try { await TickCoreAsync(cancellationToken); }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
        catch (Exception)
        {
            var state = _store.Load();
            Publish(state, "offline", PresentationText.GenericFailure);
            Persist(state);
        }
        finally { _gate.Release(); }
    }

    private async Task TickCoreAsync(CancellationToken cancellationToken)
    {
        if (!_started) return;
        var channel = _channel();
        var state = _store.Load();
        if (channel is null)
        {
            Publish(state, "stopped", null);
            Persist(state);
            return;
        }
        if (!string.IsNullOrWhiteSpace(state.DeviceId) && state.DeviceId != channel.DeviceId)
        {
            state.Intervals.Clear();
            state.Sessions.Clear();
            _aggregator = new UsageAggregator(_clock, _sampleInterval);
        }
        state.DeviceId = channel.DeviceId;
        if (!channel.Active)
        {
            Finish(state, "disabled");
            Halt();
            Publish(state, "disabled", UserMessages.For(403, "DEVICE_DISABLED"));
            Persist(state);
            return;
        }
        if (state.Policy.FetchedAt is null || _clock.UtcNow - state.Policy.FetchedAt.Value >= _policyRefresh)
        {
            try
            {
                ApplyPolicy(state, await channel.Client.GetUsagePolicyAsync(channel.DeviceId, channel.Credential, cancellationToken), _clock.UtcNow);
            }
            catch (TrilezApiException error) when (error.Status == 401 || error.Code is "SESSION_REVOKED" or "DEVICE_REVOKED" or "DEVICE_CREDENTIAL_REJECTED")
            {
                Finish(state, "stop");
                Halt();
                Publish(state, "stopped", error.Message);
                Persist(state);
                _onAuthorization?.Invoke(error);
                return;
            }
            catch (TrilezApiException error)
            {
                Publish(state, state.Policy.FetchedAt is null ? "offline" : "offline", error.Message);
                Persist(state);
                if (state.Policy.FetchedAt is null) return;
            }
        }
        if (!state.Policy.Enabled || state.Policy.Paused)
        {
            Finish(state, state.Policy.Paused ? "manual" : "disabled");
            var uploaded = await Upload(state, channel, force: true, cancellationToken);
            Halt();
            Publish(state, state.Policy.Paused ? "paused" : "disabled", uploaded ? UserMessages.For(403, state.Policy.Paused ? "USAGE_PAUSED" : "USAGE_DISABLED") : state.Message);
            Persist(state);
            return;
        }
        var boundary = _signals?.ConsumeBoundary() ?? UsageBoundary.None;
        if (_signals?.Locked == true && boundary == UsageBoundary.None) boundary = UsageBoundary.Lock;
        UsageObservation sample;
        try
        {
            sample = _probe.Read(TimeSpan.FromSeconds(Math.Clamp(state.Policy.IdleThresholdSeconds, 30, 1800)));
        }
        catch (Exception)
        {
            sample = new UsageObservation(null, null, true, UsageBoundary.None);
        }
        if (boundary != UsageBoundary.None) sample = sample with { Boundary = boundary };
        _aggregator ??= new UsageAggregator(_clock, _sampleInterval);
        if (_aggregator.Session is not { Open: true } && sample.Boundary == UsageBoundary.None && !sample.InputIdle && UsageAggregator.TryProcess(sample.ProcessName, out _))
            _aggregator.StartSession();
        _aggregator.Observe(sample);
        Merge(state);
        state.LastSampleAt = _aggregator.LastSampleAt ?? state.LastSampleAt;
        var ok = await Upload(state, channel, force: false, cancellationToken);
        Publish(state, ok ? "running" : "offline", ok ? null : state.Message);
        Persist(state);
    }

    private async Task<bool> Upload(UsageQueueState state, UsageChannel channel, bool force, CancellationToken cancellationToken)
    {
        Trim(state, _clock.UtcNow);
        var pendingSession = state.Sessions.FirstOrDefault(session =>
            state.Intervals.Any(interval => interval.ClientSessionId == session.ClientSessionId) || !session.Uploaded);
        if (pendingSession is null) return true;
        var pending = state.Intervals.Count(interval => interval.ClientSessionId == pendingSession.ClientSessionId);
        var now = _clock.UtcNow;
        if (!force && pending < 20 && pendingSession.Open && _lastUploadAttempt is DateTimeOffset attempt && now - attempt < TimeSpan.FromSeconds(60))
            return true;
        var intervals = state.Intervals.Where(interval => interval.ClientSessionId == pendingSession.ClientSessionId).Take(40).ToList();
        if (!force && intervals.Count == 0 && (pendingSession.Open || pendingSession.Uploaded)) return true;
        _lastUploadAttempt = now;
        try
        {
            var result = await channel.Client.UploadUsageBatchAsync(channel.DeviceId, channel.Credential, new UsageBatchRequest
            {
                Session = new UsageBatchSession
                {
                    ClientSessionId = pendingSession.ClientSessionId,
                    StartedAt = pendingSession.StartedAt,
                    EndedAt = pendingSession.EndedAt,
                    EndReason = pendingSession.EndReason,
                },
                Intervals = intervals.Select(interval => new UsageBatchInterval
                {
                    ClientIntervalId = interval.ClientIntervalId,
                    ProcessName = interval.ProcessName,
                    DisplayName = interval.DisplayName,
                    StartedAt = interval.StartedAt,
                    DurationMs = interval.DurationMs,
                }).ToList(),
            }, cancellationToken);
            return Settle(state, pendingSession, intervals, result);
        }
        catch (TrilezApiException error) when (error.Status == 0 || error.Status >= 500)
        {
            state.Message = error.Message;
            return false;
        }
        catch (TrilezApiException error)
        {
            state.Message = error.Message;
            return false;
        }
    }

    /// <summary>
    /// Drops intervals the server accepted, duplicated, updated, or permanently rejected.
    /// Paused and disabled rows stay queued so a later policy change can store them.
    /// An acknowledgement that does not cover the batch leaves the rest queued.
    /// </summary>
    private bool Settle(UsageQueueState state, UsageSessionDraft pendingSession, List<UsageIntervalDraft> sent, UsageBatchResult result)
    {
        var drop = new HashSet<string>(StringComparer.Ordinal);
        var retry = new HashSet<string>(StringComparer.Ordinal);
        var posted = new HashSet<string>(StringComparer.Ordinal);
        foreach (var interval in sent)
        {
            if (!UsageAggregator.TryProcess(interval.ProcessName, out _) || interval.DurationMs < 1)
                drop.Add(interval.ClientIntervalId);
            else
                posted.Add(interval.ClientIntervalId);
        }
        var rejected = result.Rejected ?? [];
        var rejectedIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in rejected)
        {
            if (string.IsNullOrWhiteSpace(row.ClientIntervalId) || !posted.Contains(row.ClientIntervalId) || !rejectedIds.Add(row.ClientIntervalId)) continue;
            if (row.Code is "USAGE_PAUSED" or "USAGE_DISABLED") retry.Add(row.ClientIntervalId);
            else drop.Add(row.ClientIntervalId);
        }
        var acknowledged = result.Accepted + result.Duplicate + result.Updated + rejectedIds.Count;
        if (acknowledged >= posted.Count)
        {
            foreach (var id in posted)
                if (!retry.Contains(id)) drop.Add(id);
        }
        // Accepted rows stay in the open aggregator so later samples keep a cumulative duration.
        // Permanent rejects are forgotten immediately so the next merge cannot queue them again.
        var forget = new HashSet<string>(StringComparer.Ordinal);
        foreach (var id in drop)
            if (!posted.Contains(id) || rejectedIds.Contains(id) || !pendingSession.Open) forget.Add(id);
        if (forget.Count > 0) _aggregator?.Forget(forget);
        state.Intervals.RemoveAll(interval => drop.Contains(interval.ClientIntervalId));
        if (!pendingSession.Open && !state.Intervals.Exists(interval => interval.ClientSessionId == pendingSession.ClientSessionId))
            pendingSession.Uploaded = true;
        if (result.Accepted + result.Duplicate + result.Updated > 0 && result.LastSuccessfulUploadAt is DateTimeOffset uploaded)
            state.LastSuccessfulUploadAt = uploaded;
        var pendingLeft = sent.Exists(interval => !drop.Contains(interval.ClientIntervalId));
        if (!pendingLeft)
        {
            state.Message = null;
            return true;
        }
        var retryCode = rejected.FirstOrDefault(row => row.ClientIntervalId is not null && retry.Contains(row.ClientIntervalId))?.Code;
        state.Message = string.IsNullOrWhiteSpace(retryCode) ? IncompleteUploadMessage : UserMessages.For(403, retryCode);
        return false;
    }

    private void Persist(UsageQueueState state)
    {
        Trim(state, _clock.UtcNow);
        _store.Save(state);
    }

    private static void Trim(UsageQueueState state, DateTimeOffset now)
    {
        var retentionDays = state.Policy.RetentionDays;
        if (retentionDays < 1 || retentionDays > MaxRetentionDays) retentionDays = MaxRetentionDays;
        var cutoff = now.AddDays(-retentionDays);
        var protectedId = ProtectedIntervalId(state);
        state.Intervals.RemoveAll(interval =>
            !string.Equals(interval.ClientIntervalId, protectedId, StringComparison.Ordinal) && interval.StartedAt < cutoff);
        while (state.Intervals.Count > MaxQueuedIntervals || EstimateBytes(state) > MaxQueuedBytes)
        {
            UsageIntervalDraft? victim = null;
            foreach (var interval in state.Intervals)
            {
                if (string.Equals(interval.ClientIntervalId, protectedId, StringComparison.Ordinal)) continue;
                if (victim is null || interval.StartedAt < victim.StartedAt
                    || (interval.StartedAt == victim.StartedAt && string.CompareOrdinal(interval.ClientIntervalId, victim.ClientIntervalId) < 0))
                    victim = interval;
            }
            if (victim is null || !state.Intervals.Remove(victim)) break;
        }
        while (state.Sessions.Count > MaxQueuedSessions)
        {
            UsageSessionDraft? oldest = null;
            foreach (var session in state.Sessions)
            {
                if (session.Open) continue;
                if (oldest is null || session.StartedAt < oldest.StartedAt) oldest = session;
            }
            if (oldest is null) break;
            state.Intervals.RemoveAll(interval =>
                interval.ClientSessionId == oldest.ClientSessionId
                && !string.Equals(interval.ClientIntervalId, protectedId, StringComparison.Ordinal));
            state.Sessions.Remove(oldest);
        }
    }

    private static string? ProtectedIntervalId(UsageQueueState state)
    {
        var open = state.Sessions.FirstOrDefault(session => session.Open);
        if (open is null) return null;
        UsageIntervalDraft? newest = null;
        foreach (var interval in state.Intervals)
        {
            if (!string.Equals(interval.ClientSessionId, open.ClientSessionId, StringComparison.Ordinal)) continue;
            if (newest is null || interval.StartedAt > newest.StartedAt
                || (interval.StartedAt == newest.StartedAt && string.CompareOrdinal(interval.ClientIntervalId, newest.ClientIntervalId) > 0))
                newest = interval;
        }
        return newest?.ClientIntervalId;
    }

    private static long EstimateBytes(UsageQueueState state)
    {
        long total = 64;
        foreach (var session in state.Sessions)
        {
            total += 128;
            total += session.ClientSessionId.Length;
            total += session.EndReason?.Length ?? 0;
        }
        foreach (var interval in state.Intervals)
        {
            total += 160;
            total += interval.ClientIntervalId.Length;
            total += interval.ClientSessionId.Length;
            total += interval.ProcessName.Length;
            total += interval.DisplayName?.Length ?? 0;
        }
        return total;
    }

    private void Finish(UsageQueueState state, string reason)
    {
        if (_aggregator?.Session is { Open: true })
        {
            _aggregator.EndSession(reason);
            Merge(state);
            return;
        }
        CloseOpen(state, reason);
    }

    private void Merge(UsageQueueState state)
    {
        if (_aggregator?.Session is not UsageSessionDraft session) return;
        var index = state.Sessions.FindIndex(item => item.ClientSessionId == session.ClientSessionId);
        if (index < 0) state.Sessions.Add(Copy(session));
        else
        {
            var previous = state.Sessions[index];
            var copy = Copy(session);
            copy.Uploaded = previous.Uploaded && previous.Open == session.Open && previous.EndedAt == session.EndedAt;
            state.Sessions[index] = copy;
        }
        foreach (var interval in _aggregator.Intervals)
        {
            var existing = state.Intervals.FirstOrDefault(item => item.ClientIntervalId == interval.ClientIntervalId);
            if (existing is null) state.Intervals.Add(Copy(interval));
            else if (interval.DurationMs > existing.DurationMs)
            {
                existing.DurationMs = interval.DurationMs;
                existing.DisplayName ??= interval.DisplayName;
            }
        }
    }

    private static void CloseOpen(UsageQueueState state, string reason)
    {
        foreach (var session in state.Sessions.Where(item => item.Open))
        {
            session.Open = false;
            session.EndReason = reason;
            session.EndedAt = state.LastSampleAt ?? session.StartedAt;
            session.Uploaded = false;
        }
    }

    private void Halt()
    {
        lock (_startLock) { _started = false; }
        _ticker.Stop();
    }

    private static void ApplyPolicy(UsageQueueState state, UsagePolicyDocument policy, DateTimeOffset fetchedAt)
    {
        state.Policy.Enabled = policy.Enabled;
        state.Policy.EmployeeMayPause = policy.EmployeeMayPause;
        state.Policy.IdleThresholdSeconds = policy.IdleThresholdSeconds;
        state.Policy.BucketSeconds = policy.BucketSeconds > 0 ? policy.BucketSeconds : UsageAggregator.BucketSeconds;
        state.Policy.RetentionDays = policy.RetentionDays;
        state.Policy.Paused = policy.Paused;
        state.Policy.FetchedAt = fetchedAt;
    }

    private void Publish(UsageQueueState state, string phase, string? message)
    {
        state.Phase = phase;
        state.Message = message;
        var session = state.Sessions.LastOrDefault(item => item.Open) ?? state.Sessions.LastOrDefault();
        Snapshot = new UsageSnapshot
        {
            Phase = phase,
            SessionId = session?.ClientSessionId,
            SessionStartedAt = session?.StartedAt,
            SessionEndedAt = session?.EndedAt,
            EndReason = session?.EndReason,
            LastSampleAt = state.LastSampleAt,
            LastSuccessfulUploadAt = state.LastSuccessfulUploadAt,
            PendingIntervals = state.Intervals.Count,
            Message = message,
            CanPause = state.Policy is { Enabled: true, EmployeeMayPause: true, Paused: false } && phase is "running" or "offline",
            CanResume = state.Policy.EmployeeMayPause && state.Policy.Paused,
        };
        Changed?.Invoke(this, EventArgs.Empty);
    }

    private static UsageSessionDraft Copy(UsageSessionDraft session) => new()
    {
        ClientSessionId = session.ClientSessionId,
        StartedAt = session.StartedAt,
        EndedAt = session.EndedAt,
        EndReason = session.EndReason,
        Open = session.Open,
        Uploaded = session.Uploaded,
    };

    private static UsageIntervalDraft Copy(UsageIntervalDraft interval) => new()
    {
        ClientSessionId = interval.ClientSessionId,
        ClientIntervalId = interval.ClientIntervalId,
        ProcessName = interval.ProcessName,
        DisplayName = interval.DisplayName,
        StartedAt = interval.StartedAt,
        DurationMs = interval.DurationMs,
    };
}
