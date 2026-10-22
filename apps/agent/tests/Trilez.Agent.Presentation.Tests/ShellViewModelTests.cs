using System.Reflection;
using System.Text.Json;
using Trilez.Agent;
using Trilez.Agent.Presentation;
using Xunit;

namespace Trilez.Agent.Presentation.Tests;

public sealed class ShellViewModelTests
{
    private static readonly IClock Clock = new FixedClock(DateTimeOffset.Parse("2026-10-15T20:30:00Z"), new DateOnly(2026, 10, 16));

    [Fact]
    public async Task SignInValidationDoesNotCallTheWorkspace()
    {
        var workspace = new FakeWorkspace();
        var shell = Shell(workspace);
        shell.Email = "azadeh.desktop@example.com";

        await shell.SignInAsync("");
        await shell.SignInAsync("   ");

        shell.ApiBaseUrl = "http://user:secret@127.0.0.1:4000";
        await shell.SignInAsync("StrongPassword123!");

        Assert.Equal(0, workspace.SignInCalls);
        Assert.Equal(PresentationText.InvalidUrl, shell.ErrorMessage);
        Assert.Null(shell.SuccessMessage);
        Assert.False(shell.IsSignedIn);
    }

    [Fact]
    public async Task ApiErrorStaysPersianAndThePasswordIsNotKept()
    {
        var workspace = new FakeWorkspace
        {
            OnSignIn = (_, _, _) => SignInResult.Fail(UserMessages.For(401, null)),
        };
        var shell = Ready(workspace);

        await shell.SignInAsync("StrongPassword123!");

        Assert.Equal("برای ادامه باید دوباره وارد تری‌لیز شوید.", shell.ErrorMessage);
        Assert.Null(shell.SuccessMessage);
        Assert.False(shell.IsSignedIn);
        Assert.DoesNotContain("StrongPassword123!", JsonSerializer.Serialize(workspace.CurrentSettings));
        foreach (var property in typeof(ShellViewModel).GetProperties(BindingFlags.Instance | BindingFlags.Public))
        {
            if (property.GetValue(shell) is string text)
                Assert.DoesNotContain("StrongPassword123!", text);
        }
    }

    [Fact]
    public async Task UnexpectedFailureDoesNotShowTheExceptionText()
    {
        var workspace = new FakeWorkspace { ThrowOnSignIn = new InvalidOperationException("token=eyJ.secret") };
        var shell = Ready(workspace);

        await shell.SignInAsync("StrongPassword123!");

        Assert.Equal(PresentationText.GenericFailure, shell.ErrorMessage);
        Assert.DoesNotContain("eyJ", shell.ErrorMessage);
        Assert.False(shell.IsSignedIn);
    }

    [Fact]
    public async Task SecondSignInWhileBusyDoesNotCallAgainAndSuccessWaitsForTheDashboard()
    {
        var workspace = new FakeWorkspace();
        var started = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        var gate = new TaskCompletionSource<SignInResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        workspace.SignInStarted = started;
        workspace.SignInGate = gate;
        var shell = Ready(workspace);
        var dashboard = Sample(tasks: [new WorkTask { Id = "task-7", Title = "طراحی", Status = "todo", ProjectId = "project-7" }]);

        var first = shell.SignInAsync("StrongPassword123!");
        await started.Task.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Null(shell.SuccessMessage);
        Assert.True(shell.IsBusy);

        var second = shell.SignInAsync("StrongPassword123!");
        await second.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal(1, workspace.SignInCalls);

        workspace.CurrentSettings = new AgentSettings { ApiBaseUrl = "http://127.0.0.1:4000" };
        gate.SetResult(SignInResult.Ok(dashboard));
        await first.WaitAsync(TimeSpan.FromSeconds(5));

        Assert.Equal(PresentationText.SignedInMessage, shell.SuccessMessage);
        Assert.True(shell.IsSignedIn);
        Assert.Equal("طراحی", Assert.Single(shell.Tasks).Title);
    }

