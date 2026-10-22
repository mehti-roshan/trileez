using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Text;
using Trilez.Agent;
using Xunit;
using Xunit.Abstractions;

namespace Trilez.Agent.Core.Tests;

public sealed class TelemetrySyncTests
{
    private readonly ITestOutputHelper _output;

    public TelemetrySyncTests(ITestOutputHelper output) => _output = output;

    [Fact]
    public void RetryDelayDoublesUntilTheCapAndClampsJitter()
    {
        Assert.Equal(TimeSpan.FromSeconds(5), TelemetrySync.Delay(1, _ => 0));
        Assert.Equal(TimeSpan.FromSeconds(10), TelemetrySync.Delay(2, _ => 0));
        Assert.Equal(TimeSpan.FromSeconds(20), TelemetrySync.Delay(3, _ => 0));
        Assert.Equal(TimeSpan.FromSeconds(160), TelemetrySync.Delay(6, _ => 0));
        Assert.Equal(TimeSpan.FromSeconds(300), TelemetrySync.Delay(7, _ => 0));
        Assert.Equal(TimeSpan.FromSeconds(300), TelemetrySync.Delay(20, _ => 0));
        Assert.Equal(TimeSpan.FromSeconds(5), TelemetrySync.Delay(0, _ => 0));
        Assert.Equal(TimeSpan.FromMilliseconds(6_250), TelemetrySync.Delay(1, room => room));
        Assert.Equal(TimeSpan.FromSeconds(5), TelemetrySync.Delay(1, _ => -50));
        Assert.Equal(TimeSpan.FromSeconds(330), TelemetrySync.Delay(7, room => room + 10_000));
        Assert.Equal(TimeSpan.FromSeconds(5), TelemetrySync.Delay(1));
    }

    [Fact]
    public void NetworkFailuresStayTransientAndRevocationIsTerminal()
    {
        Assert.Equal(SyncFailure.Transient, TelemetrySync.Classify(0, "OFFLINE"));
        Assert.Equal(SyncFailure.Transient, TelemetrySync.Classify(408, null));
        Assert.Equal(SyncFailure.Transient, TelemetrySync.Classify(429, null));
        Assert.Equal(SyncFailure.Transient, TelemetrySync.Classify(500, "INTERNAL_ERROR"));
        Assert.Equal(SyncFailure.Transient, TelemetrySync.Classify(503, null));
        Assert.Equal(SyncFailure.Terminal, TelemetrySync.Classify(403, "DEVICE_REVOKED"));
        Assert.Equal(SyncFailure.Terminal, TelemetrySync.Classify(401, "DEVICE_CREDENTIAL_REJECTED"));
        Assert.Equal(SyncFailure.Terminal, TelemetrySync.Classify(401, "SESSION_REVOKED"));
        Assert.Equal(SyncFailure.Terminal, TelemetrySync.Classify(401, null));
        Assert.Equal(SyncFailure.Terminal, TelemetrySync.Classify(403, "DEVICE_DISABLED"));
        Assert.Equal(SyncFailure.Terminal, TelemetrySync.Classify(403, "HEALTH_CAPABILITY"));
        Assert.Equal(SyncFailure.Poison, TelemetrySync.Classify(400, "VALIDATION_ERROR"));
        Assert.Equal(SyncFailure.Poison, TelemetrySync.Classify(404, null));
        Assert.Equal(SyncFailure.Poison, TelemetrySync.Classify(413, "PAYLOAD_TOO_LARGE"));
        Assert.Equal(SyncFailure.Poison, TelemetrySync.Classify(403, null));
    }

    [Fact]
    public void TheSameEventIdKeepsTheFirstPayload()
    {
        var now = DateTimeOffset.Parse("2026-10-16T08:00:00Z");
        var records = new List<TelemetryRecord>();
        var first = Payload("sample-a", 1);
        var second = Payload("sample-a", 9);

        Assert.Equal(QueueAdd.Added, TelemetrySync.Enqueue(records, Record("sample-a", first, now), now));
        Assert.Equal(QueueAdd.Duplicate, TelemetrySync.Enqueue(records, Record("sample-a", second, now), now));

        var kept = Assert.Single(records);
        Assert.Equal(first, kept.Payload);
    }

