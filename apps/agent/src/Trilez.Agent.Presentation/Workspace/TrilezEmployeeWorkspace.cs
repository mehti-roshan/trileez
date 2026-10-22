namespace Trilez.Agent.Presentation;

public delegate TrilezApiClient ApiClientFactory(string apiBaseUrl, SessionState session);

/// <summary>
/// Owns the in-memory session and the core API client. The desktop binds to view models, which call this type.
/// Passwords and access tokens are never written to <see cref="AgentSettings"/>.
/// </summary>
public sealed partial class TrilezEmployeeWorkspace : IEmployeeWorkspace
{
    private readonly IAgentSettingsStore _settings;
    private readonly ApiClientFactory _clientFactory;
    private readonly IDeviceCredentialStore _devices;
    private readonly IHeartbeatTicker _heartbeat;
    private readonly UsageCollector? _usage;
    private readonly HealthReporter? _health;
    private readonly ScreenShareCoordinator? _screen;
    private readonly DiagnosticLog? _log;
    private readonly IStartupRegistration? _startup;
    private SessionState? _session;
    private TrilezApiClient? _client;
    private bool _beatOffline;

    public TrilezEmployeeWorkspace(
        IAgentSettingsStore settings,
        ApiClientFactory? clientFactory = null,
        IDeviceCredentialStore? devices = null,
        IHeartbeatTicker? heartbeat = null,
        IForegroundProbe? foreground = null,
        IUsageSignals? usageSignals = null,
        IUsageClock? usageClock = null,
        IHeartbeatTicker? usageTicker = null,
        IUsageQueueStore? usageQueue = null,
        TimeSpan? usageSampleInterval = null,
        TimeSpan? usagePolicyRefresh = null,
        IHealthProbe? healthProbe = null,
        IHeartbeatTicker? healthTicker = null,
        IHealthQueueStore? healthQueue = null,
        TimeSpan? healthSampleInterval = null,
        Func<int, int>? healthJitter = null,
        IScreenCapturer? screenCapturer = null,
        IHeartbeatTicker? screenPollTicker = null,
        IHeartbeatTicker? screenFrameTicker = null,
        TimeSpan? screenPollInterval = null,
        TimeSpan? screenFrameInterval = null,
        DiagnosticLog? diagnosticLog = null,
        IStartupRegistration? startup = null)
    {
        _settings = settings ?? throw new ArgumentNullException(nameof(settings));
        _clientFactory = clientFactory ?? TrilezApiClient.Create;
        _devices = devices ?? new MemoryDeviceCredentialStore();
        _heartbeat = heartbeat ?? new IdleHeartbeatTicker();
        _log = diagnosticLog;
        _startup = startup;
        CurrentSettings = settings.Load();
        Enrollment = DeviceEnrollmentSnapshot.Unenrolled();
        if (startup is not null && CurrentSettings.StartWithWindows)
        {
            try
            {
                startup.Apply(true);
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or InvalidOperationException)
            {
                _log?.Write("startup", "startup registration failed " + error.GetType().Name);
            }
        }
        _log?.Write("startup", "version=" + AgentInfo.Version);
        if (foreground is not null)
        {
            _usage = new UsageCollector(
                foreground,
                usageSignals,
                usageClock ?? new SystemUsageClock(),
                usageTicker ?? new IdleHeartbeatTicker(),
                usageQueue ?? new MemoryUsageQueueStore(),
                UsageChannelOrNull,
                usageSampleInterval,
                usagePolicyRefresh,
                HandleUsageAuthorization);
            _usage.Changed += (_, _) => UsageChanged?.Invoke(this, EventArgs.Empty);
        }
        if (healthProbe is not null)
        {
            _health = new HealthReporter(
                healthProbe,
                usageClock ?? new SystemUsageClock(),
                healthTicker ?? new IdleHeartbeatTicker(),
                healthQueue ?? new MemoryHealthQueueStore(),
                HealthChannelOrNull,
                healthSampleInterval,
                healthJitter,
                HandleUsageAuthorization);
            _health.Changed += (_, _) => HealthChanged?.Invoke(this, EventArgs.Empty);
        }
        if (screenCapturer is not null)
        {
            _screen = new ScreenShareCoordinator(
                screenCapturer,
                screenPollTicker ?? new IdleHeartbeatTicker(),
                screenFrameTicker ?? new IdleHeartbeatTicker(),
                ScreenChannelOrNull,
                HandleUsageAuthorization,
                screenPollInterval,
                screenFrameInterval);
            _screen.Changed += (_, _) => ScreenShareChanged?.Invoke(this, EventArgs.Empty);
        }
    }