    [Fact]
    public async Task DashboardUsesOnlyReturnedRowsAndProjectNames()
    {
        var workspace = new FakeWorkspace();
        var shell = Ready(workspace);
        Accept(workspace, Sample(
            tasks:
            [
                new WorkTask { Id = "task-7", Title = "طراحی", Status = "in_progress", ProjectId = "project-7", DueDate = "2026-10-20" },
                new WorkTask { Id = "task-8", Title = "جانبی", Status = "todo", ProjectId = "project-missing" },
            ],
            projects: [new ProjectSummary { Id = "project-7", Name = "پروژه آلفا", Code = "ALF", Status = "active", StartDate = "2026-09-01", EndDate = "2026-12-31" }],
            meetings:
            [
                new MeetingSummary { Id = "meet-1", Title = "جلسه آینده", StartAt = "2026-10-16T09:00:00+03:30", Status = "scheduled", DurationMinutes = 60, ProjectId = "project-7" },
                new MeetingSummary { Id = "meet-2", Title = "جلسه گذشته", StartAt = "2026-10-15T08:00:00+03:30", Status = "scheduled", DurationMinutes = 30 },
                new MeetingSummary { Id = "meet-3", Title = "جلسه لغو", StartAt = "2026-10-16T11:00:00+03:30", Status = "cancelled", DurationMinutes = 30 },
                new MeetingSummary { Id = "meet-4", Title = "زمان نامشخص", StartAt = "soon", Status = "scheduled" },
            ],
            notifications: [new NotificationSummary { Id = "note-7", Title = "یادآوری", Body = "متن", CreatedAt = "2026-10-15T21:00:00Z", RecipientId = "user-7" }]));

        await shell.SignInAsync("StrongPassword123!");

        Assert.Equal(2, shell.Tasks.Count);
        Assert.Equal("پروژه آلفا", shell.Tasks[0].ProjectName);
        Assert.Equal("در حال انجام", shell.Tasks[0].StatusLabel);
        Assert.Equal(PresentationText.UnknownProject, shell.Tasks[1].ProjectName);
        Assert.Equal("پروژه آلفا", Assert.Single(shell.Projects).Name);
        Assert.Equal(["جلسه آینده", "زمان نامشخص"], shell.Meetings.Select(item => item.Title).ToArray());
        Assert.Equal("پروژه آلفا", shell.Meetings[0].ProjectName);
        Assert.Equal(PresentationText.UnknownProject, shell.Meetings[1].ProjectName);
        Assert.Equal("یادآوری", Assert.Single(shell.Notifications).Title);
        Assert.Equal("سلام، آزاده نعمتی", shell.Welcome);
        Assert.Contains("azadeh.desktop@example.com", shell.Identity);
        Assert.Contains("عضو", shell.Identity);
        Assert.True(shell.CanSubmitTime);
    }

    [Fact]
    public async Task EmptySectionsStayEmpty()
    {
        var workspace = new FakeWorkspace();
        var shell = Ready(workspace);
        Accept(workspace, Sample());

        await shell.SignInAsync("StrongPassword123!");

        Assert.Empty(shell.Tasks);
        Assert.Empty(shell.Projects);
        Assert.Empty(shell.Meetings);
        Assert.Empty(shell.Notifications);
        Assert.Empty(shell.WorkLogs);
        Assert.Equal(PresentationText.EmptyTasks, shell.TasksMessage);
        Assert.Equal(PresentationText.EmptyProjects, shell.ProjectsMessage);
        Assert.Equal(PresentationText.EmptyMeetings, shell.MeetingsMessage);
        Assert.Equal(PresentationText.EmptyNotifications, shell.NotificationsMessage);
    }

    [Fact]
    public async Task OfflineRefreshClearsRowsAndDoesNotUseTheEmptySentence()
    {
        var workspace = new FakeWorkspace();
        var shell = Ready(workspace);
        Accept(workspace, Sample(tasks: [new WorkTask { Id = "task-7", Title = "طراحی", Status = "todo", ProjectId = "project-7" }]));
        await shell.SignInAsync("StrongPassword123!");
        workspace.OnRefresh = () => new EmployeeSync
        {
            Connection = ConnectionState.Offline,
            Error = new SyncError { Source = "sync", Status = 0, Code = "OFFLINE", Message = UserMessages.For(0, "OFFLINE") },
        };

        await shell.RefreshAsync();

        Assert.True(shell.IsSignedIn);
        Assert.True(shell.IsOffline);
        Assert.Empty(shell.Tasks);
        Assert.Equal("", shell.TasksMessage);
        Assert.Equal("ارتباط با تری‌لیز برقرار نشد.", shell.ErrorMessage);
        Assert.DoesNotContain("طراحی", shell.TodaySummary);
        Assert.DoesNotContain(PresentationText.EmptyTasks, shell.TasksMessage);
        Assert.Null(shell.SuccessMessage);
    }

