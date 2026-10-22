using System.Net;
using System.Text;
using System.Text.Json;
using Trilez.Agent;
using Trilez.Agent.Presentation;
using Xunit;

namespace Trilez.Agent.Presentation.Tests;

public sealed class DeviceEnrollmentTests
{
    private const string Password = "StrongPassword123!";
    private const string Email = "azadeh.desktop@example.com";
    private const string Secret = "device-secret-value-should-not-leak";

    [Fact]
    public void ProtectedFileRoundTripsTheSecretWithoutWritingIt()
    {
        using var dir = new TempDir();
        var store = new ProtectedFileDeviceCredentialStore(dir.Credential, new ReversingDeviceSecretProtector());
        store.Save(new StoredDeviceCredential
        {
            InstallationId = "11111111-1111-1111-1111-111111111111",
            EnrollmentId = "device-1",
            Secret = Secret,
            DeviceName = "لپ‌تاپ آزمون",
            Status = "active",
        });
        var raw = File.ReadAllText(dir.Credential);
        Assert.Contains("protected:", raw);
        Assert.DoesNotContain(Secret, raw);
        Assert.DoesNotContain("credentialHash", raw);

        var reloaded = new ProtectedFileDeviceCredentialStore(dir.Credential, new ReversingDeviceSecretProtector()).Load();
        Assert.Equal(Secret, reloaded!.Secret);
        Assert.Equal("device-1", reloaded.EnrollmentId);
        Assert.Equal("11111111-1111-1111-1111-111111111111", reloaded.InstallationId);
        Assert.EndsWith(Path.Combine("Trilez", "device-credential.json"), ProtectedFileDeviceCredentialStore.DefaultPath());
    }

    [Fact]
    public async Task EnrollmentSurvivesANewWorkspaceAndHeartbeatsWithoutRegisteringAgain()
    {
        using var dir = new TempDir();
        var script = new Script();
        var firstTicker = new ManualHeartbeatTicker();
        var first = Workspace(script, dir, firstTicker);
        var signedIn = await first.SignInAsync("http://127.0.0.1:4010/api/ignored", Email, Password);
        Assert.True(signedIn.Succeeded);

        var enrolled = await first.EnrollDeviceAsync("لپ‌تاپ آزمون");

        Assert.True(enrolled.Succeeded);
        Assert.Equal("device-1", enrolled.EnrollmentId);
        Assert.Equal("ثبت‌شده", PresentationText.EnrollmentPhase(first.Enrollment.Phase));
        Assert.Equal(1, script.RegisterCalls);
        Assert.DoesNotContain("employeeId", script.LastRegisterBody);
        Assert.Contains("screen-share", script.LastRegisterBody);
        Assert.DoesNotContain("monitoring", script.LastRegisterBody);
        Assert.DoesNotContain("remote-control", script.LastRegisterBody);
        Assert.DoesNotContain(script.Calls, call => call.Contains("/api/data/devices", StringComparison.Ordinal));
        var settings = await File.ReadAllTextAsync(dir.Settings);
        var stored = await File.ReadAllTextAsync(dir.Credential);
        Assert.DoesNotContain(Secret, settings);
        Assert.DoesNotContain(Password, settings);
        Assert.DoesNotContain(Secret, stored);
        Assert.Contains("protected:", stored);

        var secondTicker = new ManualHeartbeatTicker();
        var second = Workspace(script, dir, secondTicker);
        var restarted = await second.SignInAsync("http://127.0.0.1:4010", Email, Password);
        Assert.True(restarted.Succeeded);
        Assert.Equal("device-1", second.Enrollment.EnrollmentId);
        Assert.Equal("آنلاین", PresentationText.DeviceConnection(second.Enrollment.ConnectionStatus));
        Assert.Equal(1, script.RegisterCalls);
        Assert.Contains("GET /api/me/agent-devices/device-1", script.Calls);
        Assert.True(secondTicker.IsRunning);

        await secondTicker.PulseAsync();
        Assert.Contains("POST /api/me/agent-devices/device-1/heartbeat", script.Calls);
        Assert.Equal(Secret, script.LastCredential);
        Assert.DoesNotContain("employeeId", script.LastHeartbeatBody);
        Assert.True(secondTicker.IsRunning);

        await second.SignOutAsync();
        Assert.False(second.IsSignedIn);
        Assert.Contains("POST /api/me/agent-devices/device-1/disconnect", script.Calls);
        Assert.Contains("POST /api/auth/logout", script.Calls);
        Assert.False(secondTicker.IsRunning);
        Assert.Equal(Secret, new ProtectedFileDeviceCredentialStore(dir.Credential, new ReversingDeviceSecretProtector()).Load()!.Secret);
        Assert.DoesNotContain(Secret, await File.ReadAllTextAsync(dir.Credential));
    }

