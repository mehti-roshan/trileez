using System.Net;
using System.Net.Http.Headers;
using System.Text;
using Trilez.Agent;
using Xunit;

namespace Trilez.Agent.Core.Tests;

public sealed class ScreenShareClientTests
{
    private const string Secret = "device-secret-value-should-not-leak";

    [Fact]
    public async Task FrameUploadSendsJpegBytesAndDoesNotRefreshWhenTheCredentialIsRejected()
    {
        var session = new SessionState { AccessToken = "access-token" };
        var calls = new List<string>();
        byte[]? body = null;
        string? contentType = null;
        string? credential = null;
        var api = Client(session, request =>
        {
            calls.Add(request.Method + " " + request.RequestUri!.PathAndQuery);
            credential = request.Headers.TryGetValues("X-Device-Credential", out var values) ? values.Single() : null;
            contentType = request.Content?.Headers.ContentType?.MediaType;
            body = request.Content?.ReadAsByteArrayAsync().GetAwaiter().GetResult();
            return Json(HttpStatusCode.Unauthorized, "{\"error\":\"rejected\",\"code\":\"DEVICE_CREDENTIAL_REJECTED\"}");
        });
        var frame = new byte[] { 0xFF, 0xD8, 0xFF, 0xD9 };

        var error = await Assert.ThrowsAsync<TrilezApiException>(() => api.UploadScreenFrameAsync("device-1", "ss-1", Secret, frame));

        Assert.Equal("DEVICE_CREDENTIAL_REJECTED", error.Code);
        Assert.Equal("access-token", session.AccessToken);
        Assert.Equal(["POST /api/me/agent-devices/device-1/screen-sessions/ss-1/frames"], calls);
        Assert.Equal("image/jpeg", contentType);
        Assert.Equal(frame, body);
        Assert.Equal(Secret, credential);
        Assert.DoesNotContain(calls, call => call.Contains("/api/auth/refresh", StringComparison.Ordinal));
        Assert.DoesNotContain(calls, call => call.Contains("/api/data/devices", StringComparison.Ordinal));
    }

    [Fact]
    public async Task AnInvalidFrameIsNotUploaded()
    {
        var session = new SessionState { AccessToken = "access-token" };
        var calls = 0;
        var api = Client(session, _ =>
        {
            calls++;
            return Json(HttpStatusCode.OK, """{"data":{"accepted":true,"frameCount":1}}""");
        });

        await Assert.ThrowsAsync<ArgumentException>(() => api.UploadScreenFrameAsync("device-1", "ss-1", Secret, [1, 2, 3, 4]));

        Assert.Equal(0, calls);
        Assert.Equal("access-token", session.AccessToken);
    }

    [Fact]
    public async Task AMissingSessionIsNullAndAcceptReadsTheRecord()
    {
        var session = new SessionState { AccessToken = "access-token" };
        var api = Client(session, request =>
        {
            var path = request.RequestUri!.AbsolutePath;
            if (path.EndsWith("/screen-session", StringComparison.Ordinal)) return Json(HttpStatusCode.OK, """{"data":null}""");
            return Json(HttpStatusCode.OK, """{"data":{"id":"ss-1","state":"active","supportName":"پشتیبان"}}""");
        });

        var current = await api.GetScreenSessionAsync("device-1", Secret);
        var accepted = await api.AcceptScreenSessionAsync("device-1", "ss-1", Secret);

        Assert.Null(current);
        Assert.Equal("ss-1", accepted.Id);
        Assert.Equal("active", accepted.State);
        Assert.Equal("پشتیبان", accepted.SupportName);
    }

    [Fact]
    public async Task ControlDecisionSendsOnlyTheGrantAndDoesNotRefresh()
    {
        const string grantId = "cg-11111111-1111-4111-8111-111111111111";
        var session = new SessionState { AccessToken = "access-token" };
        var calls = new List<string>();
        string? body = null;
        var api = Client(session, request =>
        {
            calls.Add(request.Method + " " + request.RequestUri!.PathAndQuery);
            body = request.Content?.ReadAsStringAsync().GetAwaiter().GetResult();
            return Json(HttpStatusCode.OK, "{\"data\":{\"id\":\"ss-1\",\"state\":\"active\",\"controlState\":\"granted\",\"controlGrantId\":\"" + grantId + "\",\"inputPlane\":\"unavailable\",\"permittedCapabilities\":[\"screen-share\",\"remote-control\"]}}");
        });

        var decided = await api.DecideScreenControlAsync("device-1", "ss-1", Secret, "grant", grantId);

        var sent = body ?? "";
        Assert.Equal("granted", decided.ControlState);
        Assert.Equal("unavailable", decided.InputPlane);
        Assert.Equal(["POST /api/me/agent-devices/device-1/screen-sessions/ss-1/control"], calls);
        Assert.Contains("\"action\":\"grant\"", sent);
        Assert.Contains("\"grantId\":\"" + grantId + "\"", sent);
        Assert.DoesNotContain("command", sent);
        Assert.DoesNotContain("shell", sent);
        Assert.DoesNotContain("powershell", sent);
        Assert.DoesNotContain(calls, call => call.Contains("/api/auth/refresh", StringComparison.Ordinal));
        Assert.DoesNotContain(calls, call => call.Contains("/api/data/devices", StringComparison.Ordinal));

        var rejectedCalls = new List<string>();
        var rejected = Client(session, request =>
        {
            rejectedCalls.Add(request.Method + " " + request.RequestUri!.PathAndQuery);
            return Json(HttpStatusCode.Unauthorized, "{\"error\":\"rejected\",\"code\":\"DEVICE_CREDENTIAL_REJECTED\"}");
        });
        var error = await Assert.ThrowsAsync<TrilezApiException>(() => rejected.DecideScreenControlAsync("device-1", "ss-1", Secret, "deny", grantId));
        Assert.Equal("DEVICE_CREDENTIAL_REJECTED", error.Code);
        Assert.Equal("access-token", session.AccessToken);
        Assert.Equal(["POST /api/me/agent-devices/device-1/screen-sessions/ss-1/control"], rejectedCalls);
        Assert.DoesNotContain(rejectedCalls, call => call.Contains("/api/auth/refresh", StringComparison.Ordinal));

        var blocked = 0;
        var quiet = Client(session, _ =>
        {
            blocked++;
            return Json(HttpStatusCode.OK, """{"data":{"id":"ss-1"}}""");
        });
        await Assert.ThrowsAsync<ArgumentException>(() => quiet.DecideScreenControlAsync("device-1", "ss-1", Secret, "shell", grantId));
        await Assert.ThrowsAsync<ArgumentException>(() => quiet.DecideScreenControlAsync("device-1", "ss-1", Secret, "grant", " "));
        Assert.Equal(0, blocked);
        Assert.Equal("access-token", session.AccessToken);
    }

    private static TrilezApiClient Client(SessionState session, Func<HttpRequestMessage, HttpResponseMessage> handler)
    {
        var http = new HttpClient(new StubHandler(handler)) { Timeout = TimeSpan.FromSeconds(5) };
        return new TrilezApiClient(http, new Uri("https://trileez.example"), session);
    }

    private static HttpResponseMessage Json(HttpStatusCode status, string body) =>
        new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> handler) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(handler(request));
    }
}
