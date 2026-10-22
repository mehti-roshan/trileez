using System.Net;
using System.Net.Http;
using System.Text;
using Trilez.Agent;
using Trilez.Agent.Presentation;
using Xunit;

namespace Trilez.Agent.Presentation.Tests;

public sealed class ScreenShareTests
{
    private const string Secret = "device-secret-value";
    private const string Email = "screen.agent@example.com";
    private const string Password = "StrongPassword123!";
    private const string DeviceId = "device-screen-1";
    private static readonly byte[] Marker = Encoding.ASCII.GetBytes("SCREEN-FRAME-MARKER");

    [Fact]
    public void IntervalsStayInsideTheAssistanceRange()
    {
        Assert.Equal(TimeSpan.FromSeconds(5), ScreenShareCoordinator.ClampPoll(null));
        Assert.Equal(TimeSpan.FromSeconds(2), ScreenShareCoordinator.ClampPoll(TimeSpan.FromSeconds(1)));
        Assert.Equal(TimeSpan.FromSeconds(30), ScreenShareCoordinator.ClampPoll(TimeSpan.FromSeconds(90)));
        Assert.Equal(TimeSpan.FromMilliseconds(500), ScreenShareCoordinator.ClampFrame(null));
        Assert.Equal(TimeSpan.FromMilliseconds(200), ScreenShareCoordinator.ClampFrame(TimeSpan.FromMilliseconds(50)));
        Assert.Equal(TimeSpan.FromMilliseconds(1000), ScreenShareCoordinator.ClampFrame(TimeSpan.FromSeconds(5)));
    }

    [Fact]
    public async Task ARequestDoesNotCaptureUntilTheEmployeeAccepts()
    {
        var capturer = new FakeCapturer();
        var poll = new ManualHeartbeatTicker();
        var frame = new ManualHeartbeatTicker();
        var script = new Script { State = "requested" };
        var coordinator = Coordinator(capturer, poll, frame, script);

        coordinator.Start();
        await poll.PulseAsync();
        await frame.PulseAsync();

        Assert.Equal("requested", coordinator.Snapshot.Phase);
        Assert.True(coordinator.Snapshot.CanAccept);
        Assert.Equal(0, capturer.Starts);
        Assert.Equal(0, capturer.Captures);
        Assert.False(capturer.IsCapturing);
        Assert.Empty(script.Frames);
    }

    [Fact]
    public async Task AnAlreadyActiveSessionIsEndedAndDoesNotCapture()
    {
        var capturer = new FakeCapturer();
        var poll = new ManualHeartbeatTicker();
        var frame = new ManualHeartbeatTicker();
        var script = new Script { State = "active" };
        var coordinator = Coordinator(capturer, poll, frame, script);

        coordinator.Start();
        await poll.PulseAsync();
        await frame.PulseAsync();

        Assert.Equal("agent_lost", script.EndReason);
        Assert.Equal("ended", coordinator.Snapshot.Phase);
        Assert.Equal(0, capturer.Starts);
        Assert.Equal(0, capturer.Captures);
        Assert.False(capturer.IsCapturing);
        Assert.Empty(script.Frames);
    }