    [Fact]
    public async Task DuplicateRegistrationPresentsTheStoredCredentialAndKeepsIt()
    {
        using var dir = new TempDir();
        var script = new Script();
        var workspace = Workspace(script, dir, new ManualHeartbeatTicker());
        await workspace.SignInAsync("http://127.0.0.1:4010", Email, Password);
        await workspace.EnrollDeviceAsync("لپ‌تاپ آزمون");
        script.LastCredential = null;

        var again = await workspace.EnrollDeviceAsync("لپ‌تاپ آزمون");

        Assert.True(again.Succeeded);
        Assert.Equal("device-1", again.EnrollmentId);
        Assert.Equal(Secret, script.LastCredential);
        Assert.Equal(2, script.RegisterCalls);
        Assert.Equal(1, script.SecretsIssued);
        Assert.Equal(Secret, new ProtectedFileDeviceCredentialStore(dir.Credential, new ReversingDeviceSecretProtector()).Load()!.Secret);
    }

    [Fact]
    public async Task RevokedHeartbeatStopsAndDoesNotClaimUnregister()
    {
        using var dir = new TempDir();
        var script = new Script();
        var ticker = new ManualHeartbeatTicker();
        var workspace = Workspace(script, dir, ticker);
        await workspace.SignInAsync("http://127.0.0.1:4010", Email, Password);
        await workspace.EnrollDeviceAsync("لپ‌تاپ آزمون");
        script.Mode = "revoked";

        await ticker.PulseAsync();

        Assert.Equal("revoked", workspace.Enrollment.Phase);
        Assert.Equal("ثبت این دستگاه لغو شده است.", workspace.Enrollment.Message);
        Assert.NotEqual(PresentationText.DeviceUnregistered, workspace.Enrollment.Message);
        Assert.False(ticker.IsRunning);
        Assert.Equal(Secret, new ProtectedFileDeviceCredentialStore(dir.Credential, new ReversingDeviceSecretProtector()).Load()!.Secret);
        Assert.DoesNotContain(Secret, workspace.Enrollment.Message);
    }

    [Fact]
    public async Task RevokedRegistrationDoesNotRetry()
    {
        using var dir = new TempDir();
        var script = new Script { Mode = "register-revoked" };
        var log = new DiagnosticLog(Path.Combine(dir.Path, "logs", "agent.log"));
        var workspace = Workspace(script, dir, new ManualHeartbeatTicker(), log);

        var enrolled = await workspace.SignInAsync("http://127.0.0.1:4010", Email, Password);
        Assert.True(enrolled.Succeeded);
        var result = await workspace.EnrollDeviceAsync("لپ‌تاپ آزمون");

        Assert.False(result.Succeeded);
        Assert.Equal("revoked", workspace.Enrollment.Phase);
        Assert.Equal(1, script.RegisterCalls);
        Assert.Equal(script.LastInstallationId, workspace.Enrollment.InstallationId);
        var stored = new ProtectedFileDeviceCredentialStore(dir.Credential, new ReversingDeviceSecretProtector()).Load();
        Assert.Equal("revoked", stored!.Status);
        Assert.Equal(script.LastInstallationId, stored.InstallationId);
        var text = await File.ReadAllTextAsync(log.Path);
        Assert.Contains("code=DEVICE_REVOKED", text);
        Assert.DoesNotContain(Secret, text);
        Assert.DoesNotContain(Password, text);
        Assert.DoesNotContain(Email, text);
    }