    public AgentSettings CurrentSettings { get; private set; }

    public bool IsSignedIn => _client is not null && !string.IsNullOrWhiteSpace(_session?.AccessToken);

    public DateTimeOffset? LastSuccessfulSyncUtc => CurrentSettings.LastSuccessfulSyncUtc;

    public DeviceEnrollmentSnapshot Enrollment { get; private set; }

    public UsageSnapshot Usage => _usage?.Snapshot ?? UsageSnapshot.Stopped(PresentationText.UsageUnavailable);

    public HealthSnapshot Health => _health?.Snapshot ?? HealthSnapshot.Stopped(PresentationText.HealthUnavailable);

    public ScreenShareSnapshot ScreenShare => _screen?.Snapshot ?? ScreenShareSnapshot.Unavailable();

    public event EventHandler? EnrollmentChanged;

    public event EventHandler? UsageChanged;

    public event EventHandler? HealthChanged;

    public event EventHandler? ScreenShareChanged;

    public async Task<SignInResult> SignInAsync(string apiBaseUrl, string email, string password, CancellationToken cancellationToken = default)
    {
        TrilezApiClient client;
        SessionState session;
        try
        {
            session = new SessionState();
            client = _clientFactory(apiBaseUrl, session);
        }
        catch (ArgumentException)
        {
            return SignInResult.Fail(PresentationText.InvalidUrl);
        }

        try
        {
            await client.LoginAsync(email, password, cancellationToken);
            var sync = await new EmployeeDashboardService(client).SyncAsync(cancellationToken);
            if (sync.Dashboard is null)
            {
                session.Clear();
                return SignInResult.Fail(sync.Error?.Message ?? UserMessages.For(0, "OFFLINE"));
            }

            _session = session;
            _client = client;
            var previousSync = CurrentSettings.LastSuccessfulSyncUtc;
            CurrentSettings = CurrentSettings.WithConnection(Origin(apiBaseUrl), IsClean(sync) ? DateTimeOffset.UtcNow : previousSync);
            await PersistQuietlyAsync(cancellationToken);
            _log?.Write("connection", "sign-in ok");
            if (sync.Dashboard.PasswordChangeRequired) RememberBlockedEnrollment();
            else await AttachStoredEnrollmentAsync(cancellationToken);
            return SignInResult.Ok(sync.Dashboard);
        }
        catch (TrilezApiException error)
        {
            session.Clear();
            _log?.Write("connection", "sign-in failed status=" + error.Status + " code=" + (error.Code ?? ""));
            return SignInResult.Fail(error.Message);
        }
        catch (ArgumentException)
        {
            session.Clear();
            return SignInResult.Fail(PresentationText.InvalidUrl);
        }
    }

    public async Task SignOutAsync(CancellationToken cancellationToken = default)
    {
        _log?.Write("shutdown", "sign-out version=" + AgentInfo.Version);
        StopHeartbeat();
        await FinishUsageAsync("stop", cancellationToken);
        await StopScreenAsync("shutdown", cancellationToken);
        StopHealth("stopped");
        var client = _client;
        var session = _session;
        var local = _devices.Load();
        _client = null;
        _session = null;
        SetEnrollment(DeviceEnrollmentSnapshot.Unenrolled());
        try
        {
            if (client is not null && local is not null && !string.IsNullOrWhiteSpace(local.EnrollmentId) && !string.IsNullOrWhiteSpace(local.Secret) && local.Status is null or "active")
                await client.DisconnectAgentDeviceAsync(local.EnrollmentId, local.Secret, cancellationToken);
        }
        catch (TrilezApiException)
        {
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
        }
        try
        {
            if (client is not null)
                await client.LogoutAsync(cancellationToken);
        }
        catch (TrilezApiException)
        {
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
        }
        finally
        {
            session?.Clear();
        }
    }