    [Fact]
    public async Task ViewingDoesNotGrantControlAndAValidGrantStillBlocksInput()
    {
        const string grantId = "cg-11111111-1111-4111-8111-111111111111";
        var capturer = new FakeCapturer();
        var poll = new ManualHeartbeatTicker();
        var frame = new ManualHeartbeatTicker();
        var script = new Script { State = "requested" };
        var coordinator = Coordinator(capturer, poll, frame, script);

        coordinator.Start();
        await poll.PulseAsync();
        Assert.Equal("off", coordinator.Snapshot.ControlState);
        Assert.False(coordinator.Snapshot.CanGrantControl);
        Assert.Equal(0, capturer.Captures);

        Assert.True((await coordinator.AcceptAsync()).Succeeded);
        Assert.Equal("off", coordinator.Snapshot.ControlState);
        Assert.False(coordinator.Snapshot.CanGrantControl);
        Assert.Equal(0, capturer.Captures);

        script.ControlState = "requested";
        script.ControlGrantId = grantId;
        script.PermittedJson = "[\"screen-share\"]";
        await poll.PulseAsync();
        var requestedDetail = PresentationText.ScreenShareDetail(coordinator.Snapshot);
        Assert.True(coordinator.Snapshot.CanGrantControl);
        Assert.True(coordinator.Snapshot.CanDenyControl);
        Assert.True(coordinator.Snapshot.CanRevokeControl);
        Assert.Contains("پشتیبانی کنترل ورودی خواسته است", requestedDetail);
        Assert.DoesNotContain(grantId, requestedDetail);
        Assert.Equal(0, capturer.Captures);

        Assert.True((await coordinator.DecideControlAsync("grant")).Succeeded);
        Assert.Equal("grant", script.LastControlAction);
        var controlBody = script.LastControlBody ?? "";
        Assert.Contains("\"action\":\"grant\"", controlBody);
        Assert.DoesNotContain("command", controlBody);
        Assert.DoesNotContain("shell", controlBody);
        Assert.Equal("granted", coordinator.Snapshot.ControlState);
        Assert.Equal("input_plane_unavailable", coordinator.Snapshot.InputBlockedReason);
        Assert.False(coordinator.Snapshot.CanGrantControl);
        Assert.True(coordinator.Snapshot.CanRevokeControl);
        Assert.Equal(0, capturer.Captures);
        var grantedDetail = PresentationText.ScreenShareDetail(coordinator.Snapshot);
        Assert.Contains("ورودی را به سیستم‌عامل نمی‌فرستد", grantedDetail);
        Assert.DoesNotContain(grantId, grantedDetail);

        Assert.True((await coordinator.DecideControlAsync("revoke")).Succeeded);
        Assert.Equal("revoke", script.LastControlAction);
        Assert.Equal("revoked", coordinator.Snapshot.ControlState);
        Assert.False(coordinator.Snapshot.CanRevokeControl);
        Assert.Equal(0, capturer.Captures);
        Assert.False(capturer.IsCapturing);
    }

    [Fact]
    public async Task CaptureStopsOnConnectionLossAndResumesOnlyAfterTheSessionIsConfirmed()
    {
        var capturer = new FakeCapturer();
        var poll = new ManualHeartbeatTicker();
        var frame = new ManualHeartbeatTicker();
        var script = new Script { State = "requested" };
        var coordinator = Coordinator(capturer, poll, frame, script);

        coordinator.Start();
        await poll.PulseAsync();
        var accepted = await coordinator.AcceptAsync();
        Assert.True(accepted.Succeeded);
        Assert.Equal(0, capturer.Captures);

        await frame.PulseAsync();
        Assert.Equal(1, capturer.Starts);
        Assert.Equal(1, capturer.Captures);
        Assert.True(capturer.IsCapturing);
        var uploaded = Assert.Single(script.Frames);
        Assert.Equal(0xFF, uploaded[0]);
        Assert.Equal(0xD8, uploaded[1]);
        Assert.Contains("SCREEN-FRAME-MARKER", Encoding.ASCII.GetString(uploaded));
        Assert.Equal("image/jpeg", script.FrameContentType);
        Assert.NotEmpty(script.Credentials);
        Assert.All(script.Credentials, value => Assert.Equal(Secret, value));

        script.Offline = true;
        await frame.PulseAsync();
        Assert.False(capturer.IsCapturing);
        Assert.Equal(1, capturer.Captures);
        Assert.Equal("offline", coordinator.Snapshot.Phase);
        Assert.Single(script.Frames);

        script.Offline = false;
        await frame.PulseAsync();
        Assert.Equal(2, capturer.Captures);
        Assert.True(capturer.IsCapturing);

        var stopped = await coordinator.StopSharingAsync("employee_stop");
        Assert.True(stopped.Succeeded);
        Assert.False(capturer.IsCapturing);
        Assert.Equal("employee_stop", script.EndReason);
        Assert.Equal("ended", coordinator.Snapshot.Phase);
        Assert.True(capturer.Stops >= 1);
    }