    [Fact]
    public async Task RevokedDeviceIsNotEnrolledAgainUntilTheEmployeeAsks()
    {
        using var dir = new TempDir();
        var script = new Script();
        var ticker = new ManualHeartbeatTicker();
        var workspace = Workspace(script, dir, ticker);
        await workspace.SignInAsync("http://127.0.0.1:4010", Email, Password);
        await workspace.EnrollDeviceAsync("لپ‌تاپ آزمون");
        var installationId = new ProtectedFileDeviceCredentialStore(dir.Credential, new ReversingDeviceSecretProtector()).Load()!.InstallationId;
        script.Mode = "revoked";

        await ticker.PulseAsync();
        Assert.Equal("revoked", workspace.Enrollment.Phase);
        Assert.False(ticker.IsRunning);
        Assert.Equal(1, script.RegisterCalls);

        await ticker.PulseAsync();
        Assert.Equal(1, script.RegisterCalls);

        await workspace.SignOutAsync();
        var restarted = await workspace.SignInAsync("http://127.0.0.1:4010", Email, Password);
        Assert.True(restarted.Succeeded);
        Assert.Equal("revoked", workspace.Enrollment.Phase);
        Assert.Equal(1, script.RegisterCalls);
        Assert.False(ticker.IsRunning);
        var kept = new ProtectedFileDeviceCredentialStore(dir.Credential, new ReversingDeviceSecretProtector()).Load();
        Assert.Equal(installationId, kept!.InstallationId);
        Assert.Equal(Secret, kept.Secret);

        script.Mode = "ok";
        var again = await workspace.EnrollDeviceAsync("لپ‌تاپ آزمون");
        Assert.True(again.Succeeded);
        Assert.Equal(2, script.RegisterCalls);
        Assert.NotEqual(installationId, new ProtectedFileDeviceCredentialStore(dir.Credential, new ReversingDeviceSecretProtector()).Load()!.InstallationId);
    }

    [Fact]
    public async Task HeartbeatOutageKeepsTheEnrollmentAndRetries()
    {
        using var dir = new TempDir();
        var script = new Script();
        var ticker = new ManualHeartbeatTicker();
        var log = new DiagnosticLog(Path.Combine(dir.Path, "logs", "agent.log"));
        var workspace = Workspace(script, dir, ticker, log);
        await workspace.SignInAsync("http://127.0.0.1:4010", Email, Password);
        await workspace.EnrollDeviceAsync("لپ‌تاپ آزمون");
        var installationId = workspace.Enrollment.InstallationId;
        script.Mode = "outage";

        await ticker.PulseAsync();
        await ticker.PulseAsync();

        Assert.Equal(1, script.RegisterCalls);
        Assert.True(ticker.IsRunning);
        Assert.Equal("active", workspace.Enrollment.Phase);
        Assert.Equal("offline", workspace.Enrollment.ConnectionStatus);
        Assert.Equal(installationId, workspace.Enrollment.InstallationId);
        Assert.Equal(Secret, new ProtectedFileDeviceCredentialStore(dir.Credential, new ReversingDeviceSecretProtector()).Load()!.Secret);
        var during = await File.ReadAllTextAsync(log.Path);
        Assert.Equal(1, Count(during, "heartbeat offline"));
        Assert.Contains("retry=true", during);
        Assert.DoesNotContain(Secret, during);
        Assert.DoesNotContain("eyJ", during);

        script.Mode = "ok";
        await ticker.PulseAsync();

        Assert.Equal(1, script.RegisterCalls);
        Assert.True(ticker.IsRunning);
        Assert.Equal("active", workspace.Enrollment.Phase);
        Assert.Equal("online", workspace.Enrollment.ConnectionStatus);
        var after = await File.ReadAllTextAsync(log.Path);
        Assert.Contains("heartbeat recovered", after);
        Assert.DoesNotContain(Email, after);
    }

