using System.Globalization;

namespace Trilez.Agent.Presentation;

public sealed class ShellViewModel : ObservableObject
{
    private readonly IEmployeeWorkspace _workspace;
    private readonly IClock _clock;
    private readonly List<WorkTask> _assignedTasks = [];
    private readonly List<ProjectSummary> _projects = [];
    private int _busyFlag;
    private string _employeeState = "none";

    private string _apiBaseUrl = "";
    private bool _startWithWindows;
    private string _email = "";
    private bool _isSignedIn;
    private bool _passwordChangeRequired;
    private bool _isBusy;
    private bool _isOffline;
    private ConnectionState _connection;
    private string _connectionLabel = PresentationText.SignedOutConnection;
    private string? _errorMessage;
    private string? _successMessage;
    private string? _warningMessage;
    private string _welcome = "";
    private string _identity = "";
    private string _employeeStateLabel = "";
    private string _todaySummary = "";
    private string _attendanceMessage = "";
    private string _workTimeMessage = "";
    private string _workSessionLabel = "";
    private string _tasksMessage = "";
    private string _projectsMessage = "";
    private string _meetingsMessage = "";
    private string _notificationsMessage = "";
    private string _deviceNote = "";
    private string _screenSharingNote = PresentationText.ScreenSharingOff;
    private string _deviceName = PresentationText.SuggestedDeviceName();
    private string _enrollmentStateLabel = PresentationText.EnrollmentPhase("unenrolled");
    private string _enrollmentConnectionLabel = "";
    private string _enrollmentDetail = "";
    private string _usagePhaseLabel = "";
    private string _usageDetail = "";
    private string _healthPhaseLabel = "";
    private string _healthDetail = "";
    private string _screenSharePhaseLabel = "";
    private string _screenShareModeLabel = "";
    private string _screenShareDetail = "";
    private string _screenControlLabel = "";
    private bool _screenCanAccept;
    private bool _screenCanStop;
    private bool _screenCanGrant;
    private bool _screenCanDeny;
    private bool _screenCanRevoke;
    private bool _usageCanPause;
    private bool _usageCanResume;
    private readonly SynchronizationContext? _ui = SynchronizationContext.Current;
    private string? _selectedTaskId;
    private string _entryDate = "";
    private string _entryHours = "";
    private string _entryDescription = "";
    private bool _entryBillable;
    private NavItem? _selectedNav;
    private IReadOnlyList<TaskRow> _tasks = [];
    private IReadOnlyList<ProjectRow> _projectRows = [];
    private IReadOnlyList<WorkLogRow> _workLogs = [];
    private IReadOnlyList<MeetingRow> _meetings = [];
    private IReadOnlyList<NotificationRow> _notifications = [];
    private IReadOnlyList<AttendanceRow> _attendance = [];

    public ShellViewModel(IEmployeeWorkspace workspace, IClock? clock = null)
    {
        _workspace = workspace ?? throw new ArgumentNullException(nameof(workspace));
        _clock = clock ?? new TehranClock();
        _apiBaseUrl = workspace.CurrentSettings.ApiBaseUrl ?? "";
        _startWithWindows = workspace.CurrentSettings.StartWithWindows;
        _workspace.EnrollmentChanged += (_, _) => PostEnrollment();
        _workspace.UsageChanged += (_, _) => PostUsage();
        _workspace.HealthChanged += (_, _) => PostHealth();
        _workspace.ScreenShareChanged += (_, _) => PostScreen();
        SelectedNav = Pages[0];
    }

    public IReadOnlyList<NavItem> Pages { get; } =
    [
        new NavItem { Page = AppPage.Overview, Title = "نمای کلی" },
        new NavItem { Page = AppPage.Tasks, Title = "وظیفه‌های من" },
        new NavItem { Page = AppPage.Projects, Title = "پروژه‌های من" },
        new NavItem { Page = AppPage.Attendance, Title = "حضور امروز" },
        new NavItem { Page = AppPage.WorkLogs, Title = "ساعت‌های کاری" },
        new NavItem { Page = AppPage.Meetings, Title = "جلسه‌ها" },
        new NavItem { Page = AppPage.Notifications, Title = "اعلان‌ها" },
        new NavItem { Page = AppPage.Settings, Title = "تنظیمات" },
        new NavItem { Page = AppPage.Help, Title = "راهنما و عیب‌یابی" },
    ];