    [Fact]
    public async Task AuthorizationFailureStopsCaptureWithoutAnotherFrame()
    {
        var capturer = new FakeCapturer();
        var poll = new ManualHeartbeatTicker();
        var frame = new ManualHeartbeatTicker();
        var script = new Script { State = "requested", Mode = "credential" };
        TrilezApiException? seen = null;
        var coordinator = Coordinator(capturer, poll, frame, script, error => seen = error);

        coordinator.Start();
        await poll.PulseAsync();
        await frame.PulseAsync();

        Assert.Equal("DEVICE_CREDENTIAL_REJECTED", seen?.Code);
        Assert.Equal(0, capturer.Starts);
        Assert.Equal(0, capturer.Captures);
        Assert.False(capturer.IsCapturing);
        Assert.False(poll.IsRunning);
    }

    [Fact]
    public void DisposeStopsCapture()
    {
        var capturer = new FakeCapturer();
        capturer.Start();
        var coordinator = Coordinator(capturer, new ManualHeartbeatTicker(), new ManualHeartbeatTicker(), new Script());

        coordinator.Dispose();

        Assert.False(capturer.IsCapturing);
        Assert.True(capturer.Stops >= 1);
    }

    [Fact]
    public async Task ShutdownEndsTheSessionAndLeavesTheSettingsFileWithoutFrames()
    {
        using var dir = new TempDir();
        var capturer = new FakeCapturer();
        var poll = new ManualHeartbeatTicker();
        var frame = new ManualHeartbeatTicker();
        var devices = StoredDevice();
        var script = new WorkspaceScript();
        var workspace = new TrilezEmployeeWorkspace(
            new JsonAgentSettingsStore(dir.Settings),
            (url, session) => new TrilezApiClient(new HttpClient(script) { Timeout = TimeSpan.FromSeconds(5) }, TrilezApiClient.NormalizeBase(url), session),
            devices,
            new IdleHeartbeatTicker(),
            screenCapturer: capturer,
            screenPollTicker: poll,
            screenFrameTicker: frame);

        Assert.True((await workspace.SignInAsync("http://127.0.0.1:4000", Email, Password)).Succeeded);
        await poll.PulseAsync();
        Assert.Equal(0, capturer.Captures);
        Assert.Equal("requested", workspace.ScreenShare.Phase);
        Assert.True((await workspace.AcceptScreenShareAsync()).Succeeded);
        await frame.PulseAsync();
        Assert.Equal(1, capturer.Captures);
        await workspace.SignOutAsync();

        Assert.False(workspace.IsSignedIn);
        Assert.False(capturer.IsCapturing);
        Assert.Equal("shutdown", script.EndReason);
        var settings = await File.ReadAllTextAsync(dir.Settings);
        Assert.DoesNotContain("SCREEN-FRAME-MARKER", settings);
        Assert.DoesNotContain(Secret, settings);
        Assert.DoesNotContain(Password, settings);
        Assert.DoesNotContain(script.Calls, call => call.Contains("/api/data/devices", StringComparison.Ordinal));
    }

