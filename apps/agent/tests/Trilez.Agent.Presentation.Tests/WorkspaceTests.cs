using System.Net;
using System.Text;
using System.Text.Json;
using Trilez.Agent;
using Trilez.Agent.Presentation;
using Xunit;

namespace Trilez.Agent.Presentation.Tests;

public sealed class WorkspaceTests
{
    private const string Password = "StrongPassword123!";
    private const string Email = "azadeh.desktop@example.com";
    private const string Token = "eyJhbGciOiJub25lIn0.payload.sig";

    [Fact]
    public async Task SignInPersistsTheOriginAndNotThePasswordOrToken()
    {
        using var dir = Temp();
        var script = new Script();
        var workspace = Workspace(script, dir.Path);
        var result = await workspace.SignInAsync("http://127.0.0.1:4010/api/ignored", Email, Password);

        Assert.True(result.Succeeded);
        Assert.Equal("آزاده نعمتی", result.Dashboard!.Profile.Name);
        Assert.True(workspace.IsSignedIn);
        Assert.Equal("http://127.0.0.1:4010", workspace.CurrentSettings.ApiBaseUrl);
        Assert.NotNull(workspace.LastSuccessfulSyncUtc);
        var raw = await File.ReadAllTextAsync(dir.File);
        Assert.Contains("apiBaseUrl", raw);
        Assert.Contains("http://127.0.0.1:4010", raw);
        Assert.Contains("lastSuccessfulSyncUtc", raw);
        Assert.DoesNotContain(Password, raw);
        Assert.DoesNotContain(Token, raw);
        Assert.DoesNotContain("eyJ", raw);
        Assert.DoesNotContain("Bearer", raw);
        var log = Log(script);
        Assert.Contains("\nGET /api/health/live", log);
        Assert.Contains("\nPOST /api/auth/login", log);
        Assert.Contains("\nGET /api/auth/me", log);
        Assert.Contains("\nGET /api/me/tasks", log);
        Assert.Contains("\nGET /api/data/project-members", log);
        Assert.Contains("\nGET /api/projects", log);
        Assert.Contains("\nGET /api/me/meetings", log);
        Assert.Contains("\nGET /api/me/notifications", log);
        Assert.Contains("\nGET /api/me/attendance", log);
        Assert.Contains("\nGET /api/me/timesheets", log);
    }

    [Fact]
    public async Task LoginFailureIsPersianAndStoresNothingSecret()
    {
        using var dir = Temp();
        var script = new Script { Mode = "login-401" };
        var workspace = Workspace(script, dir.Path);

        var result = await workspace.SignInAsync("http://127.0.0.1:4010", Email, Password);

        Assert.False(result.Succeeded);
        Assert.False(workspace.IsSignedIn);
        Assert.Equal("برای ادامه باید دوباره وارد تری‌لیز شوید.", result.Message);
        Assert.DoesNotContain("SuperSecret", result.Message);
        Assert.False(File.Exists(dir.File));
    }

    [Fact]
    public async Task UserInfoInTheApiUrlIsRejected()
    {
        using var dir = Temp();
        var workspace = Workspace(new Script(), dir.Path);

        var result = await workspace.SignInAsync("http://user:SecretToken@127.0.0.1:4010", Email, Password);

        Assert.False(result.Succeeded);
        Assert.Equal(PresentationText.InvalidUrl, result.Message);
        Assert.False(workspace.IsSignedIn);
        Assert.False(File.Exists(dir.File));
    }

    [Fact]
    public async Task PasswordChangeDoesNotCountAsASuccessfulSync()
    {
        using var dir = Temp();
        var script = new Script { Mode = "password" };
        var workspace = Workspace(script, dir.Path);

        var result = await workspace.SignInAsync("http://127.0.0.1:4010", Email, Password);

        Assert.True(result.Succeeded);
        Assert.True(result.Dashboard!.PasswordChangeRequired);
        Assert.Null(workspace.LastSuccessfulSyncUtc);
        Assert.DoesNotContain("\nGET /api/me/tasks", Log(script));
        var raw = await File.ReadAllTextAsync(dir.File);
        Assert.DoesNotContain(Password, raw);
        Assert.DoesNotContain("eyJ", raw);
    }