    public string ApiBaseUrl { get => _apiBaseUrl; set => Set(ref _apiBaseUrl, value); }
    public bool StartWithWindows
    {
        get => _startWithWindows;
        set
        {
            if (!Set(ref _startWithWindows, value)) return;
            Raise(nameof(Diagnostics));
        }
    }
    public string Email { get => _email; set => Set(ref _email, value); }
    public bool IsSignedIn { get => _isSignedIn; private set => Set(ref _isSignedIn, value); }
    public bool PasswordChangeRequired { get => _passwordChangeRequired; private set => Set(ref _passwordChangeRequired, value); }
    public bool IsBusy { get => _isBusy; private set => Set(ref _isBusy, value); }
    public bool IsOffline { get => _isOffline; private set => Set(ref _isOffline, value); }
    public ConnectionState Connection { get => _connection; private set => Set(ref _connection, value); }
    public string ConnectionLabel { get => _connectionLabel; private set => Set(ref _connectionLabel, value); }
    public string? ErrorMessage { get => _errorMessage; private set => Set(ref _errorMessage, value); }
    public string? SuccessMessage { get => _successMessage; private set => Set(ref _successMessage, value); }
    public string? WarningMessage { get => _warningMessage; private set => Set(ref _warningMessage, value); }
    public string Welcome { get => _welcome; private set => Set(ref _welcome, value); }
    public string Identity { get => _identity; private set => Set(ref _identity, value); }
    public string EmployeeStateLabel { get => _employeeStateLabel; private set => Set(ref _employeeStateLabel, value); }
    public string TodaySummary { get => _todaySummary; private set => Set(ref _todaySummary, value); }
    public string AttendanceMessage { get => _attendanceMessage; private set => Set(ref _attendanceMessage, value); }
    public string WorkTimeMessage { get => _workTimeMessage; private set => Set(ref _workTimeMessage, value); }
    public string WorkSessionLabel { get => _workSessionLabel; private set => Set(ref _workSessionLabel, value); }
    public string TasksMessage { get => _tasksMessage; private set => Set(ref _tasksMessage, value); }
    public string ProjectsMessage { get => _projectsMessage; private set => Set(ref _projectsMessage, value); }
    public string MeetingsMessage { get => _meetingsMessage; private set => Set(ref _meetingsMessage, value); }
    public string NotificationsMessage { get => _notificationsMessage; private set => Set(ref _notificationsMessage, value); }
    public string DeviceNote { get => _deviceNote; private set => Set(ref _deviceNote, value); }
    public string ScreenSharingNote { get => _screenSharingNote; private set => Set(ref _screenSharingNote, value); }
    public string DeviceName { get => _deviceName; set => Set(ref _deviceName, value); }
    public string EnrollmentStateLabel { get => _enrollmentStateLabel; private set => Set(ref _enrollmentStateLabel, value); }
    public string EnrollmentConnectionLabel { get => _enrollmentConnectionLabel; private set => Set(ref _enrollmentConnectionLabel, value); }
    public string EnrollmentDetail { get => _enrollmentDetail; private set => Set(ref _enrollmentDetail, value); }
    public string UsagePhaseLabel { get => _usagePhaseLabel; private set => Set(ref _usagePhaseLabel, value); }
    public string UsageDetail { get => _usageDetail; private set => Set(ref _usageDetail, value); }
    public string HealthPhaseLabel { get => _healthPhaseLabel; private set => Set(ref _healthPhaseLabel, value); }
    public string HealthDetail { get => _healthDetail; private set => Set(ref _healthDetail, value); }
    public string ScreenSharePhaseLabel { get => _screenSharePhaseLabel; private set => Set(ref _screenSharePhaseLabel, value); }
    public string ScreenShareModeLabel { get => _screenShareModeLabel; private set => Set(ref _screenShareModeLabel, value); }
    public string ScreenShareDetail { get => _screenShareDetail; private set => Set(ref _screenShareDetail, value); }
    public string ScreenControlLabel { get => _screenControlLabel; private set => Set(ref _screenControlLabel, value); }
    public string CapabilitiesNote => OperatingSystem.IsLinux() ? PresentationText.LinuxCapabilities : PresentationText.CapabilitiesLimited;
    public string DeviceCredentialSeparate => PresentationText.DeviceCredentialSeparate;
    public string StartupCheckboxLabel => PresentationText.StartupCheckbox;
    public string StartupCheckboxName => PresentationText.StartupCheckboxName;
    public string? SelectedTaskId
    {
        get => _selectedTaskId;
        set
        {
            if (!Set(ref _selectedTaskId, value)) return;
            Raise(nameof(SelectedTask));
        }
    }
    public TaskRow? SelectedTask
    {
        get => string.IsNullOrWhiteSpace(_selectedTaskId) ? null : Tasks.FirstOrDefault(task => task.Id == _selectedTaskId);
        set => SelectedTaskId = value?.Id;
    }
    public string EntryDate { get => _entryDate; set => Set(ref _entryDate, value); }
    public string EntryHours { get => _entryHours; set => Set(ref _entryHours, value); }
    public string EntryDescription { get => _entryDescription; set => Set(ref _entryDescription, value); }
    public bool EntryBillable { get => _entryBillable; set => Set(ref _entryBillable, value); }
    public NavItem? SelectedNav { get => _selectedNav; set => Set(ref _selectedNav, value); }
    public IReadOnlyList<TaskRow> Tasks
    {
        get => _tasks;
        private set
        {
            if (!Set(ref _tasks, value)) return;
            Raise(nameof(SelectedTask));
        }
    }
    public IReadOnlyList<ProjectRow> Projects { get => _projectRows; private set => Set(ref _projectRows, value); }
    public IReadOnlyList<WorkLogRow> WorkLogs { get => _workLogs; private set => Set(ref _workLogs, value); }
    public IReadOnlyList<MeetingRow> Meetings { get => _meetings; private set => Set(ref _meetings, value); }
    public IReadOnlyList<NotificationRow> Notifications { get => _notifications; private set => Set(ref _notifications, value); }
    public IReadOnlyList<AttendanceRow> Attendance { get => _attendance; private set => Set(ref _attendance, value); }