    [Fact]
    public async Task InstallationConflictRetriesOnceAndRevokedStopsTheRetry()
    {
        using var dir = new TempDir();
        var conflict = new Script { Mode = "conflict-once" };
        var workspace = Workspace(conflict, dir, new ManualHeartbeatTicker());
        await workspace.SignInAsync("http://127.0.0.1:4010", Email, Password);
        var enrolled = await workspace.EnrollDeviceAsync("لپ‌تاپ آزمون");
        Assert.True(enrolled.Succeeded);
        Assert.Equal(2, conflict.RegisterCalls);
        Assert.Equal(1, conflict.SecretsIssued);

        using var revokedDir = new TempDir();
        var revoked = new Script { Mode = "conflict-then-revoked" };
        var second = Workspace(revoked, revokedDir, new ManualHeartbeatTicker());
        await second.SignInAsync("http://127.0.0.1:4010", Email, Password);
        var failed = await second.EnrollDeviceAsync("لپ‌تاپ آزمون");
        Assert.False(failed.Succeeded);
        Assert.Equal("revoked", second.Enrollment.Phase);
        Assert.Equal(2, revoked.RegisterCalls);
        Assert.Equal(revoked.LastInstallationId, second.Enrollment.InstallationId);
    }

    [Fact]
    public async Task StartWithWindowsSurvivesSignInAndRefresh()
    {
        using var dir = new TempDir();
        var store = new JsonAgentSettingsStore(dir.Settings);
        await store.SaveAsync(new AgentSettings
        {
            ApiBaseUrl = "http://127.0.0.1:4010",
            StartWithWindows = true,
            LastSuccessfulSyncUtc = DateTimeOffset.Parse("2026-10-01T00:00:00Z"),
        });
        var calls = new List<bool>();
        var workspace = Workspace(new Script(), dir, new ManualHeartbeatTicker(), startup: new RecordingStartup(calls));
        Assert.True(workspace.CurrentSettings.StartWithWindows);
        Assert.Equal(new[] { true }, calls);

        await workspace.SignInAsync("http://127.0.0.1:4010", Email, Password);
        Assert.True(workspace.CurrentSettings.StartWithWindows);
        await workspace.RefreshAsync();
        Assert.True(workspace.CurrentSettings.StartWithWindows);
        var raw = await File.ReadAllTextAsync(dir.Settings);
        Assert.Contains("startWithWindows", raw);
        Assert.Contains("true", raw);
        Assert.Contains("http://127.0.0.1:4010", raw);
        Assert.DoesNotContain(Password, raw);
        Assert.DoesNotContain("token", raw, StringComparison.OrdinalIgnoreCase);
    }

    private static int Count(string text, string value)
    {
        var count = 0;
        var index = 0;
        while ((index = text.IndexOf(value, index, StringComparison.Ordinal)) >= 0)
        {
            count++;
            index += value.Length;
        }
        return count;
    }

    [Fact]
    public async Task UnregisterClearsTheCredentialOnlyAfterTheServerConfirms()
    {
        using var dir = new TempDir();
        var script = new Script { Mode = "unregister-500" };
        var workspace = Workspace(script, dir, new ManualHeartbeatTicker());
        await workspace.SignInAsync("http://127.0.0.1:4010", Email, Password);
        await workspace.EnrollDeviceAsync("لپ‌تاپ آزمون");

        var failed = await workspace.UnregisterDeviceAsync();

        Assert.False(failed.Succeeded);
        Assert.NotEqual(PresentationText.DeviceUnregistered, failed.Message);
        Assert.True(File.Exists(dir.Credential));
        Assert.Equal(Secret, new ProtectedFileDeviceCredentialStore(dir.Credential, new ReversingDeviceSecretProtector()).Load()!.Secret);

        script.Mode = "ok";
        var removed = await workspace.UnregisterDeviceAsync();

        Assert.True(removed.Succeeded);
        Assert.Equal(PresentationText.DeviceUnregistered, removed.Message);
        Assert.False(File.Exists(dir.Credential));
        Assert.Equal("unenrolled", workspace.Enrollment.Phase);
    }