    [Fact]
    public void TheQueueDropsTheOldestRecordsAtTheSizeBound()
    {
        var now = DateTimeOffset.Parse("2026-10-16T08:00:00Z");
        var records = new List<TelemetryRecord>();
        for (var i = 0; i < TelemetrySync.MaxRecords + 25; i++)
            TelemetrySync.Enqueue(records, Record($"sample-{i:D4}", Payload($"sample-{i:D4}", 1), now), now);

        Assert.Equal(TelemetrySync.MaxRecords, records.Count);
        Assert.True(TelemetrySync.PayloadBytes(records) <= TelemetrySync.MaxBytes);
        Assert.DoesNotContain(records, record => record.Id == "sample-0000");
        Assert.Equal($"sample-{TelemetrySync.MaxRecords + 24:D4}", records[^1].Id);
    }

    [Fact]
    public void ExpiredRecordsAreRemovedAndFreshOnesStay()
    {
        var now = DateTimeOffset.Parse("2026-10-16T08:00:00Z");
        var records = new List<TelemetryRecord>
        {
            Record("aged", Payload("aged", 1), now - TelemetrySync.MaxAge),
            Record("older", Payload("older", 1), now - TelemetrySync.MaxAge - TimeSpan.FromTicks(1)),
            Record("secret-row", """{"password":"drop-me"}""", now),
            Record("broken", "not-json", now),
        };

        TelemetrySync.Trim(records, now);

        var kept = Assert.Single(records);
        Assert.Equal("aged", kept.Id);
        Assert.Equal(QueueAdd.Rejected, TelemetrySync.Enqueue(records, Record("huge", Oversized(), now), now));
        Assert.Equal(QueueAdd.Rejected, TelemetrySync.Enqueue(records, Record("", Payload("empty", 1), now), now));
        Assert.Equal(QueueAdd.Rejected, TelemetrySync.Enqueue(records, Record("array", "[1,2]", now), now));
        Assert.Equal("aged", Assert.Single(records).Id);
    }

    [Fact]
    public void BatchesStayInsideTheRecordAndByteCaps()
    {
        var now = DateTimeOffset.Parse("2026-10-16T08:00:00Z");
        var records = new List<TelemetryRecord> { Record("bad", "[1]", now) };
        for (var i = 0; i < TelemetrySync.MaxBatchRecords + 5; i++)
            records.Add(Record($"sample-{i:D2}", Payload($"sample-{i:D2}", 1), now));

        var batch = TelemetrySync.TakeBatch(records);

        Assert.Equal(TelemetrySync.MaxBatchRecords, batch.Count);
        Assert.Equal("sample-00", batch[0].Id);
        Assert.DoesNotContain(batch, record => record.Id == "bad");
        Assert.DoesNotContain(batch, record => record.Id == $"sample-{TelemetrySync.MaxBatchRecords:D2}");

        var fat = "{\"pad\":\"" + new string('c', 40_000) + "\"}";
        var wide = new List<TelemetryRecord>
        {
            Record("fat-a", fat, now),
            Record("fat-b", fat, now),
        };
        Assert.Equal("fat-a", Assert.Single(TelemetrySync.TakeBatch(wide)).Id);
    }