    public bool CanInteract => Volatile.Read(ref _busyFlag) == 0;

    public bool CanSubmitTime =>
        CanInteract
        && IsSignedIn
        && !PasswordChangeRequired
        && _employeeState == "active"
        && Tasks.Count > 0;

    public bool CanEnrollDevice => CanInteract && IsSignedIn && !PasswordChangeRequired;

    public bool CanUnregisterDevice => CanEnrollDevice && _workspace.Enrollment.CanUnregister;

    public bool CanPauseUsage => CanInteract && IsSignedIn && !PasswordChangeRequired && _usageCanPause;

    public bool CanResumeUsage => CanInteract && IsSignedIn && !PasswordChangeRequired && _usageCanResume;

    public bool CanAcceptScreenShare => CanInteract && IsSignedIn && !PasswordChangeRequired && _screenCanAccept;

    public bool CanStopScreenShare => CanInteract && IsSignedIn && !PasswordChangeRequired && _screenCanStop;

    public bool CanGrantControl => CanInteract && IsSignedIn && !PasswordChangeRequired && _screenCanGrant;

    public bool CanDenyControl => CanInteract && IsSignedIn && !PasswordChangeRequired && _screenCanDeny;

    public bool CanRevokeControl => CanInteract && IsSignedIn && !PasswordChangeRequired && _screenCanRevoke;

    public string TelemetryLabel => PresentationText.TelemetryOff;
    public string PasswordStorageLabel => PresentationText.PasswordNotStored;
    public string LoadingLabel => PresentationText.LoadingMessage;

    public string Diagnostics
    {
        get
        {
            var text = PresentationText.Diagnostics(
                AgentInfo.Version,
                _workspace.CurrentSettings.ApiBaseUrl,
                _workspace.LastSuccessfulSyncUtc,
                IsSignedIn,
                Connection,
                IsSignedIn ? _workspace.Health : null,
                IsSignedIn ? _workspace.ScreenShare : null);
            text += "\n" + PresentationText.StartupLine(StartWithWindows);
            if (IsSignedIn)
                text += "\nثبت دستگاه: " + EnrollmentStateLabel + " / " + EnrollmentConnectionLabel;
            return text;
        }
    }