    [Fact]
    public async Task SectionForbiddenShowsThePermissionMessage()
    {
        var workspace = new FakeWorkspace();
        var shell = Ready(workspace);
        Accept(workspace, Sample(errors: [new SyncError { Source = "tasks", Status = 403, Message = UserMessages.For(403, null) }]));

        await shell.SignInAsync("StrongPassword123!");

        Assert.Empty(shell.Tasks);
        Assert.Equal("اجازه این کار را ندارید.", shell.TasksMessage);
        Assert.DoesNotContain(PresentationText.EmptyTasks, shell.TasksMessage);
        Assert.Equal(PresentationText.SectionErrors, shell.WarningMessage);
        Assert.Equal(PresentationText.SignedInMessage, shell.SuccessMessage);
    }

    [Fact]
    public async Task SessionExpiryClearsThePreviousEmployeeAndSignsOut()
    {
        var workspace = new FakeWorkspace();
        var shell = Ready(workspace);
        Accept(workspace, Sample(tasks: [new WorkTask { Id = "task-7", Title = "طراحی", Status = "todo", ProjectId = "project-7" }]));
        await shell.SignInAsync("StrongPassword123!");
        workspace.OnRefresh = () => new EmployeeSync
        {
            Connection = ConnectionState.SessionExpired,
            Error = new SyncError { Source = "sync", Status = 401, Code = "SESSION_REVOKED", Message = UserMessages.For(401, "SESSION_REVOKED") },
        };

        await shell.RefreshAsync();

        Assert.False(shell.IsSignedIn);
        Assert.Empty(shell.Tasks);
        Assert.Equal("", shell.Welcome);
        Assert.Equal("نشست لغو یا منقضی شده است. دوباره وارد شوید.", shell.ErrorMessage);
        Assert.Null(shell.SuccessMessage);
    }

    [Fact]
    public async Task PasswordChangeStaysBlockedWithoutASuccessBanner()
    {
        var workspace = new FakeWorkspace();
        var shell = Ready(workspace);
        var profile = new EmployeeProfile
        {
            Id = "user-7",
            Name = "آزاده نعمتی",
            Email = "azadeh.desktop@example.com",
            Role = "member",
            IsActive = true,
            MustChangePassword = true,
        };
        Accept(workspace, EmployeeDashboard.Blocked(profile, PresentationText.PasswordChangeMessage));

        await shell.SignInAsync("StrongPassword123!");

        Assert.True(shell.IsSignedIn);
        Assert.True(shell.PasswordChangeRequired);
        Assert.Null(shell.SuccessMessage);
        Assert.Equal(PresentationText.PasswordChangeMessage, shell.ErrorMessage);
        Assert.Empty(shell.Tasks);
        Assert.Equal(PresentationText.PasswordChangeMessage, shell.TasksMessage);
        Assert.Contains("اشتراک صفحه", shell.ScreenSharingNote);
        Assert.False(shell.CanSubmitTime);

        await shell.SubmitTimeAsync();
        Assert.Equal(0, workspace.SubmitCalls);
    }

    [Fact]
    public async Task TimeEntryIsSavedOnlyAfterTheBackendReturnsAnId()
    {
        var workspace = new FakeWorkspace();
        var shell = await SignedInWithTask(workspace);
        shell.SelectedTaskId = "task-7";
        shell.EntryDate = "2026-10-16";
        shell.EntryHours = "1,5";
        shell.EntryDescription = "  یادداشت  ";
        shell.EntryBillable = true;
        workspace.OnSubmit = _ => TimeEntrySubmission.Ok(new TimesheetRecord
        {
            Id = "time-9",
            ProjectId = "project-7",
            TaskId = "task-7",
            Date = "2026-10-16",
            Hours = 1.5,
            Status = "pending_review",
            Description = "یادداشت",
        });

        await shell.SubmitTimeAsync();

        var draft = workspace.LastDraft!;
        Assert.Equal("project-7", draft.ProjectId);
        Assert.Equal("task-7", draft.TaskId);
        Assert.Equal("2026-10-16", draft.Date);
        Assert.Equal(1.5m, draft.Hours);
        Assert.Equal("یادداشت", draft.Description);
        Assert.True(draft.Billable);
        Assert.Equal(PresentationText.TimeSaved("time-9"), shell.SuccessMessage);
        Assert.Equal("در انتظار بررسی", Assert.Single(shell.WorkLogs).StatusLabel);
        Assert.Equal("", shell.EntryHours);
    }