    [Fact]
    public void ANormalHealthSampleIsNotTreatedAsASecret()
    {
        var payload = """
            {"clientSampleId":"h0123456789abcdef0123456789abcdef","sampledAt":"2026-10-16T08:00:00+00:00","cpuPercent":12.5,"memoryUsedBytes":100,"memoryTotalBytes":1000,"diskFreeBytes":50,"diskTotalBytes":80,"osName":"Windows 11","osVersion":"10.0.22631","architecture":"X64","agentVersion":"0.2.0","online":true,"lastHeartbeatAt":"2026-10-16T07:59:00+00:00","collectorPhase":"stopped","syncPhase":"pending","queueDepth":1,"pendingBytes":400}
            """;

        Assert.False(TelemetrySync.ContainsSecret(payload));
        foreach (var word in new[] { "password", "token", "Bearer ", "eyJ", "credential", "secret", "screenshot", "clipboard", "keystroke" })
        {
            var records = new List<TelemetryRecord>();
            var rejected = "{\"note\":\"" + word + "\"}";
            Assert.Equal(QueueAdd.Rejected, TelemetrySync.Enqueue(records, Record("sample-word", rejected, DateTimeOffset.Parse("2026-10-16T08:00:00Z")), DateTimeOffset.Parse("2026-10-16T08:00:00Z")));
            Assert.Empty(records);
        }
    }

    [Fact]
    public void BoundedEnqueueStaysWithinTheQueueAndRecordsItsCost()
    {
        var records = new List<TelemetryRecord>();
        var now = DateTimeOffset.Parse("2026-10-16T08:00:00Z");
        var pad = new string('a', 2_800);
        var before = GC.GetTotalAllocatedBytes(true);
        var watch = Stopwatch.StartNew();
        for (var i = 0; i < 500; i++)
        {
            var payload = "{\"online\":true,\"cpuPercent\":1.25,\"sample\":" + i.ToString(CultureInfo.InvariantCulture) + ",\"pad\":\"" + pad + "\"}";
            TelemetrySync.Enqueue(records, Record($"sample-{i:D4}", payload, now), now);
        }
        watch.Stop();
        var allocated = GC.GetTotalAllocatedBytes(true) - before;
        var queueBytes = TelemetrySync.PayloadBytes(records);
        var line = string.Create(CultureInfo.InvariantCulture, $"HEALTH_QUEUE_MEASURE elapsedMs={watch.Elapsed.TotalMilliseconds:F1} allocatedBytes={allocated} queueRecords={records.Count} queueBytes={queueBytes} workingSetBytes={Environment.WorkingSet}");
        _output.WriteLine(line);

        Assert.True(watch.Elapsed < TimeSpan.FromSeconds(30));
        Assert.InRange(records.Count, 1, TelemetrySync.MaxRecords);
        Assert.InRange(queueBytes, 1, TelemetrySync.MaxBytes);
        Assert.DoesNotContain(records, record => record.Id == "sample-0000");
        Assert.Contains(records, record => record.Id == "sample-0499");
        Assert.All(records, record => Assert.False(TelemetrySync.ContainsSecret(record.Payload)));
    }

    private static TelemetryRecord Record(string id, string payload, DateTimeOffset createdAt) => new()
    {
        Id = id,
        Payload = payload,
        CreatedAt = createdAt,
    };

    private static string Payload(string id, int cpu) =>
        "{\"clientSampleId\":\"" + id + "\",\"sampledAt\":\"2026-10-16T08:00:00+00:00\",\"cpuPercent\":" + cpu.ToString(CultureInfo.InvariantCulture) + ",\"online\":true,\"agentVersion\":\"0.2.0\",\"collectorPhase\":\"stopped\",\"syncPhase\":\"pending\",\"queueDepth\":1,\"pendingBytes\":1}";

    private static string Oversized() => "{\"online\":true,\"pad\":\"" + new string('b', TelemetrySync.MaxBatchBytes) + "\"}";
}

public sealed class HealthUploadClientTests
{
    private const string Secret = "device-secret-value";
    private const string Session = "session-value-keep";