    [Fact]
    public async Task ShellShowsEnrollmentStateAndDoesNotAnnounceSuccessEarly()
    {
        var workspace = new FakeWorkspace();
        var shell = new ShellViewModel(workspace, new FixedClock())
        {
            ApiBaseUrl = "http://127.0.0.1:4000",
            Email = Email,
        };
        workspace.OnSignIn = (url, _, _) =>
        {
            workspace.IsSignedIn = true;
            workspace.CurrentSettings = new AgentSettings { ApiBaseUrl = TrilezApiClient.NormalizeBase(url).GetLeftPart(UriPartial.Authority) };
            return SignInResult.Ok(Sample());
        };
        await shell.SignInAsync(Password);
        shell.DeviceName = "   ";

        await shell.EnrollDeviceAsync();

        Assert.Equal(0, workspace.EnrollCalls);
        Assert.Equal(PresentationText.DeviceNameRequired, shell.ErrorMessage);
        Assert.Null(shell.SuccessMessage);

        shell.DeviceName = "لپ‌تاپ آزمون";
        workspace.OnEnroll = name =>
        {
            Assert.Equal("لپ‌تاپ آزمون", name);
            return DeviceCommandResult.Fail("ثبت این دستگاه لغو شده است.", new DeviceEnrollmentSnapshot
            {
                Phase = "revoked",
                ConnectionStatus = "offline",
                Message = "ثبت این دستگاه لغو شده است.",
            });
        };
        await shell.EnrollDeviceAsync();
        Assert.Equal(1, workspace.EnrollCalls);
        Assert.Equal("لغو‌شده", shell.EnrollmentStateLabel);
        Assert.Equal("ثبت این دستگاه لغو شده است.", shell.ErrorMessage);
        Assert.Null(shell.SuccessMessage);
        Assert.DoesNotContain(Secret, shell.EnrollmentDetail);

        workspace.OnEnroll = _ => DeviceCommandResult.Ok(new DeviceEnrollmentSnapshot
        {
            Phase = "active",
            ConnectionStatus = "online",
            EnrollmentId = "device-9",
            DeviceName = "لپ‌تاپ آزمون",
            AgentVersion = "0.2.0",
            LastSeenAt = DateTimeOffset.Parse("2026-10-16T08:00:00Z"),
            CanUnregister = true,
        }, PresentationText.DeviceEnrolled("device-9"));
        await shell.EnrollDeviceAsync();
        Assert.Equal("دستگاه ثبت شد. شناسه device-9", shell.SuccessMessage);
        Assert.Equal("ثبت‌شده", shell.EnrollmentStateLabel);
        Assert.Equal("آنلاین", shell.EnrollmentConnectionLabel);
        Assert.True(shell.Diagnostics.Contains("شروع همراه ویندوز: خاموش", StringComparison.Ordinal) || shell.Diagnostics.Contains("شروع همراه رایانه: خاموش", StringComparison.Ordinal));
        Assert.Contains("ثبت دستگاه: ثبت‌شده / آنلاین", shell.Diagnostics);
        Assert.DoesNotContain("device-9", shell.Diagnostics);
        Assert.Contains("پایش", shell.EnrollmentDetail);
        Assert.Contains("1405", shell.EnrollmentDetail);
        Assert.DoesNotContain("2026-10-15", shell.EnrollmentDetail);

        var enrolledName = shell.DeviceName;
        await shell.SignOutAsync();
        Assert.Equal("", shell.EnrollmentStateLabel);
        Assert.NotEqual(enrolledName, shell.DeviceName);
        Assert.False(shell.IsSignedIn);
    }

    [Fact]
    public async Task HeartbeatSessionDropSignsTheShellOutWithoutTouchingTheDashboard()
    {
        var workspace = new FakeWorkspace();
        var shell = new ShellViewModel(workspace, new FixedClock())
        {
            ApiBaseUrl = "http://127.0.0.1:4000",
            Email = Email,
        };
        workspace.OnSignIn = (url, _, _) =>
        {
            workspace.IsSignedIn = true;
            workspace.CurrentSettings = new AgentSettings { ApiBaseUrl = TrilezApiClient.NormalizeBase(url).GetLeftPart(UriPartial.Authority) };
            return SignInResult.Ok(Sample());
        };
        await shell.SignInAsync(Password);
        Assert.True(shell.IsSignedIn);

        workspace.IsSignedIn = false;
        workspace.Enrollment = DeviceEnrollmentSnapshot.Unenrolled();
        workspace.NotifyEnrollmentChanged();

        Assert.False(shell.IsSignedIn);
        Assert.Equal("", shell.EnrollmentStateLabel);
        Assert.Equal(UserMessages.For(401, "SESSION_REVOKED"), shell.ErrorMessage);
    }