    [Fact]
    public async Task CredentialRejectionKeepsTheUserSignedInAndDoesNotCapture()
    {
        using var dir = new TempDir();
        var capturer = new FakeCapturer();
        var poll = new ManualHeartbeatTicker();
        var devices = StoredDevice();
        var script = new WorkspaceScript { Mode = "credential" };
        var workspace = new TrilezEmployeeWorkspace(
            new JsonAgentSettingsStore(dir.Settings),
            (url, session) => new TrilezApiClient(new HttpClient(script) { Timeout = TimeSpan.FromSeconds(5) }, TrilezApiClient.NormalizeBase(url), session),
            devices,
            new IdleHeartbeatTicker(),
            screenCapturer: capturer,
            screenPollTicker: poll,
            screenFrameTicker: new ManualHeartbeatTicker());

        Assert.True((await workspace.SignInAsync("http://127.0.0.1:4000", Email, Password)).Succeeded);
        await poll.PulseAsync();

        Assert.True(workspace.IsSignedIn);
        Assert.Equal("active", workspace.Enrollment.Phase);
        Assert.Equal(0, capturer.Starts);
        Assert.Equal(0, capturer.Captures);
        Assert.False(capturer.IsCapturing);
        Assert.DoesNotContain(script.Calls, call => call.Contains("/api/auth/refresh", StringComparison.Ordinal));
    }

    [Fact]
    public async Task HighQualityDropsStaleFramesAndFallsBackToTheConfiguredCeiling()
    {
        var capturer = new FakeCapturer { MonitorCount = 2 };
        var poll = new ManualHeartbeatTicker();
        var frame = new ManualHeartbeatTicker();
        var script = new Script { State = "requested", QualityMode = "high", MaxFps = 30, MaxEdge = 1920, JpegQuality = 75 };
        var coordinator = Coordinator(capturer, poll, frame, script, qualityStepCooldown: TimeSpan.Zero);
        script.HoldFrames = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);

        coordinator.Start();
        await poll.PulseAsync();
        Assert.Equal("requested", coordinator.Snapshot.Phase);
        Assert.Equal("high", coordinator.Snapshot.RequestedMode);
        Assert.Equal(30, coordinator.Snapshot.TargetFps);
        Assert.Equal(0, capturer.Captures);

        Assert.True((await coordinator.AcceptAsync()).Succeeded);
        await frame.PulseAsync();
        await frame.PulseAsync();
        await frame.PulseAsync();

        Assert.Equal(1920, capturer.LastProfile.MaxEdge);
        Assert.Equal(75, capturer.LastProfile.JpegQuality);
        Assert.True(capturer.LastProfile.AllMonitors);
        Assert.Equal(3, capturer.Captures);
        Assert.Equal(1, script.MaxInFlight);
        Assert.Equal("high", coordinator.Snapshot.EffectiveMode);
        Assert.True(coordinator.Snapshot.EffectiveFps <= 30);

        script.HoldFrames.TrySetResult(true);
        await coordinator.TransmitIdle;
        Assert.Equal(2, script.Frames.Count);
        Assert.Equal(1, script.Frames[0][3]);
        Assert.Equal(3, script.Frames[1][3]);
        Assert.True(coordinator.Snapshot.DroppedFrames >= 1);
        Assert.Contains("کیفیت", PresentationText.ScreenShareDetail(coordinator.Snapshot));
        Assert.DoesNotContain("ss-1", PresentationText.ScreenShareDetail(coordinator.Snapshot));

        script.QualityMode = "assistance";
        script.MaxFps = 2;
        script.MaxEdge = 1280;
        script.JpegQuality = 60;
        await poll.PulseAsync();
        Assert.Equal(1280, capturer.LastProfile.MaxEdge);
        Assert.False(capturer.LastProfile.AllMonitors);
        Assert.Equal("assistance", coordinator.Snapshot.EffectiveMode);
        Assert.True(coordinator.Snapshot.EffectiveFps <= 5);

        var captures = capturer.Captures;
        script.Offline = true;
        await frame.PulseAsync();
        await frame.PulseAsync();
        Assert.Equal(captures, capturer.Captures);
        Assert.False(capturer.IsCapturing);
        Assert.Equal("offline", coordinator.Snapshot.Phase);