    public async Task<EmployeeSync> RefreshAsync(CancellationToken cancellationToken = default)
    {
        if (_client is null || string.IsNullOrWhiteSpace(_session?.AccessToken))
            return ExpiredSync();

        var sync = await new EmployeeDashboardService(_client).SyncAsync(cancellationToken);
        if (sync.Dashboard is null && sync.Connection is ConnectionState.SessionExpired or ConnectionState.Unauthorized)
            LoseSession(sync.Error?.Status ?? 401, sync.Error?.Code ?? "SESSION_REVOKED");
        else if (sync.Dashboard?.PasswordChangeRequired == true)
            RememberBlockedEnrollment();
        else if (sync.Dashboard is not null)
            await AttachStoredEnrollmentAsync(cancellationToken);
        if (IsClean(sync))
        {
            CurrentSettings = CurrentSettings.WithConnection(CurrentSettings.ApiBaseUrl, DateTimeOffset.UtcNow);
            await PersistQuietlyAsync(cancellationToken);
        }
        return sync;
    }

    public async Task<TimeEntrySubmission> SubmitTimeEntryAsync(TimeEntryDraft draft, CancellationToken cancellationToken = default)
    {
        if (_client is null || string.IsNullOrWhiteSpace(_session?.AccessToken))
            return TimeEntrySubmission.Expired(UserMessages.For(401, "SESSION_REVOKED"));

        try
        {
            var record = await _client.CreateTimeEntryAsync(draft, cancellationToken);
            if (string.IsNullOrWhiteSpace(record.Id))
                return TimeEntrySubmission.Fail(UserMessages.For(500, null));
            return TimeEntrySubmission.Ok(record);
        }
        catch (TrilezApiException error) when (error.Status == 401 || error.Code == "SESSION_REVOKED")
        {
            LoseSession(error);
            return TimeEntrySubmission.Expired(error.Message);
        }
        catch (TrilezApiException error)
        {
            return TimeEntrySubmission.Fail(error.Message);
        }
        catch (ArgumentException)
        {
            return TimeEntrySubmission.Fail(UserMessages.For(400, null));
        }
    }

    public Task<UsageCommandResult> SetUsagePausedAsync(bool paused, CancellationToken cancellationToken = default)
    {
        if (_usage is null) return Task.FromResult(UsageCommandResult.Fail(PresentationText.UsageUnavailable));
        if (!IsSignedIn) return Task.FromResult(UsageCommandResult.Expired(UserMessages.For(401, "SESSION_REVOKED")));
        return _usage.SetPausedAsync(paused, cancellationToken);
    }

    public Task ShutdownUsageAsync(CancellationToken cancellationToken = default) => FinishUsageAsync("shutdown", cancellationToken);

    public void StopHealthReporting() => StopHealth("stopped");

    public void StopScreenCapture() => _screen?.StopCapture();

    public Task StopScreenShareAsync(string reason, CancellationToken cancellationToken = default) => StopScreenAsync(reason, cancellationToken);

    public Task<ScreenCommandResult> AcceptScreenShareAsync(CancellationToken cancellationToken = default)
    {
        if (_screen is null) return Task.FromResult(ScreenCommandResult.Fail(PresentationText.ScreenShareUnavailable));
        if (!IsSignedIn) return Task.FromResult(ScreenCommandResult.Expired(UserMessages.For(401, "SESSION_REVOKED")));
        return _screen.AcceptAsync(cancellationToken);
    }

    public Task<ScreenCommandResult> StopScreenShareAsync(CancellationToken cancellationToken = default)
    {
        if (_screen is null) return Task.FromResult(ScreenCommandResult.Fail(PresentationText.ScreenShareUnavailable));
        if (!IsSignedIn) return Task.FromResult(ScreenCommandResult.Expired(UserMessages.For(401, "SESSION_REVOKED")));
        var reason = _screen.Snapshot.Phase == "requested" ? "rejected" : "employee_stop";
        return _screen.StopSharingAsync(reason, cancellationToken);
    }

    public Task<ScreenCommandResult> DecideScreenControlAsync(string action, CancellationToken cancellationToken = default)
    {
        if (_screen is null) return Task.FromResult(ScreenCommandResult.Fail(PresentationText.ScreenControlUnavailable));
        if (!IsSignedIn) return Task.FromResult(ScreenCommandResult.Expired(UserMessages.For(401, "SESSION_REVOKED")));
        return _screen.DecideControlAsync(action, cancellationToken);
    }