    private static TrilezEmployeeWorkspace Workspace(Script script, TempDir dir, IHeartbeatTicker ticker, DiagnosticLog? log = null, IStartupRegistration? startup = null)
    {
        var settings = new JsonAgentSettingsStore(dir.Settings);
        var devices = new ProtectedFileDeviceCredentialStore(dir.Credential, new ReversingDeviceSecretProtector());
        return new TrilezEmployeeWorkspace(settings, (url, session) =>
        {
            var http = new HttpClient(script) { Timeout = TimeSpan.FromSeconds(5) };
            return new TrilezApiClient(http, TrilezApiClient.NormalizeBase(url), session);
        }, devices, ticker, diagnosticLog: log, startup: startup);
    }

    private sealed class RecordingStartup(List<bool> calls) : IStartupRegistration
    {
        public void Apply(bool enabled) => calls.Add(enabled);
    }

    private static EmployeeDashboard Sample() => new()
    {
        Profile = new EmployeeProfile
        {
            Id = "user-7", Name = "آزاده نعمتی", Email = Email, Role = "member", IsActive = true,
            EmployeeState = "active", EmployeeId = "employee-7",
        },
        Connected = true,
        PasswordChangeRequired = false,
        Tasks = [],
        Projects = [],
        Meetings = [],
        Notifications = [],
        AttendanceRecords = [],
        Timesheets = [],
        Attendance = new SectionNote { State = SectionState.Empty, Message = "برای امروز حضور ثبت نشده است." },
        WorkTime = new SectionNote { State = SectionState.Empty, Message = "ساعت کاری ثبت نشده است." },
        Device = new SectionNote { State = SectionState.Unavailable, Message = "ثبت دستگاه و telemetry برای حساب کارمند هنوز API جداگانه‌ای ندارد." },
        ScreenSharing = new SectionNote { State = SectionState.Unavailable, Message = "اشتراک صفحه خاموش است." },
        Today = new TodayAttendance { Date = "2026-10-16", ClocksRecorded = false },
    };

    private sealed class FixedClock : IClock
    {
        public DateTimeOffset UtcNow => DateTimeOffset.Parse("2026-10-15T20:30:00Z");
        public DateOnly Today => new(2026, 10, 16);
    }

    private sealed class TempDir : IDisposable
    {
        public TempDir()
        {
            Path = Directory.CreateTempSubdirectory("trilez-device-").FullName;
            Settings = System.IO.Path.Combine(Path, "agent-settings.json");
            Credential = System.IO.Path.Combine(Path, "device-credential.json");
        }

        public string Path { get; }
        public string Settings { get; }
        public string Credential { get; }
        public void Dispose() => Directory.Delete(Path, recursive: true);
    }

    private sealed class Script : HttpMessageHandler
    {
        public string Mode { get; set; } = "ok";
        public List<string> Calls { get; } = [];
        public int RegisterCalls { get; private set; }
        public int SecretsIssued { get; private set; }
        public string LastRegisterBody { get; private set; } = "";
        public string LastHeartbeatBody { get; private set; } = "";
        public string? LastCredential { get; set; }
        public string LastInstallationId => _installationId;
        private string _installationId = "";

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var path = request.RequestUri!.AbsolutePath;
            var method = request.Method.Method;
            var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
            Calls.Add(method + " " + path);
            LastCredential = request.Headers.TryGetValues("X-Device-Credential", out var values) ? values.Single() : null;
            if (method == "POST" && path == "/api/me/agent-devices")
            {
                RegisterCalls++;
                LastRegisterBody = body;
            }
            if (path.EndsWith("/heartbeat", StringComparison.Ordinal)) LastHeartbeatBody = body;
            return Respond(method, path, body);
        }