    [Fact]
    public async Task RejectedTimeEntryDoesNotLookSaved()
    {
        var workspace = new FakeWorkspace();
        var shell = await SignedInWithTask(workspace);
        shell.SelectedTaskId = "task-7";
        shell.EntryDate = "2026-10-16";
        shell.EntryHours = "2";
        workspace.OnSubmit = _ => TimeEntrySubmission.Fail("درخواست نامعتبر است.");

        await shell.SubmitTimeAsync();

        Assert.Null(shell.SuccessMessage);
        Assert.Equal("درخواست نامعتبر است.", shell.ErrorMessage);
        Assert.Empty(shell.WorkLogs);
    }

    [Fact]
    public async Task TimeEntryValidationDoesNotCallTheApi()
    {
        var workspace = new FakeWorkspace();
        var shell = await SignedInWithTask(workspace);
        shell.EntryDate = "2026-10-16";
        shell.EntryHours = "1";

        await shell.SubmitTimeAsync();
        Assert.Equal(PresentationText.NoTaskSelected, shell.ErrorMessage);

        shell.SelectedTaskId = "task-other";
        await shell.SubmitTimeAsync();
        Assert.Equal(PresentationText.TaskNotAuthorized, shell.ErrorMessage);

        shell.SelectedTaskId = "task-7";
        foreach (var hours in new[] { "0", "24.01", "abc" })
        {
            shell.EntryHours = hours;
            await shell.SubmitTimeAsync();
            Assert.Equal(PresentationText.HoursInvalid, shell.ErrorMessage);
        }

        shell.EntryHours = "1";
        foreach (var date in new[] { "2026-02-31", "1405/07/24" })
        {
            shell.EntryDate = date;
            await shell.SubmitTimeAsync();
            Assert.Equal(PresentationText.DateInvalid, shell.ErrorMessage);
        }

        Assert.Equal(0, workspace.SubmitCalls);
    }

    [Fact]
    public async Task TimeBoundariesAndInactiveEmployeeAreEnforced()
    {
        var workspace = new FakeWorkspace();
        var shell = await SignedInWithTask(workspace);
        shell.SelectedTaskId = "task-7";
        shell.EntryDate = "2026-10-16";
        workspace.OnSubmit = draft => TimeEntrySubmission.Ok(new TimesheetRecord { Id = "time-" + draft.Hours, Hours = (double)draft.Hours, TaskId = draft.TaskId, ProjectId = draft.ProjectId, Date = draft.Date, Status = "pending_review" });

        shell.EntryHours = "0.01";
        await shell.SubmitTimeAsync();
        shell.EntryHours = "24";
        await shell.SubmitTimeAsync();
        Assert.Equal(2, workspace.SubmitCalls);
        Assert.Equal(24m, workspace.LastDraft!.Hours);

        var inactive = Ready(new FakeWorkspace());
        var inactiveWorkspace = (FakeWorkspace)WorkspaceOf(inactive);
        Accept(inactiveWorkspace, Sample(profile: new EmployeeProfile
        {
            Id = "user-8",
            Name = "بدون پرونده",
            Email = "plain.desktop@example.com",
            Role = "member",
            IsActive = true,
            EmployeeState = "none",
        }));
        inactive.ApiBaseUrl = "http://127.0.0.1:4000";
        inactive.Email = "plain.desktop@example.com";
        await inactive.SignInAsync("StrongPassword123!");
        inactive.EntryDate = "2026-10-16";
        inactive.EntryHours = "1";
        await inactive.SubmitTimeAsync();
        Assert.Equal(0, inactiveWorkspace.SubmitCalls);
        Assert.Equal(PresentationText.TimeRequiresActiveEmployee, inactive.ErrorMessage);
    }