    public async Task SaveSettingsAsync(AgentSettings settings, CancellationToken cancellationToken = default)
    {
        var next = new AgentSettings
        {
            ApiBaseUrl = Origin(settings.ApiBaseUrl),
            LastSuccessfulSyncUtc = settings.LastSuccessfulSyncUtc,
            StartWithWindows = settings.StartWithWindows,
        };
        await _settings.SaveAsync(next, cancellationToken);
        CurrentSettings = next;
        _startup?.Apply(next.StartWithWindows);
    }

    private async Task PersistQuietlyAsync(CancellationToken cancellationToken)
    {
        try
        {
            await _settings.SaveAsync(CurrentSettings, cancellationToken);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
        }
    }

    private void LoseSession(TrilezApiException error) => LoseSession(error.Status, error.Code);

    private void LoseSession(int status, string? code)
    {
        _log?.Write("connection", "session expired status=" + status + " code=" + (code ?? ""));
        DropSession();
    }

    private void DropSession()
    {
        StopHeartbeat();
        StopUsage("stop");
        StopScreenLocal();
        StopHealth("stopped");
        _session?.Clear();
        _session = null;
        _client = null;
        SetEnrollment(DeviceEnrollmentSnapshot.Unenrolled());
    }

    private UsageChannel? UsageChannelOrNull()
    {
        if (_client is null || string.IsNullOrWhiteSpace(_session?.AccessToken)) return null;
        var local = _devices.Load();
        if (local is null || string.IsNullOrWhiteSpace(local.EnrollmentId) || string.IsNullOrWhiteSpace(local.Secret)) return null;
        return new UsageChannel
        {
            Client = _client,
            DeviceId = local.EnrollmentId,
            Credential = local.Secret,
            Active = local.Status is null or "active",
        };
    }

    private HealthChannel? HealthChannelOrNull()
    {
        if (_client is null || string.IsNullOrWhiteSpace(_session?.AccessToken)) return null;
        var local = _devices.Load();
        if (local is null || string.IsNullOrWhiteSpace(local.EnrollmentId) || string.IsNullOrWhiteSpace(local.Secret)) return null;
        return new HealthChannel
        {
            Client = _client,
            DeviceId = local.EnrollmentId,
            Credential = local.Secret,
            Active = local.Status is null or "active",
            ConnectionStatus = Enrollment.ConnectionStatus,
            LastSeenAt = Enrollment.LastSeenAt,
            CollectorPhase = _usage?.Snapshot.Phase ?? "stopped",
        };
    }

    private Task FinishUsageAsync(string reason, CancellationToken cancellationToken) =>
        _usage?.ShutdownAsync(reason, cancellationToken) ?? Task.CompletedTask;

    private void StartUsage() => _usage?.Start();

    private void StopUsage(string reason) => _usage?.StopLocal(reason);

    private void StartHealth() => _health?.Start();

    private void StopHealth(string phase) => _health?.Stop(phase);

    private void StartScreen() => _screen?.Start();

    private void StopScreenLocal() => _screen?.StopLocal();

    private Task StopScreenAsync(string reason, CancellationToken cancellationToken) =>
        _screen?.StopAsync(reason, cancellationToken) ?? Task.CompletedTask;

    private ScreenChannel? ScreenChannelOrNull()
    {
        if (_client is null || string.IsNullOrWhiteSpace(_session?.AccessToken)) return null;
        var local = _devices.Load();
        if (local is null || string.IsNullOrWhiteSpace(local.EnrollmentId) || string.IsNullOrWhiteSpace(local.Secret)) return null;
        return new ScreenChannel
        {
            Client = _client,
            DeviceId = local.EnrollmentId,
            Credential = local.Secret,
            Active = local.Status is null or "active",
        };
    }

    private static bool IsClean(EmployeeSync sync) =>
        sync.Connection == ConnectionState.Connected
        && sync.Dashboard is not null
        && !sync.Dashboard.PasswordChangeRequired
        && sync.Dashboard.Errors.Count == 0;

    private static string Origin(string apiBaseUrl) =>
        TrilezApiClient.NormalizeBase(apiBaseUrl).GetLeftPart(UriPartial.Authority);

    private static EmployeeSync ExpiredSync() => new()
    {
        Connection = ConnectionState.SessionExpired,
        Error = new SyncError
        {
            Source = "sync",
            Status = 401,
            Code = "SESSION_REVOKED",
            Message = UserMessages.For(401, "SESSION_REVOKED"),
        },
    };
}