    [Fact]
    public async Task TimeEntryUsesTheCreatedRecordAndDropsForeignFields()
    {
        using var dir = Temp();
        var script = new Script();
        var workspace = Workspace(script, dir.Path);
        await workspace.SignInAsync("http://127.0.0.1:4010", Email, Password);

        var saved = await workspace.SubmitTimeEntryAsync(new TimeEntryDraft
        {
            ProjectId = "project-7",
            TaskId = "task-7",
            Date = "2026-10-16",
            Hours = 1.5m,
            Description = "یادداشت",
            Billable = true,
        });

        Assert.True(saved.Saved);
        Assert.Equal("time-9", saved.Record!.Id);
        using var body = JsonDocument.Parse(script.LastPostBody!);
        Assert.False(body.RootElement.TryGetProperty("employeeId", out _));
        Assert.False(body.RootElement.TryGetProperty("status", out _));
        Assert.False(body.RootElement.TryGetProperty("hourlyRate", out _));
        Assert.False(body.RootElement.TryGetProperty("calculatedCost", out _));
        Assert.False(body.RootElement.TryGetProperty("billingStatus", out _));
        Assert.Equal("project-7", body.RootElement.GetProperty("projectId").GetString());
        Assert.Equal(1.5d, body.RootElement.GetProperty("hours").GetDouble());

        script.Mode = "time-400";
        var rejected = await workspace.SubmitTimeEntryAsync(new TimeEntryDraft
        {
            ProjectId = "project-7",
            TaskId = "task-7",
            Date = "2026-10-16",
            Hours = 2m,
        });
        Assert.False(rejected.Saved);
        Assert.False(rejected.SessionExpired);
        Assert.Equal("درخواست نامعتبر است.", rejected.Message);

        script.Mode = "time-empty";
        var empty = await workspace.SubmitTimeEntryAsync(new TimeEntryDraft
        {
            ProjectId = "project-7",
            TaskId = "task-7",
            Date = "2026-10-16",
            Hours = 2m,
        });
        Assert.False(empty.Saved);
    }

    [Fact]
    public async Task RevokedTimeEntryClearsTheSession()
    {
        using var dir = Temp();
        var script = new Script();
        var workspace = Workspace(script, dir.Path);
        await workspace.SignInAsync("http://127.0.0.1:4010", Email, Password);
        script.Mode = "time-401";

        var result = await workspace.SubmitTimeEntryAsync(new TimeEntryDraft
        {
            ProjectId = "project-7",
            TaskId = "task-7",
            Date = "2026-10-16",
            Hours = 1m,
        });

        Assert.False(result.Saved);
        Assert.True(result.SessionExpired);
        Assert.Equal("نشست لغو یا منقضی شده است. دوباره وارد شوید.", result.Message);
        Assert.False(workspace.IsSignedIn);
        Assert.Contains("\nPOST /api/auth/refresh", Log(script));
    }

    [Fact]
    public async Task SignOutDropsTheSessionWhenLogoutFails()
    {
        using var dir = Temp();
        var script = new Script { Mode = "logout-500" };
        var workspace = Workspace(script, dir.Path);
        await workspace.SignInAsync("http://127.0.0.1:4010", Email, Password);

        await workspace.SignOutAsync();

        Assert.False(workspace.IsSignedIn);
        Assert.Contains("\nPOST /api/auth/logout", Log(script));
        var refresh = await workspace.RefreshAsync();
        Assert.Equal(ConnectionState.SessionExpired, refresh.Connection);
        Assert.Null(refresh.Dashboard);
    }