    public async Task SignInAsync(string? password, CancellationToken cancellationToken = default)
    {
        if (!TryEnter()) return;
        try
        {
            ClearBanners();
            var url = (_apiBaseUrl ?? "").Trim();
            var email = (_email ?? "").Trim();
            if (url.Length == 0 || email.Length == 0 || string.IsNullOrWhiteSpace(password))
            {
                ErrorMessage = PresentationText.MissingCredentials;
                return;
            }
            try
            {
                TrilezApiClient.NormalizeBase(url);
            }
            catch (ArgumentException)
            {
                ErrorMessage = PresentationText.InvalidUrl;
                return;
            }

            IsBusy = true;
            var result = await _workspace.SignInAsync(url, email, password, cancellationToken);
            if (!result.Succeeded || result.Dashboard is null)
            {
                ApplySignedOut();
                ErrorMessage = string.IsNullOrWhiteSpace(result.Message) ? UserMessages.For(0, "OFFLINE") : result.Message;
                return;
            }

            ApplyDashboard(result.Dashboard, ConnectionState.Connected);
            ApiBaseUrl = _workspace.CurrentSettings.ApiBaseUrl;
            if (result.Dashboard.PasswordChangeRequired)
            {
                SuccessMessage = null;
                ErrorMessage = PresentationText.PasswordChangeMessage;
            }
            else
            {
                SuccessMessage = PresentationText.SignedInMessage;
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (Exception)
        {
            ApplySignedOut();
            ErrorMessage = PresentationText.GenericFailure;
        }
        finally
        {
            Exit();
        }
    }

    public async Task RefreshAsync(CancellationToken cancellationToken = default)
    {
        if (!TryEnter()) return;
        try
        {
            ClearBanners();
            IsBusy = true;
            var sync = await _workspace.RefreshAsync(cancellationToken);
            if (sync.Dashboard is null)
            {
                var message = sync.Error?.Message ?? UserMessages.For(0, "OFFLINE");
                if (sync.Connection is ConnectionState.SessionExpired or ConnectionState.Unauthorized)
                {
                    ApplySignedOut();
                    ErrorMessage = message;
                    return;
                }

                ClearData();
                IsOffline = sync.Connection == ConnectionState.Offline;
                Connection = sync.Connection;
                ConnectionLabel = PresentationText.Connection(sync.Connection);
                ErrorMessage = message;
                Raise(nameof(Diagnostics));
                Raise(nameof(CanSubmitTime));
                return;
            }

            ApplyDashboard(sync.Dashboard, sync.Connection);
            if (sync.Dashboard.PasswordChangeRequired)
            {
                SuccessMessage = null;
                ErrorMessage = PresentationText.PasswordChangeMessage;
            }
            else if (sync.Dashboard.Errors.Count == 0)
            {
                SuccessMessage = PresentationText.RefreshedMessage;
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (Exception)
        {
            ErrorMessage = PresentationText.GenericFailure;
        }
        finally
        {
            Exit();
        }
    }

    public async Task SignOutAsync(CancellationToken cancellationToken = default)
    {
        if (!TryEnter()) return;
        try
        {
            ClearBanners();
            IsBusy = true;
            await _workspace.SignOutAsync(cancellationToken);
            ApplySignedOut();
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            ApplySignedOut();
        }
        catch (Exception)
        {
            ApplySignedOut();
            ErrorMessage = PresentationText.GenericFailure;
        }
        finally
        {
            Exit();
        }
    }

    public async Task SubmitTimeAsync(CancellationToken cancellationToken = default)
    {
        if (!TryEnter()) return;
        try
        {
            ClearBanners();
            if (!IsSignedIn)
            {
                ErrorMessage = UserMessages.For(401, "SESSION_REVOKED");
                return;
            }
            if (PasswordChangeRequired)
            {
                ErrorMessage = PresentationText.PasswordChangeMessage;
                return;
            }
            if (_employeeState != "active")
            {
                ErrorMessage = PresentationText.TimeRequiresActiveEmployee;
                return;
            }
            if (_assignedTasks.Count == 0)
            {
                ErrorMessage = PresentationText.NoTasksForTime;
                return;
            }

            var task = _assignedTasks.FirstOrDefault(item => item.Id == SelectedTaskId);
            if (task is null)
            {
                ErrorMessage = string.IsNullOrWhiteSpace(SelectedTaskId) ? PresentationText.NoTaskSelected : PresentationText.TaskNotAuthorized;
                return;
            }
            if (string.IsNullOrWhiteSpace(task.ProjectId))
            {
                ErrorMessage = PresentationText.TaskHasNoProject;
                return;
            }
            if (!PresentationText.TryParseDate(EntryDate, out var date))
            {
                ErrorMessage = PresentationText.DateInvalid;
                return;
            }
            if (!PresentationText.TryParseHours(EntryHours, out var hours))
            {
                ErrorMessage = PresentationText.HoursInvalid;
                return;
            }

            IsBusy = true;
            var draft = new TimeEntryDraft
            {
                ProjectId = task.ProjectId,
                TaskId = task.Id,
                Date = date,
                Hours = hours,
                Description = string.IsNullOrWhiteSpace(EntryDescription) ? null : EntryDescription.Trim(),
                Billable = EntryBillable,
            };
            var result = await _workspace.SubmitTimeEntryAsync(draft, cancellationToken);
            if (result.SessionExpired)
            {
                ApplySignedOut();
                ErrorMessage = string.IsNullOrWhiteSpace(result.Message) ? UserMessages.For(401, "SESSION_REVOKED") : result.Message;
                return;
            }
            if (!result.Saved || result.Record is null || string.IsNullOrWhiteSpace(result.Record.Id))
            {
                ErrorMessage = string.IsNullOrWhiteSpace(result.Message) ? UserMessages.For(400, null) : result.Message;
                return;
            }

            var row = DashboardMapper.FromTimeEntry(result.Record, _assignedTasks, _projects);
            WorkLogs = new[] { row }.Concat(WorkLogs).ToList();
            EntryHours = "";
            EntryDescription = "";
            SuccessMessage = PresentationText.TimeSaved(result.Record.Id);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (Exception)
        {
            ErrorMessage = PresentationText.GenericFailure;
        }
        finally
        {
            Exit();
        }
    }

    public async Task SavePreferencesAsync(CancellationToken cancellationToken = default)
    {
        if (!TryEnter()) return;
        try
        {
            ClearBanners();
            var url = (_apiBaseUrl ?? "").Trim();
            try
            {
                TrilezApiClient.NormalizeBase(url);
            }
            catch (ArgumentException)
            {
                ErrorMessage = PresentationText.InvalidUrl;
                return;
            }

            var previous = _workspace.CurrentSettings.ApiBaseUrl;
            IsBusy = true;
            await _workspace.SaveSettingsAsync(new AgentSettings
            {
                ApiBaseUrl = url,
                LastSuccessfulSyncUtc = _workspace.LastSuccessfulSyncUtc,
                StartWithWindows = StartWithWindows,
            }, cancellationToken);
            ApiBaseUrl = _workspace.CurrentSettings.ApiBaseUrl;
            var changedWhileSignedIn = IsSignedIn && !string.Equals(previous, ApiBaseUrl, StringComparison.OrdinalIgnoreCase);
            SuccessMessage = changedWhileSignedIn ? PresentationText.UrlAppliesNextSignIn : PresentationText.SettingsSaved;
            Raise(nameof(Diagnostics));
        }
        catch (ArgumentException)
        {
            ErrorMessage = PresentationText.InvalidUrl;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (Exception)
        {
            ErrorMessage = PresentationText.GenericFailure;
        }
        finally
        {
            Exit();
        }
    }

    public async Task EnrollDeviceAsync(CancellationToken cancellationToken = default)
    {
        if (!TryEnter()) return;
        try
        {
            ClearBanners();
            if (!IsSignedIn)
            {
                ErrorMessage = UserMessages.For(401, "SESSION_REVOKED");
                return;
            }
            if (PasswordChangeRequired)
            {
                ErrorMessage = PresentationText.PasswordChangeMessage;
                return;
            }
            var name = (_deviceName ?? "").Trim();
            if (name.Length is < 1 or > 80)
            {
                ErrorMessage = PresentationText.DeviceNameRequired;
                return;
            }

            IsBusy = true;
            var result = await _workspace.EnrollDeviceAsync(name, cancellationToken);
            ApplyEnrollment();
            if (result.SessionExpired)
            {
                ApplySignedOut();
                ErrorMessage = string.IsNullOrWhiteSpace(result.Message) ? UserMessages.For(401, "SESSION_REVOKED") : result.Message;
                return;
            }
            if (!result.Succeeded || string.IsNullOrWhiteSpace(result.EnrollmentId))
            {
                ErrorMessage = string.IsNullOrWhiteSpace(result.Message) ? PresentationText.GenericFailure : result.Message;
                return;
            }
            SuccessMessage = PresentationText.DeviceEnrolled(result.EnrollmentId);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (Exception)
        {
            ErrorMessage = PresentationText.GenericFailure;
        }
        finally
        {
            Exit();
        }
    }

    public async Task UnregisterDeviceAsync(CancellationToken cancellationToken = default)
    {
        if (!TryEnter()) return;
        try
        {
            ClearBanners();
            if (!IsSignedIn)
            {
                ErrorMessage = UserMessages.For(401, "SESSION_REVOKED");
                return;
            }
            if (PasswordChangeRequired)
            {
                ErrorMessage = PresentationText.PasswordChangeMessage;
                return;
            }

            IsBusy = true;
            var result = await _workspace.UnregisterDeviceAsync(cancellationToken);
            ApplyEnrollment();
            if (result.SessionExpired)
            {
                ApplySignedOut();
                ErrorMessage = string.IsNullOrWhiteSpace(result.Message) ? UserMessages.For(401, "SESSION_REVOKED") : result.Message;
                return;
            }
            if (!result.Succeeded)
            {
                ErrorMessage = string.IsNullOrWhiteSpace(result.Message) ? PresentationText.GenericFailure : result.Message;
                return;
            }
            SuccessMessage = PresentationText.DeviceUnregistered;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (Exception)
        {
            ErrorMessage = PresentationText.GenericFailure;
        }
        finally
        {
            Exit();
        }
    }

    public Task PauseUsageAsync(CancellationToken cancellationToken = default) => ChangeUsagePauseAsync(true, cancellationToken);

    public Task ResumeUsageAsync(CancellationToken cancellationToken = default) => ChangeUsagePauseAsync(false, cancellationToken);

    public async Task AcceptScreenShareAsync(CancellationToken cancellationToken = default)
    {
        if (!TryEnter()) return;
        try
        {
            ClearBanners();
            if (!IsSignedIn)
            {
                ErrorMessage = UserMessages.For(401, "SESSION_REVOKED");
                return;
            }
            IsBusy = true;
            var result = await _workspace.AcceptScreenShareAsync(cancellationToken);
            ApplyScreen();
            if (result.SessionExpired)
            {
                ApplySignedOut();
                ErrorMessage = string.IsNullOrWhiteSpace(result.Message) ? UserMessages.For(401, "SESSION_REVOKED") : result.Message;
                return;
            }
            if (!result.Succeeded)
            {
                ErrorMessage = string.IsNullOrWhiteSpace(result.Message) ? PresentationText.GenericFailure : result.Message;
                return;
            }
            SuccessMessage = result.Message;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (Exception)
        {
            ErrorMessage = PresentationText.GenericFailure;
        }
        finally
        {
            Exit();
        }
    }

    public async Task StopScreenShareAsync(CancellationToken cancellationToken = default)
    {
        if (!TryEnter()) return;
        try
        {
            ClearBanners();
            if (!IsSignedIn)
            {
                ErrorMessage = UserMessages.For(401, "SESSION_REVOKED");
                return;
            }
            IsBusy = true;
            var result = await _workspace.StopScreenShareAsync(cancellationToken);
            ApplyScreen();
            if (result.SessionExpired)
            {
                ApplySignedOut();
                ErrorMessage = string.IsNullOrWhiteSpace(result.Message) ? UserMessages.For(401, "SESSION_REVOKED") : result.Message;
                return;
            }
            if (!result.Succeeded)
            {
                ErrorMessage = string.IsNullOrWhiteSpace(result.Message) ? PresentationText.GenericFailure : result.Message;
                return;
            }
            SuccessMessage = result.Message;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (Exception)
        {
            ErrorMessage = PresentationText.GenericFailure;
        }
        finally
        {
            Exit();
        }
    }

    public Task GrantScreenControlAsync(CancellationToken cancellationToken = default) => DecideScreenControlAsync("grant", cancellationToken);

    public Task DenyScreenControlAsync(CancellationToken cancellationToken = default) => DecideScreenControlAsync("deny", cancellationToken);

    public Task RevokeScreenControlAsync(CancellationToken cancellationToken = default) => DecideScreenControlAsync("revoke", cancellationToken);

    private async Task DecideScreenControlAsync(string action, CancellationToken cancellationToken)
    {
        if (!TryEnter()) return;
        try
        {
            ClearBanners();
            if (!IsSignedIn)
            {
                ErrorMessage = UserMessages.For(401, "SESSION_REVOKED");
                return;
            }
            IsBusy = true;
            var result = await _workspace.DecideScreenControlAsync(action, cancellationToken);
            ApplyScreen();
            if (result.SessionExpired)
            {
                ApplySignedOut();
                ErrorMessage = string.IsNullOrWhiteSpace(result.Message) ? UserMessages.For(401, "SESSION_REVOKED") : result.Message;
                return;
            }
            if (!result.Succeeded)
            {
                ErrorMessage = string.IsNullOrWhiteSpace(result.Message) ? PresentationText.GenericFailure : result.Message;
                return;
            }
            SuccessMessage = result.Message;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (Exception)
        {
            ErrorMessage = PresentationText.GenericFailure;
        }
        finally
        {
            Exit();
        }
    }

    private async Task ChangeUsagePauseAsync(bool paused, CancellationToken cancellationToken)
    {
        if (!TryEnter()) return;
        try
        {
            ClearBanners();
            if (!IsSignedIn)
            {
                ErrorMessage = UserMessages.For(401, "SESSION_REVOKED");
                return;
            }
            IsBusy = true;
            var result = await _workspace.SetUsagePausedAsync(paused, cancellationToken);
            ApplyUsage();
            if (result.SessionExpired)
            {
                ApplySignedOut();
                ErrorMessage = string.IsNullOrWhiteSpace(result.Message) ? UserMessages.For(401, "SESSION_REVOKED") : result.Message;
                return;
            }
            if (!result.Succeeded)
            {
                ErrorMessage = string.IsNullOrWhiteSpace(result.Message) ? PresentationText.GenericFailure : result.Message;
                return;
            }
            SuccessMessage = result.Message;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (Exception)
        {
            ErrorMessage = PresentationText.GenericFailure;
        }
        finally
        {
            Exit();
        }
    }

    private void ApplyDashboard(EmployeeDashboard dashboard, ConnectionState connection)
    {
        var snapshot = DashboardMapper.From(dashboard, _clock.UtcNow);
        _assignedTasks.Clear();
        _assignedTasks.AddRange(dashboard.Tasks);
        _projects.Clear();
        _projects.AddRange(dashboard.Projects);
        _employeeState = snapshot.EmployeeState;
        IsSignedIn = true;
        IsOffline = connection == ConnectionState.Offline;
        PasswordChangeRequired = snapshot.PasswordChangeRequired;
        Connection = connection;
        ConnectionLabel = PresentationText.Connection(connection);
        Welcome = snapshot.Welcome;
        Identity = snapshot.Identity;
        EmployeeStateLabel = snapshot.EmployeeStateLabel;
        TodaySummary = snapshot.TodaySummary;
        AttendanceMessage = snapshot.AttendanceMessage;
        WorkTimeMessage = snapshot.WorkTimeMessage;
        WorkSessionLabel = snapshot.WorkSessionLabel;
        TasksMessage = snapshot.TasksMessage;
        ProjectsMessage = snapshot.ProjectsMessage;
        MeetingsMessage = snapshot.MeetingsMessage;
        NotificationsMessage = snapshot.NotificationsMessage;
        WarningMessage = snapshot.WarningMessage;
        DeviceNote = snapshot.DeviceNote;
        ScreenSharingNote = snapshot.ScreenSharingNote;
        Tasks = snapshot.Tasks;
        Projects = snapshot.Projects;
        WorkLogs = snapshot.WorkLogs;
        Meetings = snapshot.Meetings;
        Notifications = snapshot.Notifications;
        Attendance = snapshot.Attendance;
        if (string.IsNullOrWhiteSpace(EntryDate))
            EntryDate = _clock.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        if (snapshot.Tasks.All(task => task.Id != SelectedTaskId))
            SelectedTaskId = null;
        ApplyEnrollment();
        ApplyUsage();
        ApplyHealth();
        ApplyScreen();
        Raise(nameof(Diagnostics));
        Raise(nameof(CanSubmitTime));
        Raise(nameof(CanEnrollDevice));
        Raise(nameof(CanUnregisterDevice));
        Raise(nameof(CanPauseUsage));
        Raise(nameof(CanResumeUsage));
        Raise(nameof(CanAcceptScreenShare));
        Raise(nameof(CanStopScreenShare));
        Raise(nameof(CanGrantControl));
        Raise(nameof(CanDenyControl));
        Raise(nameof(CanRevokeControl));
    }

    private void ApplySignedOut()
    {
        ClearData();
        IsSignedIn = false;
        PasswordChangeRequired = false;
        IsOffline = false;
        ConnectionLabel = PresentationText.SignedOutConnection;
        _employeeState = "none";
        DeviceName = PresentationText.SuggestedDeviceName();
        EnrollmentStateLabel = "";
        EnrollmentConnectionLabel = "";
        EnrollmentDetail = "";
        ClearUsageLabels();
        ClearHealthLabels();
        ClearScreenLabels();
        Raise(nameof(Diagnostics));
        Raise(nameof(CanSubmitTime));
        Raise(nameof(CanEnrollDevice));
        Raise(nameof(CanUnregisterDevice));
        Raise(nameof(CanPauseUsage));
        Raise(nameof(CanResumeUsage));
        Raise(nameof(CanAcceptScreenShare));
        Raise(nameof(CanStopScreenShare));
        Raise(nameof(CanGrantControl));
        Raise(nameof(CanDenyControl));
        Raise(nameof(CanRevokeControl));
    }

    private void ClearData()
    {
        _assignedTasks.Clear();
        _projects.Clear();
        Tasks = [];
        Projects = [];
        WorkLogs = [];
        Meetings = [];
        Notifications = [];
        Attendance = [];
        Welcome = "";
        Identity = "";
        EmployeeStateLabel = "";
        TodaySummary = "";
        AttendanceMessage = "";
        WorkTimeMessage = "";
        WorkSessionLabel = "";
        TasksMessage = "";
        ProjectsMessage = "";
        MeetingsMessage = "";
        NotificationsMessage = "";
        WarningMessage = null;
        SelectedTaskId = null;
    }

    private void ClearBanners()
    {
        ErrorMessage = null;
        SuccessMessage = null;
        WarningMessage = null;
    }

    private bool TryEnter()
    {
        if (Interlocked.CompareExchange(ref _busyFlag, 1, 0) != 0) return false;
        Raise(nameof(CanInteract));
        Raise(nameof(CanSubmitTime));
        Raise(nameof(CanEnrollDevice));
        Raise(nameof(CanUnregisterDevice));
        Raise(nameof(CanPauseUsage));
        Raise(nameof(CanResumeUsage));
        Raise(nameof(CanAcceptScreenShare));
        Raise(nameof(CanStopScreenShare));
        Raise(nameof(CanGrantControl));
        Raise(nameof(CanDenyControl));
        Raise(nameof(CanRevokeControl));
        return true;
    }

    private void Exit()
    {
        IsBusy = false;
        Interlocked.Exchange(ref _busyFlag, 0);
        Raise(nameof(CanInteract));
        Raise(nameof(CanSubmitTime));
        Raise(nameof(CanEnrollDevice));
        Raise(nameof(CanUnregisterDevice));
        Raise(nameof(CanPauseUsage));
        Raise(nameof(CanResumeUsage));
        Raise(nameof(CanAcceptScreenShare));
        Raise(nameof(CanStopScreenShare));
        Raise(nameof(CanGrantControl));
        Raise(nameof(CanDenyControl));
        Raise(nameof(CanRevokeControl));
    }

    private void PostEnrollment()
    {
        if (_ui is null || ReferenceEquals(SynchronizationContext.Current, _ui)) ApplyPostedEnrollment();
        else _ui.Post(_ => ApplyPostedEnrollment(), null);
    }

    // EnrollmentChanged is the path that reports a dropped session. Dashboard refresh only copies labels.
    private void ApplyPostedEnrollment()
    {
        if (IsSignedIn && !_workspace.IsSignedIn)
        {
            ApplySignedOut();
            ErrorMessage = string.IsNullOrWhiteSpace(_workspace.Enrollment.Message)
                ? UserMessages.For(401, "SESSION_REVOKED")
                : _workspace.Enrollment.Message;
            return;
        }
        ApplyEnrollment();
    }

    private void ApplyEnrollment()
    {
        if (!IsSignedIn) return;
        var snapshot = _workspace.Enrollment;
        EnrollmentStateLabel = PresentationText.EnrollmentPhase(snapshot.Phase);
        EnrollmentConnectionLabel = snapshot.Phase == "unenrolled" ? "" : PresentationText.DeviceConnection(snapshot.ConnectionStatus);
        EnrollmentDetail = PresentationText.EnrollmentDetail(snapshot);
        if (snapshot.Phase != "unenrolled" && !string.IsNullOrWhiteSpace(snapshot.DeviceName))
            DeviceName = snapshot.DeviceName;
        Raise(nameof(CanUnregisterDevice));
    }

    private void PostUsage()
    {
        if (_ui is null || ReferenceEquals(SynchronizationContext.Current, _ui)) ApplyUsage();
        else _ui.Post(_ => ApplyUsage(), null);
    }

    private void ApplyUsage()
    {
        if (!IsSignedIn)
        {
            ClearUsageLabels();
            return;
        }
        var snapshot = _workspace.Usage;
        UsagePhaseLabel = PresentationText.UsagePhase(snapshot.Phase);
        UsageDetail = PresentationText.UsageDetail(snapshot);
        _usageCanPause = snapshot.CanPause;
        _usageCanResume = snapshot.CanResume;
        Raise(nameof(CanPauseUsage));
        Raise(nameof(CanResumeUsage));
    }

    private void PostHealth()
    {
        if (_ui is null || ReferenceEquals(SynchronizationContext.Current, _ui)) ApplyHealth();
        else _ui.Post(_ => ApplyHealth(), null);
    }

    private void ApplyHealth()
    {
        if (!IsSignedIn)
        {
            ClearHealthLabels();
            return;
        }
        var snapshot = _workspace.Health;
        HealthPhaseLabel = PresentationText.SyncPhase(snapshot.SyncPhase);
        HealthDetail = PresentationText.HealthDetail(snapshot);
        Raise(nameof(Diagnostics));
    }

    private void ClearHealthLabels()
    {
        HealthPhaseLabel = "";
        HealthDetail = "";
    }

    private void PostScreen()
    {
        if (_ui is null || ReferenceEquals(SynchronizationContext.Current, _ui)) ApplyScreen();
        else _ui.Post(_ => ApplyScreen(), null);
    }

    private void ApplyScreen()
    {
        if (!IsSignedIn)
        {
            ClearScreenLabels();
            return;
        }
        var snapshot = _workspace.ScreenShare;
        ScreenSharePhaseLabel = PresentationText.ScreenSharePhase(snapshot.Phase);
        ScreenShareModeLabel = PresentationText.ScreenShareMode(snapshot);
        ScreenShareDetail = PresentationText.ScreenShareDetail(snapshot);
        ScreenControlLabel = PresentationText.ScreenControlLabel(snapshot);
        _screenCanAccept = snapshot.CanAccept;
        _screenCanStop = snapshot.CanStop;
        _screenCanGrant = snapshot.CanGrantControl;
        _screenCanDeny = snapshot.CanDenyControl;
        _screenCanRevoke = snapshot.CanRevokeControl;
        Raise(nameof(CanAcceptScreenShare));
        Raise(nameof(CanStopScreenShare));
        Raise(nameof(CanGrantControl));
        Raise(nameof(CanDenyControl));
        Raise(nameof(CanRevokeControl));
        Raise(nameof(Diagnostics));
    }

    private void ClearScreenLabels()
    {
        ScreenSharePhaseLabel = "";
        ScreenShareModeLabel = "";
        ScreenShareDetail = "";
        ScreenControlLabel = "";
        _screenCanAccept = false;
        _screenCanStop = false;
        _screenCanGrant = false;
        _screenCanDeny = false;
        _screenCanRevoke = false;
        Raise(nameof(CanAcceptScreenShare));
        Raise(nameof(CanStopScreenShare));
        Raise(nameof(CanGrantControl));
        Raise(nameof(CanDenyControl));
        Raise(nameof(CanRevokeControl));
    }

    private void ClearUsageLabels()
    {
        UsagePhaseLabel = "";
        UsageDetail = "";
        _usageCanPause = false;
        _usageCanResume = false;
        Raise(nameof(CanPauseUsage));
        Raise(nameof(CanResumeUsage));
    }
}