    [Fact]
    public async Task SecondTimeSubmitWhileBusyDoesNotCallAgain()
    {
        var workspace = new FakeWorkspace();
        var shell = await SignedInWithTask(workspace);
        shell.SelectedTaskId = "task-7";
        shell.EntryDate = "2026-10-16";
        shell.EntryHours = "1.5";
        var started = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        var gate = new TaskCompletionSource<TimeEntrySubmission>(TaskCreationOptions.RunContinuationsAsynchronously);
        workspace.SubmitStarted = started;
        workspace.SubmitGate = gate;

        var first = shell.SubmitTimeAsync();
        await started.Task.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Null(shell.SuccessMessage);
        var second = shell.SubmitTimeAsync();
        await second.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal(1, workspace.SubmitCalls);

        gate.SetResult(TimeEntrySubmission.Ok(new TimesheetRecord { Id = "time-9", Hours = 1.5, TaskId = "task-7", ProjectId = "project-7", Date = "2026-10-16", Status = "pending_review" }));
        await first.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal(PresentationText.TimeSaved("time-9"), shell.SuccessMessage);
    }

    [Fact]
    public async Task SettingsRejectUserInfoAndApplyANewOriginOnTheNextSignIn()
    {
        var workspace = new FakeWorkspace();
        var shell = Ready(workspace);
        shell.ApiBaseUrl = "http://user:SecretToken@127.0.0.1:4000";
        await shell.SavePreferencesAsync();
        Assert.Equal(0, workspace.SaveCalls);
        Assert.Equal(PresentationText.InvalidUrl, shell.ErrorMessage);
        Assert.Null(shell.SuccessMessage);

        shell.ApiBaseUrl = "http://127.0.0.1:4000/api/ignored";
        shell.StartWithWindows = true;
        await shell.SavePreferencesAsync();
        Assert.Equal(PresentationText.SettingsSaved, shell.SuccessMessage);
        Assert.Equal("http://127.0.0.1:4000", shell.ApiBaseUrl);
        Assert.True(workspace.CurrentSettings.StartWithWindows);
        Assert.DoesNotContain("SecretToken", JsonSerializer.Serialize(workspace.CurrentSettings));

        Accept(workspace, Sample());
        shell.Email = "azadeh.desktop@example.com";
        await shell.SignInAsync("StrongPassword123!");
        shell.ApiBaseUrl = "http://127.0.0.1:5000";
        await shell.SavePreferencesAsync();
        Assert.Equal(PresentationText.UrlAppliesNextSignIn, shell.SuccessMessage);
        Assert.Equal("http://127.0.0.1:5000", workspace.CurrentSettings.ApiBaseUrl);
    }

    [Fact]
    public void DiagnosticsOmitSecretsAndUseTheTehranDay()
    {
        var workspace = new FakeWorkspace
        {
            CurrentSettings = new AgentSettings
            {
                ApiBaseUrl = "https://user:SecretToken@api.example:444/path?access=eyJ.secret",
                LastSuccessfulSyncUtc = DateTimeOffset.Parse("2026-10-15T21:00:00Z"),
            },
        };
        workspace.LastSuccessfulSyncUtc = workspace.CurrentSettings.LastSuccessfulSyncUtc;
        var shell = Shell(workspace);

        var text = shell.Diagnostics;

        Assert.Contains(AgentInfo.Version, text);
        Assert.Contains("api.example", text);
        Assert.Contains(DashboardText.FormatDate("2026-10-16"), text);
        Assert.Contains("00:30", text);
        Assert.DoesNotContain(DashboardText.FormatDate("2026-10-15"), text);
        Assert.Contains(PresentationText.DiagnosticsFootnote, text);
        Assert.Contains(PresentationText.TelemetryOff, text);
        Assert.Contains(PresentationText.ScreenSharingOff, text);
        Assert.Contains(PresentationText.SignedOutConnection, text);
        Assert.True(text.Contains("شروع همراه ویندوز: خاموش", StringComparison.Ordinal) || text.Contains("شروع همراه رایانه: خاموش", StringComparison.Ordinal));
        Assert.DoesNotContain("SecretToken", text);
        Assert.DoesNotContain("eyJ", text);
        Assert.DoesNotContain("user:", text);
        Assert.DoesNotContain("/path", text);

        Assert.Contains(PresentationText.NoSuccessfulSync, Shell(new FakeWorkspace()).Diagnostics);
    }

