using System.Net;
using System.Text;
using Trilez.Agent;
using Xunit;

namespace Trilez.Agent.Core.Tests;

public sealed class DeviceEnrollmentClientTests
{
    private const string Secret = "device-secret-value-should-not-leak";

    [Fact]
    public async Task RegistrationOmitsEmployeeIdentityAndSendsTheCurrentCredentialOnlyWhenSupplied()
    {
        var session = new SessionState { AccessToken = "access-token" };
        string? body = null;
        string? credential = null;
        string? path = null;
        var api = Client(session, request =>
        {
            path = request.RequestUri!.PathAndQuery;
            body = request.Content is null ? null : request.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            credential = Header(request, "X-Device-Credential");
            return Json(HttpStatusCode.Created, """{"data":{"id":"device-1","installationId":"inst-1","deviceName":"لپ‌تاپ","agentVersion":"0.2.0","status":"active","connectionStatus":"offline"},"created":true,"credential":"device-secret-value-should-not-leak"}""");
        });

        var created = await api.RegisterAgentDeviceAsync(new AgentDeviceRegistration
        {
            InstallationId = "inst-1",
            DeviceName = "لپ‌تاپ",
            AgentVersion = "0.2.0",
            Capabilities = AgentDeviceCapabilities.Supported,
        });

        Assert.Equal("device-1", created.Data!.Id);
        Assert.Equal(Secret, created.Credential);
        Assert.Null(credential);
        Assert.Contains("\"installationId\":\"inst-1\"", body);
        Assert.DoesNotContain("employeeId", body);
        Assert.Contains("screen-share", body);
        Assert.DoesNotContain("monitoring", body);
        Assert.DoesNotContain("remote-control", body);
        Assert.Equal("/api/me/agent-devices", path);
        Assert.DoesNotContain("/api/data/devices", path);
    }

    [Fact]
    public async Task HeartbeatUsesTheDeviceCredentialAndDoesNotRefreshWhenThatCredentialIsRejected()
    {
        var session = new SessionState { AccessToken = "access-token" };
        var calls = new List<string>();
        string? credential = null;
        var api = Client(session, request =>
        {
            calls.Add(request.Method + " " + request.RequestUri!.PathAndQuery);
            credential = Header(request, "X-Device-Credential");
            return Json(HttpStatusCode.Unauthorized, "{\"error\":\"" + Secret + "\",\"code\":\"DEVICE_CREDENTIAL_REJECTED\"}");
        });

        var error = await Assert.ThrowsAsync<TrilezApiException>(() => api.HeartbeatAgentDeviceAsync("device-1", Secret, "0.2.0", AgentDeviceCapabilities.Supported));

        Assert.Equal(401, error.Status);
        Assert.Equal("DEVICE_CREDENTIAL_REJECTED", error.Code);
        Assert.Equal("اعتبار دستگاه پذیرفته نشد. دوباره دستگاه را ثبت کنید.", error.Message);
        Assert.DoesNotContain(Secret, error.Message);
        Assert.Null(error.ServerError);
        Assert.Equal("access-token", session.AccessToken);
        Assert.Equal(Secret, credential);
        Assert.Equal(["POST /api/me/agent-devices/device-1/heartbeat"], calls);
        Assert.DoesNotContain(calls, call => call.Contains("/api/data/devices", StringComparison.Ordinal));
    }

    [Fact]
    public async Task RevokedEnrollmentIsPersianAndDropsASecretEcho()
    {
        var session = new SessionState { AccessToken = "access-token" };
        var api = Client(session, _ => Json(HttpStatusCode.Forbidden, "{\"error\":\"" + Secret + "\",\"code\":\"DEVICE_REVOKED\"}"));

        var error = await Assert.ThrowsAsync<TrilezApiException>(() => api.UnregisterAgentDeviceAsync("device-1", Secret));

        Assert.Equal("DEVICE_REVOKED", error.Code);
        Assert.Equal("ثبت این دستگاه لغو شده است.", error.Message);
        Assert.DoesNotContain(Secret, error.Message);
        Assert.Null(error.ServerError);
        Assert.Equal("access-token", session.AccessToken);
    }

    private static string? Header(HttpRequestMessage request, string name) =>
        request.Headers.TryGetValues(name, out var values) ? values.Single() : null;

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