        private HttpResponseMessage Respond(string method, string path, string body)
        {
            if (path == "/api/health/live") return Json(HttpStatusCode.OK, """{"ok":true}""");
            if (path == "/api/auth/login") return Json(HttpStatusCode.OK, "{\"token\":\"eyJhbGciOiJub25lIn0.payload.sig\",\"user\":{\"id\":\"user-7\",\"name\":\"آزاده نعمتی\",\"email\":\"" + Email + "\",\"role\":\"member\",\"isActive\":true,\"mustChangePassword\":false}}");
            if (path == "/api/auth/me") return Json(HttpStatusCode.OK, "{\"user\":{\"id\":\"user-7\",\"name\":\"آزاده نعمتی\",\"email\":\"" + Email + "\",\"role\":\"member\",\"isActive\":true,\"mustChangePassword\":false},\"employee\":{\"state\":\"active\",\"employeeId\":\"employee-7\",\"employmentStatus\":\"active\"}}");
            if (path == "/api/auth/refresh") return Json(HttpStatusCode.Unauthorized, """{"error":"Session is revoked or expired","code":"SESSION_REVOKED"}""");
            if (path == "/api/auth/logout") return new HttpResponseMessage(HttpStatusCode.NoContent);
            if (method == "POST" && path == "/api/me/agent-devices") return Register(body);
            if (method == "GET" && path == "/api/me/agent-devices/device-1")
            {
                if (Mode == "revoked") return Json(HttpStatusCode.Forbidden, """{"error":"revoked","code":"DEVICE_REVOKED"}""");
                return Json(HttpStatusCode.OK, Device("online", "active"));
            }
            if (method == "POST" && path == "/api/me/agent-devices/device-1/heartbeat")
            {
                if (Mode == "revoked") return Json(HttpStatusCode.Forbidden, "{\"error\":\"" + Secret + "\",\"code\":\"DEVICE_REVOKED\"}");
                if (Mode is "outage" or "offline") return Json(HttpStatusCode.ServiceUnavailable, """{"error":"unavailable","code":"UNAVAILABLE"}""");
                return Json(HttpStatusCode.OK, Device("online", "active"));
            }
            if (method == "POST" && path == "/api/me/agent-devices/device-1/disconnect") return Json(HttpStatusCode.OK, Device("offline", "active"));
            if (method == "POST" && path == "/api/me/agent-devices/device-1/unregister")
            {
                if (Mode == "unregister-500") return Json(HttpStatusCode.InternalServerError, """{"error":"Internal server error","code":"INTERNAL_ERROR"}""");
                return Json(HttpStatusCode.OK, Device("offline", "revoked"));
            }
            return Json(HttpStatusCode.OK, """{"data":[],"page":{"limit":200,"hasMore":false}}""");
        }

        private HttpResponseMessage Register(string body)
        {
            using var document = JsonDocument.Parse(body);
            _installationId = document.RootElement.GetProperty("installationId").GetString() ?? "";
            if (Mode == "register-revoked")
                return Json(HttpStatusCode.Forbidden, """{"error":"revoked","code":"DEVICE_REVOKED"}""");
            if (Mode == "conflict-once")
            {
                Mode = "ok";
                return Json(HttpStatusCode.Conflict, """{"error":"conflict","code":"DEVICE_INSTALLATION_CONFLICT"}""");
            }
            if (Mode == "conflict-then-revoked")
            {
                Mode = "register-revoked";
                return Json(HttpStatusCode.Conflict, """{"error":"conflict","code":"DEVICE_INSTALLATION_CONFLICT"}""");
            }
            if (LastCredential == Secret)
                return Json(HttpStatusCode.OK, "{\"data\":" + DeviceData("offline", "active") + ",\"created\":false}");
            SecretsIssued++;
            return Json(HttpStatusCode.Created, "{\"data\":" + DeviceData("offline", "active") + ",\"created\":true,\"credential\":\"" + Secret + "\"}");
        }

        private string Device(string connection, string status) => "{\"data\":" + DeviceData(connection, status) + "}";

        private string DeviceData(string connection, string status) =>
            "{\"id\":\"device-1\",\"installationId\":\"" + _installationId + "\",\"deviceName\":\"لپ‌تاپ آزمون\",\"agentVersion\":\"0.2.0\",\"capabilities\":[\"employee-dashboard\",\"time-entry\",\"attendance-read\"],\"status\":\"" + status + "\",\"connectionStatus\":\"" + connection + "\",\"lastSeenAt\":\"2026-10-16T08:00:00Z\"}";

        private static HttpResponseMessage Json(HttpStatusCode status, string body) =>
            new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
    }
}