        script.Offline = false;
        await frame.PulseAsync();
        Assert.True(capturer.Captures > captures);
        var stopped = await coordinator.StopSharingAsync("employee_stop");
        Assert.True(stopped.Succeeded);
        Assert.False(capturer.IsCapturing);
        Assert.Equal("employee_stop", script.EndReason);
        Assert.Equal("ended", coordinator.Snapshot.Phase);
    }

    private static ScreenShareCoordinator Coordinator(
        FakeCapturer capturer,
        ManualHeartbeatTicker poll,
        ManualHeartbeatTicker frame,
        Script script,
        Action<TrilezApiException>? onAuthorization = null,
        TimeSpan? qualityStepCooldown = null) =>
        new(capturer, poll, frame, () => new ScreenChannel
        {
            Client = script.Client,
            DeviceId = "device-1",
            Credential = Secret,
            Active = true,
        }, onAuthorization, qualityStepCooldown: qualityStepCooldown);

    private static MemoryDeviceCredentialStore StoredDevice()
    {
        var devices = new MemoryDeviceCredentialStore();
        devices.Save(new StoredDeviceCredential
        {
            InstallationId = "33333333-3333-3333-3333-333333333333",
            EnrollmentId = DeviceId,
            Secret = Secret,
            DeviceName = "laptop",
            Status = "active",
        });
        return devices;
    }

    private sealed class FakeCapturer : IScreenCapturer
    {
        public int Starts { get; private set; }
        public int Stops { get; private set; }
        public int Captures { get; private set; }
        public int Generation { get; private set; }
        public int ProfileApplies { get; private set; }
        public int MonitorCount { get; set; } = 1;
        public ScreenCaptureProfile LastProfile { get; private set; }
        public bool IsCapturing { get; private set; }
        public void Start()
        {
            Starts++;
            IsCapturing = true;
        }
        public void Stop()
        {
            Stops++;
            IsCapturing = false;
        }
        public void ApplyProfile(ScreenCaptureProfile profile)
        {
            ProfileApplies++;
            LastProfile = profile;
        }
        public byte[]? CaptureJpeg()
        {
            Captures++;
            if (!IsCapturing) return null;
            Generation++;
            return [0xFF, 0xD8, 0xFF, (byte)Generation, .. Marker];
        }
        public void Dispose() => Stop();
    }

    private sealed class Script : HttpMessageHandler
    {
        private readonly SessionState _session = new() { AccessToken = "access-token" };
        public Script() => Client = new TrilezApiClient(new HttpClient(this) { Timeout = TimeSpan.FromSeconds(5) }, new Uri("https://trileez.example"), _session);
        public TrilezApiClient Client { get; }
        public string State { get; set; } = "requested";
        public string QualityMode { get; set; } = "assistance";
        public int MaxFps { get; set; } = 2;
        public int MaxEdge { get; set; } = 1280;
        public int JpegQuality { get; set; } = 60;
        public string Mode { get; set; } = "ok";
        public TaskCompletionSource<bool>? HoldFrames { get; set; }
        public int MaxInFlight { get; private set; }
        private int _inFlight;
        public bool Offline { get; set; }
        public string? EndReason { get; private set; }
        public string? FrameContentType { get; private set; }
        public string? ControlState { get; set; }
        public string? ControlGrantId { get; set; }
        public string PermittedJson { get; set; } = "[]";
        public string? ControlExpiresAt { get; set; }
        public string? LastControlBody { get; private set; }
        public string? LastControlAction { get; private set; }
        public List<byte[]> Frames { get; } = [];
        public List<string> Credentials { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var path = request.RequestUri!.AbsolutePath;
            if (request.Headers.TryGetValues("X-Device-Credential", out var values)) Credentials.Add(values.Single());
            if (Mode == "credential") return Json(HttpStatusCode.Unauthorized, """{"error":"rejected","code":"DEVICE_CREDENTIAL_REJECTED"}""");
            if (Offline || Mode == "offline") throw new HttpRequestException("temporary outage");
            if (path.EndsWith("/screen-session", StringComparison.Ordinal)) return Session();
            if (path.EndsWith("/accept", StringComparison.Ordinal))
            {
                State = "active";
                return Session();
            }
            if (path.EndsWith("/end", StringComparison.Ordinal))
            {
                var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
                var match = System.Text.RegularExpressions.Regex.Match(body, "\"reason\":\"([^\"]+)\"");
                EndReason = match.Success ? match.Groups[1].Value : null;
                State = "ended";
                return Session();
            }
            if (path.EndsWith("/control", StringComparison.Ordinal))
            {
                LastControlBody = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
                var action = System.Text.RegularExpressions.Regex.Match(LastControlBody, "\"action\":\"([^\"]+)\"");
                LastControlAction = action.Success ? action.Groups[1].Value : null;
                if (LastControlAction == "grant")
                {
                    ControlState = "granted";
                    PermittedJson = "[\"screen-share\",\"remote-control\"]";
                    ControlExpiresAt = "2099-01-01T00:00:00.000Z";
                }
                else if (LastControlAction is "revoke" or "deny")
                {
                    ControlState = LastControlAction == "deny" ? "denied" : "revoked";
                    PermittedJson = "[\"screen-share\"]";
                    ControlExpiresAt = null;
                }
                return Session();
            }
            if (path.EndsWith("/frames", StringComparison.Ordinal))
            {
                var inFlight = Interlocked.Increment(ref _inFlight);
                if (inFlight > MaxInFlight) MaxInFlight = inFlight;
                try
                {
                    if (HoldFrames is not null) await HoldFrames.Task;
                    FrameContentType = request.Content?.Headers.ContentType?.MediaType;
                    Frames.Add(request.Content is null ? [] : await request.Content.ReadAsByteArrayAsync(cancellationToken));
                    return Json(HttpStatusCode.OK, """{"data":{"accepted":true,"frameCount":1,"retainedFrames":1}}""");
                }
                finally
                {
                    Interlocked.Decrement(ref _inFlight);
                }
            }
            return Json(HttpStatusCode.NotFound, """{"error":"missing","code":"ROUTE_NOT_FOUND"}""");
        }

        private HttpResponseMessage Session()
        {
            var control = "";
            if (!string.IsNullOrWhiteSpace(ControlState))
            {
                var grant = string.IsNullOrWhiteSpace(ControlGrantId) ? "null" : "\"" + ControlGrantId + "\"";
                var expires = string.IsNullOrWhiteSpace(ControlExpiresAt) ? "null" : "\"" + ControlExpiresAt + "\"";
                control = ",\"controlState\":\"" + ControlState + "\",\"controlGrantId\":" + grant + ",\"inputPlane\":\"unavailable\",\"permittedCapabilities\":" + PermittedJson + ",\"controlExpiresAt\":" + expires;
            }
            return Json(HttpStatusCode.OK, "{\"data\":{\"id\":\"ss-1\",\"deviceId\":\"device-1\",\"state\":\"" + State + "\",\"supportName\":\"پشتیبان آزمون\",\"qualityMode\":\"" + QualityMode + "\",\"maxFps\":" + MaxFps.ToString() + ",\"maxEdge\":" + MaxEdge.ToString() + ",\"jpegQuality\":" + JpegQuality.ToString() + ",\"requestedAt\":\"2026-10-16T08:00:00.000Z\",\"startedAt\":" + (State == "active" ? "\"2026-10-16T08:00:01.000Z\"" : "null") + control + "}}");
        }

        private static HttpResponseMessage Json(HttpStatusCode status, string body) =>
            new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
    }

    private sealed class WorkspaceScript : HttpMessageHandler
    {
        public string Mode { get; set; } = "ok";
        public string? EndReason { get; private set; }
        public List<string> Calls { get; } = [];
        private string _state = "requested";

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var path = request.RequestUri!.AbsolutePath;
            var method = request.Method.Method;
            Calls.Add(method + " " + path);
            if (path == "/api/health/live") return Json(HttpStatusCode.OK, """{"ok":true}""");
            if (path == "/api/auth/login")
                return Json(HttpStatusCode.OK, "{\"token\":\"access-token\",\"user\":{\"id\":\"user-screen\",\"name\":\"Actor screen\",\"email\":\"" + Email + "\",\"role\":\"member\",\"isActive\":true,\"mustChangePassword\":false}}");
            if (path == "/api/auth/me")
                return Json(HttpStatusCode.OK, "{\"user\":{\"id\":\"user-screen\",\"name\":\"Actor screen\",\"email\":\"" + Email + "\",\"role\":\"member\",\"isActive\":true,\"mustChangePassword\":false},\"employee\":{\"state\":\"active\",\"employeeId\":\"employee-screen\",\"employmentStatus\":\"active\"}}");
            if (path == "/api/auth/logout") return new HttpResponseMessage(HttpStatusCode.NoContent);
            if (path == "/api/auth/refresh") return Json(HttpStatusCode.Unauthorized, """{"error":"Session is revoked or expired","code":"SESSION_REVOKED"}""");
            if (method == "GET" && path == "/api/me/agent-devices/" + DeviceId)
                return Json(HttpStatusCode.OK, "{\"data\":{\"id\":\"" + DeviceId + "\",\"installationId\":\"33333333-3333-3333-3333-333333333333\",\"deviceName\":\"laptop\",\"status\":\"active\",\"connectionStatus\":\"online\",\"agentVersion\":\"0.2.0\"}}");
            if (path.EndsWith("/screen-session", StringComparison.Ordinal))
            {
                if (Mode == "credential") return Json(HttpStatusCode.Unauthorized, """{"error":"rejected","code":"DEVICE_CREDENTIAL_REJECTED"}""");
                return Session();
            }
            if (path.EndsWith("/accept", StringComparison.Ordinal))
            {
                _state = "active";
                return Session();
            }
            if (path.EndsWith("/frames", StringComparison.Ordinal))
                return Json(HttpStatusCode.OK, """{"data":{"accepted":true,"frameCount":1}}""");
            if (path.EndsWith("/end", StringComparison.Ordinal))
            {
                var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
                var match = System.Text.RegularExpressions.Regex.Match(body, "\"reason\":\"([^\"]+)\"");
                EndReason = match.Success ? match.Groups[1].Value : null;
                _state = "ended";
                return Session();
            }
            if (path.EndsWith("/disconnect", StringComparison.Ordinal))
                return Json(HttpStatusCode.OK, "{\"data\":{\"id\":\"" + DeviceId + "\",\"status\":\"active\",\"connectionStatus\":\"offline\"}}");
            return Json(HttpStatusCode.OK, """{"data":[],"page":{"limit":200,"hasMore":false}}""");
        }

        private HttpResponseMessage Session() => Json(HttpStatusCode.OK, "{\"data\":{\"id\":\"ss-1\",\"deviceId\":\"" + DeviceId + "\",\"state\":\"" + _state + "\",\"supportName\":\"پشتیبان آزمون\",\"requestedAt\":\"2026-10-16T08:00:00.000Z\",\"startedAt\":" + (_state == "requested" ? "null" : "\"2026-10-16T08:01:00.000Z\"") + ",\"endedAt\":" + (_state == "ended" ? "\"2026-10-16T08:02:00.000Z\"" : "null") + ",\"endReason\":" + (EndReason is null ? "null" : "\"" + EndReason + "\"") + "}}");

        private static HttpResponseMessage Json(HttpStatusCode status, string body) =>
            new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
    }

    private sealed class TempDir : IDisposable
    {
        public TempDir()
        {
            Root = Directory.CreateTempSubdirectory("trilez-screen-").FullName;
            Settings = Path.Combine(Root, "agent-settings.json");
        }

        public string Root { get; }
        public string Settings { get; }
        public void Dispose() => Directory.Delete(Root, recursive: true);
    }
}