    [Fact]
    public async Task SettingsStoreDropsSecretsAndRejectsUserInfo()
    {
        using var dir = Temp();
        var path = dir.File;
        await File.WriteAllTextAsync(path, """{"apiBaseUrl":"http://127.0.0.1:4000","password":"StrongPassword123!","token":"eyJ.secret","accessToken":"Bearer secret"}""");
        var store = new JsonAgentSettingsStore(path);
        var loaded = store.Load();
        Assert.Equal("http://127.0.0.1:4000", loaded.ApiBaseUrl);
        loaded.LastSuccessfulSyncUtc = DateTimeOffset.Parse("2026-10-16T00:00:00Z");
        await store.SaveAsync(loaded);
        var raw = await File.ReadAllTextAsync(path);
        Assert.Contains("apiBaseUrl", raw);
        Assert.Contains("lastSuccessfulSyncUtc", raw);
        Assert.DoesNotContain("StrongPassword123!", raw);
        Assert.DoesNotContain("eyJ", raw);
        Assert.DoesNotContain("password", raw, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("token", raw, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Bearer", raw);

        await File.WriteAllTextAsync(path, "{");
        Assert.Equal("", store.Load().ApiBaseUrl);

        var workspace = new TrilezEmployeeWorkspace(store);
        await Assert.ThrowsAsync<ArgumentException>(() => workspace.SaveSettingsAsync(new AgentSettings { ApiBaseUrl = "http://user:SecretToken@127.0.0.1:4000" }));
        Assert.DoesNotContain("SecretToken", await File.ReadAllTextAsync(path));
        Assert.EndsWith(Path.Combine("Trilez", "agent-settings.json"), JsonAgentSettingsStore.DefaultPath());
    }

    private static TrilezEmployeeWorkspace Workspace(Script script, string directory)
    {
        var store = new JsonAgentSettingsStore(Path.Combine(directory, "agent-settings.json"));
        return new TrilezEmployeeWorkspace(store, (url, session) =>
        {
            var http = new HttpClient(script) { Timeout = TimeSpan.FromSeconds(5) };
            return new TrilezApiClient(http, TrilezApiClient.NormalizeBase(url), session);
        });
    }

    private static string Log(Script script) => "\n" + string.Join('\n', script.Calls);

    private static TempDir Temp() => new();

    private sealed class TempDir : IDisposable
    {
        public TempDir()
        {
            Path = Directory.CreateTempSubdirectory("trilez-agent-").FullName;
            File = System.IO.Path.Combine(Path, "agent-settings.json");
        }

        public string Path { get; }
        public string File { get; }
        public void Dispose() => Directory.Delete(Path, recursive: true);
    }

    private sealed class Script : HttpMessageHandler
    {
        public string Mode { get; set; } = "ok";
        public List<string> Calls { get; } = [];
        public string? LastPostBody { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var path = request.RequestUri!.AbsolutePath;
            var method = request.Method.Method;
            var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
            Calls.Add(method + " " + path);
            if (method == "POST" && path == "/api/me/timesheets") LastPostBody = body;
            return Respond(method, path);
        }

        private HttpResponseMessage Respond(string method, string path)
        {
            if (path == "/api/health/live") return Json(HttpStatusCode.OK, """{"ok":true}""");
            if (path == "/api/auth/login")
            {
                if (Mode == "login-401")
                    return Json(HttpStatusCode.Unauthorized, """{"error":"password=SuperSecret","code":"INVALID_CREDENTIALS"}""");
                return Json(HttpStatusCode.OK, LoginBody(Mode == "password"));
            }
            if (path == "/api/auth/me") return Json(HttpStatusCode.OK, MeBody(Mode == "password"));
            if (path == "/api/auth/refresh")
                return Json(HttpStatusCode.Unauthorized, """{"error":"Session is revoked or expired","code":"SESSION_REVOKED"}""");
            if (path == "/api/auth/logout")
                return Mode == "logout-500"
                    ? Json(HttpStatusCode.InternalServerError, """{"error":"token=eyJ.secret","code":"INTERNAL_ERROR"}""")
                    : new HttpResponseMessage(HttpStatusCode.NoContent);
            if (method == "POST" && path == "/api/me/timesheets")
            {
                if (Mode == "time-400")
                    return Json(HttpStatusCode.BadRequest, """{"error":"Validation failed","code":"VALIDATION_ERROR","issues":[{"path":"body.hours","code":"invalid","message":"bad"}]}""");
                if (Mode == "time-401")
                    return Json(HttpStatusCode.Unauthorized, """{"error":"Session is revoked or expired","code":"SESSION_REVOKED"}""");
                if (Mode == "time-empty")
                    return Json(HttpStatusCode.Created, """{"data":{"id":""}}""");
                return Json(HttpStatusCode.Created, """{"data":{"id":"time-9","projectId":"project-7","taskId":"task-7","date":"2026-10-16","hours":1.5,"status":"pending_review","billable":true}}""");
            }
            return Json(HttpStatusCode.OK, """{"data":[],"page":{"limit":200,"hasMore":false}}""");
        }

        private static string LoginBody(bool passwordChange)
        {
            var flag = passwordChange ? "true" : "false";
            return "{\"token\":\"" + Token + "\",\"user\":{\"id\":\"user-7\",\"name\":\"آزاده نعمتی\",\"email\":\"" + Email + "\",\"role\":\"member\",\"isActive\":true,\"mustChangePassword\":" + flag + "}}";
        }

        private static string MeBody(bool passwordChange) => passwordChange
            ? "{\"user\":{\"id\":\"user-7\",\"name\":\"آزاده نعمتی\",\"email\":\"" + Email + "\",\"role\":\"member\",\"isActive\":true,\"mustChangePassword\":true},\"employee\":{\"state\":\"none\",\"employeeId\":null}}"
            : "{\"user\":{\"id\":\"user-7\",\"name\":\"آزاده نعمتی\",\"email\":\"" + Email + "\",\"role\":\"member\",\"isActive\":true,\"mustChangePassword\":false},\"employee\":{\"state\":\"active\",\"employeeId\":\"employee-7\",\"employmentStatus\":\"active\"}}";

        private static HttpResponseMessage Json(HttpStatusCode status, string body) =>
            new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
    }
}