    [Fact]
    public async Task UploadSendsTheStoredPayloadVerbatimAndDropsSecrets()
    {
        var session = new SessionState { AccessToken = Session };
        string? body = null;
        string? credential = null;
        string? path = null;
        var api = Client(session, request =>
        {
            path = request.RequestUri!.PathAndQuery;
            body = request.Content!.ReadAsStringAsync().GetAwaiter().GetResult();
            credential = Header(request, "X-Device-Credential");
            return Json(HttpStatusCode.OK, """{"data":{"accepted":1,"duplicate":0,"acceptedIds":["sample-a"],"duplicateIds":[],"rejected":[],"lastSuccessfulUploadAt":"2026-10-16T08:05:00.0000000Z"}}""");
        });
        var good = """{"clientSampleId":"sample-a","sampledAt":"2026-10-16T08:00:00+00:00","online":true,"agentVersion":"0.2.0","collectorPhase":"stopped","syncPhase":"pending","queueDepth":1,"pendingBytes":1}""";

        var result = await api.UploadHealthBatchAsync("device-1", Secret, ["""{"screenshot":"omit-me"}""", good]);

        Assert.Equal("/api/me/agent-devices/device-1/health-batches", path);
        Assert.Equal(Secret, credential);
        Assert.Contains(good, body);
        Assert.DoesNotContain("screenshot", body);
        Assert.DoesNotContain("employeeId", body);
        Assert.DoesNotContain(Secret, body);
        Assert.DoesNotContain(Session, body);
        Assert.DoesNotContain("/api/data/devices", path);
        Assert.Equal(1, result.Accepted);
        Assert.Equal("sample-a", Assert.Single(result.AcceptedIds!));
        Assert.Equal(Session, session.AccessToken);
    }

    [Fact]
    public async Task AnEmptyOrSecretBatchIsNotSent()
    {
        var calls = 0;
        var api = Client(new SessionState { AccessToken = Session }, _ =>
        {
            calls++;
            return Json(HttpStatusCode.OK, """{"data":{"accepted":0}}""");
        });

        await Assert.ThrowsAsync<ArgumentException>(() => api.UploadHealthBatchAsync("device-1", Secret, ["""{"password":"x"}"""]));
        Assert.Equal(0, calls);
    }

    [Fact]
    public async Task ANetworkFailureStaysOfflineWithoutClearingTheSession()
    {
        var session = new SessionState { AccessToken = Session };
        var api = Client(session, _ => throw new HttpRequestException("temporary outage"));

        var error = await Assert.ThrowsAsync<TrilezApiException>(() => api.UploadHealthBatchAsync("device-1", Secret, [GoodPayload]));

        Assert.Equal(0, error.Status);
        Assert.Equal("OFFLINE", error.Code);
        Assert.Equal(Session, session.AccessToken);
    }

    [Fact]
    public async Task RevocationAndCredentialRejectionDoNotRefreshOrClearTheSession()
    {
        await AssertTerminalAsync(HttpStatusCode.Forbidden, "DEVICE_REVOKED", "ثبت این دستگاه لغو شده است.");
        await AssertTerminalAsync(HttpStatusCode.Unauthorized, "DEVICE_CREDENTIAL_REJECTED", "اعتبار دستگاه پذیرفته نشد. دوباره دستگاه را ثبت کنید.");
    }

    private static async Task AssertTerminalAsync(HttpStatusCode status, string code, string message)
    {
        var session = new SessionState { AccessToken = Session };
        var calls = new List<string>();
        var api = Client(session, request =>
        {
            calls.Add(request.Method + " " + request.RequestUri!.PathAndQuery);
            return Json(status, "{\"error\":\"hidden\",\"code\":\"" + code + "\"}");
        });

        var error = await Assert.ThrowsAsync<TrilezApiException>(() => api.UploadHealthBatchAsync("device-1", Secret, [GoodPayload]));

        Assert.Equal(code, error.Code);
        Assert.Equal(message, error.Message);
        Assert.DoesNotContain(Secret, error.Message);
        Assert.Equal(Session, session.AccessToken);
        Assert.Equal(["POST /api/me/agent-devices/device-1/health-batches"], calls);
    }

    private const string GoodPayload = """{"clientSampleId":"sample-a","online":true,"agentVersion":"0.2.0"}""";

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