    [Fact]
    public async Task SignedInDiagnosticsShowDeviceHealthWithoutSecrets()
    {
        var workspace = new FakeWorkspace();
        var shell = Ready(workspace);
        workspace.Health = new HealthSnapshot
        {
            SyncPhase = "offline",
            CollectorPhase = "running",
            AgentVersion = "0.2.0",
            OsName = "Windows 11",
            OsVersion = "10.0",
            Architecture = "X64",
            CpuPercent = 12.5,
            MemoryUsedBytes = 100,
            MemoryTotalBytes = 1_000,
            DiskFreeBytes = 50,
            Online = false,
            PendingCount = 2,
            SampleIntervalSeconds = 60,
        };
        workspace.NotifyHealthChanged();
        Assert.Equal("", shell.HealthPhaseLabel);
        Assert.DoesNotContain("پردازنده", shell.Diagnostics);

        Accept(workspace, Sample());
        await shell.SignInAsync("StrongPassword123!");
        workspace.Health = new HealthSnapshot
        {
            SyncPhase = "offline",
            CollectorPhase = "running",
            AgentVersion = "0.2.0",
            OsName = "eyJhbGciOiJub25lIn0",
            OsVersion = "10.0",
            Architecture = "abcdefghijklmnopqrstuvwxyzABCDEF",
            CpuPercent = 12.5,
            MemoryUsedBytes = 100,
            MemoryTotalBytes = 1_000,
            DiskFreeBytes = 50,
            Online = false,
            LastHeartbeatAt = DateTimeOffset.Parse("2026-10-16T07:30:00Z"),
            PendingCount = 2,
            SampleIntervalSeconds = 60,
            Message = "password=hunter2",
        };
        workspace.NotifyHealthChanged();

        Assert.Equal(PresentationText.SyncPhase("offline"), shell.HealthPhaseLabel);
        var text = shell.Diagnostics;
        Assert.Contains("پردازنده: 12.5", text);
        Assert.Contains("همگام‌سازی: " + PresentationText.SyncPhase("offline"), text);
        Assert.Contains("نمونه‌های منتظر: 2", text);
        Assert.Contains("بازه نمونه‌برداری: 60 ثانیه", text);
        Assert.Contains(PresentationText.TelemetryOff, text);
        Assert.Contains("نامشخص", text);
        Assert.DoesNotContain("eyJ", text);
        Assert.DoesNotContain("hunter2", text);
        Assert.DoesNotContain("password", text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("abcdefghijklmnopqrstuvwxyzABCDEF", text);
    }

    [Fact]
    public async Task ScreenShareStatusIsVisibleAndDoesNotSignTheUserOut()
    {
        var workspace = new FakeWorkspace();
        var shell = Ready(workspace);
        Accept(workspace, Sample());
        await shell.SignInAsync("StrongPassword123!");
        workspace.ScreenShare = new ScreenShareSnapshot
        {
            Phase = "active",
            SupportName = "پشتیبان آزمون",
            StartedAt = DateTimeOffset.Parse("2026-10-16T08:00:00Z"),
            CanStop = true,
            Message = "password=hunter2",
            SessionId = "ss-should-not-appear",
            RequestedMode = "high",
            EffectiveMode = "high",
            TargetFps = 30,
            EffectiveFps = 30,
            ActualFps = 12.5,
            LatencyMs = 41,
            CaptureFailures = 1,
            ControlState = "requested",
            ControlGrantId = "cg-11111111-1111-4111-8111-111111111111",
            CanGrantControl = true,
            CanDenyControl = true,
            CanRevokeControl = true,
        };
        workspace.NotifyScreenChanged();

        Assert.True(shell.IsSignedIn);
        Assert.Equal(PresentationText.ScreenSharePhase("active"), shell.ScreenSharePhaseLabel);
        Assert.Equal("کیفیت بالا", shell.ScreenShareModeLabel);
        Assert.Equal("درخواست کنترل ورودی", shell.ScreenControlLabel);
        Assert.Contains("پشتیبان آزمون", shell.ScreenShareDetail);
        Assert.Contains("پشتیبانی کنترل ورودی خواسته است", shell.ScreenShareDetail);
        Assert.Contains("نرخ واقعی: 12.5", shell.ScreenShareDetail);
        Assert.Contains("سقف تنظیم‌شده: 30", shell.ScreenShareDetail);
        Assert.Contains("تأخیر ارسال: 41", shell.ScreenShareDetail);
        Assert.Contains("تصویر صفحه ذخیره نمی‌شود.", shell.Diagnostics);
        Assert.DoesNotContain("ss-should-not-appear", shell.Diagnostics);
        Assert.DoesNotContain("cg-11111111-1111-4111-8111-111111111111", shell.ScreenShareDetail);
        Assert.DoesNotContain("cg-11111111-1111-4111-8111-111111111111", shell.Diagnostics);
        Assert.DoesNotContain("hunter2", shell.Diagnostics);
        Assert.True(shell.CanStopScreenShare);
        Assert.True(shell.CanGrantControl);
        await shell.GrantScreenControlAsync();
        Assert.True(shell.IsSignedIn);
        Assert.Equal(1, workspace.ControlCalls);
        Assert.Equal("grant", workspace.LastControlAction);
        workspace.OnControl = _ => ScreenCommandResult.Fail(PresentationText.ScreenControlUnavailable);
        await shell.DenyScreenControlAsync();
        Assert.True(shell.IsSignedIn);
        Assert.Equal(PresentationText.ScreenControlUnavailable, shell.ErrorMessage);
        await shell.StopScreenShareAsync();
        Assert.True(shell.IsSignedIn);
        Assert.Equal(1, workspace.StopScreenCalls);
    }

    private static async Task<ShellViewModel> SignedInWithTask(FakeWorkspace workspace)
    {
        var shell = Ready(workspace);
        Accept(workspace, Sample(
            tasks: [new WorkTask { Id = "task-7", Title = "طراحی", Status = "todo", ProjectId = "project-7" }],
            projects: [new ProjectSummary { Id = "project-7", Name = "پروژه آلفا", Status = "active" }]));
        await shell.SignInAsync("StrongPassword123!");
        return shell;
    }

    private static ShellViewModel Ready(FakeWorkspace workspace)
    {
        var shell = Shell(workspace);
        shell.ApiBaseUrl = "http://127.0.0.1:4000";
        shell.Email = "azadeh.desktop@example.com";
        return shell;
    }

    private static ShellViewModel Shell(FakeWorkspace workspace) => new(workspace, Clock);

    private static FakeWorkspace WorkspaceOf(ShellViewModel shell) =>
        (FakeWorkspace)typeof(ShellViewModel).GetField("_workspace", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(shell)!;

    private static void Accept(FakeWorkspace workspace, EmployeeDashboard dashboard)
    {
        workspace.OnSignIn = (url, _, _) =>
        {
            workspace.CurrentSettings = new AgentSettings
            {
                ApiBaseUrl = TrilezApiClient.NormalizeBase(url).GetLeftPart(UriPartial.Authority),
            };
            workspace.IsSignedIn = true;
            return SignInResult.Ok(dashboard);
        };
    }

    private static EmployeeDashboard Sample(
        EmployeeProfile? profile = null,
        IReadOnlyList<WorkTask>? tasks = null,
        IReadOnlyList<ProjectSummary>? projects = null,
        IReadOnlyList<MeetingSummary>? meetings = null,
        IReadOnlyList<NotificationSummary>? notifications = null,
        IReadOnlyList<SyncError>? errors = null) => new()
    {
        Profile = profile ?? new EmployeeProfile
        {
            Id = "user-7",
            Name = "آزاده نعمتی",
            Email = "azadeh.desktop@example.com",
            Role = "member",
            Title = "کارشناس",
            IsActive = true,
            EmployeeState = "active",
            EmployeeId = "employee-7",
        },
        Connected = true,
        PasswordChangeRequired = profile?.MustChangePassword == true,
        Tasks = tasks ?? [],
        Projects = projects ?? [],
        Meetings = meetings ?? [],
        Notifications = notifications ?? [],
        AttendanceRecords = [],
        Timesheets = [],
        Attendance = new SectionNote { State = SectionState.Empty, Message = "برای امروز حضور ثبت نشده است." },
        WorkTime = new SectionNote { State = SectionState.Empty, Message = "ساعت کاری ثبت نشده است." },
        Device = new SectionNote { State = SectionState.Unavailable, Message = "ثبت دستگاه و telemetry برای حساب کارمند هنوز API جداگانه‌ای ندارد." },
        ScreenSharing = new SectionNote { State = SectionState.Unavailable, Message = "اشتراک صفحه خاموش است. این نسخه تصویر صفحه را نمی‌گیرد و ارسال نمی‌کند." },
        Today = new TodayAttendance { Date = "2026-10-16", ClocksRecorded = false },
        Errors = errors ?? [],
    };

    private sealed class FixedClock(DateTimeOffset utcNow, DateOnly today) : IClock
    {
        public DateTimeOffset UtcNow => utcNow;
        public DateOnly Today => today;
    }
}
