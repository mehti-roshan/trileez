using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using Trilez.Agent;
using Trilez.Agent.Presentation;
using Xunit;
using Xunit.Abstractions;

namespace Trilez.Agent.Presentation.Tests;

public sealed class HealthReporterTests
{
    private const string Secret = "device-secret-value";
    private const string Email = "health.agent@example.com";
    private const string Password = "StrongPassword123!";
    private const string DeviceId = "device-health-1";
    private readonly ITestOutputHelper _output;

    public HealthReporterTests(ITestOutputHelper output) => _output = output;

    [Fact]
    public void SampleIntervalIsClamped()
    {
        Assert.Equal(TimeSpan.FromSeconds(30), HealthReporter.ClampInterval(TimeSpan.FromSeconds(10)));
        Assert.Equal(TimeSpan.FromSeconds(900), HealthReporter.ClampInterval(TimeSpan.FromSeconds(1_000)));
        Assert.Equal(TimeSpan.FromSeconds(60), HealthReporter.ClampInterval(null));
        Assert.Equal(TimeSpan.FromSeconds(45), HealthReporter.ClampInterval(TimeSpan.FromSeconds(45)));
    }

    [Fact]
    public void WithoutAProbeHealthStaysUnavailable()
    {
        using var dir = new TempDir();
        var workspace = new TrilezEmployeeWorkspace(new JsonAgentSettingsStore(dir.Settings));

        Assert.Equal("stopped", workspace.Health.SyncPhase);
        Assert.Equal(PresentationText.HealthUnavailable, workspace.Health.Message);
    }

    [Fact]
    public async Task ASampleUploadsOnceUntilTheIntervalElapses()
    {
        var clock = new ManualUsageClock();
        var ticker = new ManualHeartbeatTicker();
        var store = new MemoryHealthQueueStore();
        var script = new Script();
        var probe = new Probe();
        var reporter = Reporter(probe, clock, ticker, store, script);

        reporter.Start();
        await ticker.PulseAsync();
        clock.Advance(TimeSpan.FromSeconds(29));
        await ticker.PulseAsync();

        var body = Assert.Single(script.Bodies);
        Assert.Contains("\"cpuPercent\":12.5", body, StringComparison.Ordinal);
        Assert.Contains("\"agentVersion\":\"0.2.0\"", body, StringComparison.Ordinal);
        Assert.Contains("\"architecture\":\"X64\"", body, StringComparison.Ordinal);
        Assert.Contains("\"osName\":\"Windows 11\"", body, StringComparison.Ordinal);
        Assert.Contains("\"online\":true", body, StringComparison.Ordinal);
        Assert.Contains("\"collectorPhase\":\"running\"", body, StringComparison.Ordinal);
        Assert.Contains("\"syncPhase\":\"pending\"", body, StringComparison.Ordinal);
        Assert.Contains("/api/me/agent-devices/device-1/health-batches", Assert.Single(script.Calls));
        Assert.Equal(Secret, Assert.Single(script.Credentials));
        Assert.DoesNotContain("employeeId", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("password", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("screenshot", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("windowTitle", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("clipboard", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("keystroke", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(Secret, body, StringComparison.Ordinal);
        Assert.DoesNotContain("eyJ", body, StringComparison.Ordinal);
        Assert.Empty(store.Load().Items);
        Assert.Equal("idle", reporter.Snapshot.SyncPhase);
        Assert.Equal(30, reporter.Snapshot.SampleIntervalSeconds);
        Assert.Equal(1, probe.Reads);
        Assert.NotNull(reporter.Snapshot.LastSuccessfulUploadAt);
    }

    [Fact]
    public async Task InvalidMetricsAreOmittedInsteadOfFailingTheBatch()
    {
        var probe = new Probe
        {
            Next = new HealthReading
            {
                CpuPercent = 150,
                MemoryUsedBytes = 5_000,
                MemoryTotalBytes = 100,
                DiskFreeBytes = 10,
                DiskTotalBytes = 1_000_000_000_000_001,
                OsName = "Windows/11",
                OsVersion = "10.0",
                Architecture = "X 64",
            },
        };
        var script = new Script();
        var reporter = Reporter(probe, new ManualUsageClock(), new ManualHeartbeatTicker(), new MemoryHealthQueueStore(), script);

        reporter.Start();
        await reporter.Ticker.PulseAsync();

        var body = Assert.Single(script.Bodies);
        Assert.DoesNotContain("cpuPercent", body, StringComparison.Ordinal);
        Assert.DoesNotContain("memoryUsedBytes", body, StringComparison.Ordinal);
        Assert.Contains("\"memoryTotalBytes\":100", body, StringComparison.Ordinal);
        Assert.Contains("\"diskFreeBytes\":10", body, StringComparison.Ordinal);
        Assert.DoesNotContain("diskTotalBytes", body, StringComparison.Ordinal);
        Assert.Contains("\"osName\":\"Windows11\"", body, StringComparison.Ordinal);
        Assert.DoesNotContain("Windows/", body, StringComparison.Ordinal);
        Assert.DoesNotContain("architecture", body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task AProbeFailureStillQueuesASampleWithoutMetrics()
    {
        var probe = new Probe { Throw = true };
        var script = new Script();
        var reporter = Reporter(probe, new ManualUsageClock(), new ManualHeartbeatTicker(), new MemoryHealthQueueStore(), script);

        reporter.Start();
        await reporter.Ticker.PulseAsync();

        var body = Assert.Single(script.Bodies);
        Assert.DoesNotContain("cpuPercent", body, StringComparison.Ordinal);
        Assert.Contains("\"agentVersion\":\"0.2.0\"", body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task SecretReadingsAreNotBuffered()
    {
        var probe = new Probe { Next = new HealthReading { OsName = "password-os", CpuPercent = 1 } };
        var store = new MemoryHealthQueueStore();
        var script = new Script();
        var reporter = Reporter(probe, new ManualUsageClock(), new ManualHeartbeatTicker(), store, script);

        reporter.Start();
        await reporter.Ticker.PulseAsync();

        Assert.Empty(script.Bodies);
        Assert.Empty(store.Load().Items);
        Assert.DoesNotContain(Secret, System.Text.Json.JsonSerializer.Serialize(store.Load()), StringComparison.Ordinal);
        Assert.True(reporter.Ticker.IsRunning);
    }

    [Fact]
    public async Task ANetworkOutageRetriesTheSamePayloadWithBackoff()
    {
        var clock = new ManualUsageClock();
        var store = new MemoryHealthQueueStore();
        var script = new Script { HealthMode = "server" };
        var reporter = Reporter(new Probe(), clock, new ManualHeartbeatTicker(), store, script);

        reporter.Start();
        await reporter.Ticker.PulseAsync();
        var first = store.Load();
        Assert.Equal("retrying", reporter.Snapshot.SyncPhase);
        Assert.Equal(clock.UtcNow.AddSeconds(5), first.NextAttemptAt);
        Assert.Single(first.Items);

        clock.Advance(TimeSpan.FromSeconds(4));
        await reporter.Ticker.PulseAsync();
        Assert.Single(script.Bodies);

        clock.Advance(TimeSpan.FromSeconds(1));
        await reporter.Ticker.PulseAsync();
        Assert.Equal(2, script.Bodies.Count);
        Assert.Equal(script.Bodies[0], script.Bodies[1]);
        Assert.Equal(clock.UtcNow.AddSeconds(10), store.Load().NextAttemptAt);
        Assert.Equal("retrying", reporter.Snapshot.SyncPhase);
        Assert.Equal(2, store.Load().Attempt);
    }

    [Fact]
    public async Task AnOfflineQueueSurvivesRestartAndUploadsTheSameIdOnce()
    {
        var clock = new ManualUsageClock();
        using var dir = new TempDir();
        var store = new FileHealthQueueStore(dir.Queue);
        var script = new Script { HealthMode = "offline" };
        var first = Reporter(new Probe(), clock, new ManualHeartbeatTicker(), store, script);
        first.Start();
        await first.Ticker.PulseAsync();
        var id = Assert.Single(store.Load().Items).Id;
        var raw = await File.ReadAllTextAsync(dir.Queue);
        Assert.Contains(id, raw, StringComparison.Ordinal);
        Assert.DoesNotContain(Secret, raw, StringComparison.Ordinal);
        Assert.DoesNotContain("eyJ", raw, StringComparison.Ordinal);
        Assert.DoesNotContain("password", raw, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("credential", raw, StringComparison.OrdinalIgnoreCase);

        script.HealthMode = "ok";
        clock.Advance(TimeSpan.FromSeconds(5));
        var resumed = Reporter(new Probe(), clock, new ManualHeartbeatTicker(), store, script);
        resumed.Start();
        await resumed.Ticker.PulseAsync();

        Assert.Equal(2, script.Bodies.Count);
        Assert.Equal(script.Bodies[0], script.Bodies[1]);
        Assert.Contains(id, script.Bodies[1], StringComparison.Ordinal);
        Assert.Empty(store.Load().Items);
        await resumed.Ticker.PulseAsync();
        Assert.Equal(2, script.Bodies.Count);

        clock.Advance(TimeSpan.FromSeconds(30));
        await resumed.Ticker.PulseAsync();
        Assert.Equal(3, script.Bodies.Count);
        Assert.DoesNotContain(id, script.Bodies[2], StringComparison.Ordinal);
    }

    [Fact]
    public async Task ADuplicateResponseRemovesTheSampleAndDoesNotSendItAgain()
    {
        var clock = new ManualUsageClock();
        var store = new MemoryHealthQueueStore();
        store.Save(new HealthQueueState
        {
            DeviceId = "device-1",
            LastSampledAt = clock.UtcNow,
            Items = [Record("sample-a", clock.UtcNow)],
        });
        var script = new Script { HealthMode = "duplicate" };
        var reporter = Reporter(new Probe(), clock, new ManualHeartbeatTicker(), store, script);

        reporter.Start();
        await reporter.Ticker.PulseAsync();
        clock.Advance(TimeSpan.FromSeconds(1));
        await reporter.Ticker.PulseAsync();

        Assert.Contains("sample-a", Assert.Single(script.Bodies), StringComparison.Ordinal);
        Assert.Empty(store.Load().Items);
        Assert.Equal("idle", reporter.Snapshot.SyncPhase);
    }

    [Fact]
    public async Task APartialAcceptRetriesOnlyTheUnsettledSample()
    {
        var clock = new ManualUsageClock();
        var store = new MemoryHealthQueueStore();
        store.Save(new HealthQueueState
        {
            DeviceId = "device-1",
            LastSampledAt = clock.UtcNow,
            Items =
            [
                Record("sample-a", clock.UtcNow),
                Record("sample-b", clock.UtcNow),
            ],
        });
        var script = new Script { HealthMode = "accept-first" };
        var reporter = Reporter(new Probe(), clock, new ManualHeartbeatTicker(), store, script);

        reporter.Start();
        await reporter.Ticker.PulseAsync();
        Assert.Equal("sample-b", Assert.Single(store.Load().Items).Id);

        script.HealthMode = "ok";
        await reporter.Ticker.PulseAsync();
        Assert.Equal(2, script.Bodies.Count);
        Assert.Contains("sample-b", script.Bodies[1], StringComparison.Ordinal);
        Assert.DoesNotContain("sample-a", script.Bodies[1], StringComparison.Ordinal);
        Assert.Empty(store.Load().Items);
    }

    [Fact]
    public async Task APoisonResponseDropsTheBatchInsteadOfRetryingIt()
    {
        var clock = new ManualUsageClock();
        var store = new MemoryHealthQueueStore();
        var script = new Script { HealthMode = "poison" };
        var reporter = Reporter(new Probe(), clock, new ManualHeartbeatTicker(), store, script);

        reporter.Start();
        await reporter.Ticker.PulseAsync();
        var rejected = SampleId(Assert.Single(script.Bodies));
        Assert.Empty(store.Load().Items);

        script.HealthMode = "ok";
        clock.Advance(TimeSpan.FromSeconds(30));
        await reporter.Ticker.PulseAsync();

        Assert.Equal(2, script.Bodies.Count);
        Assert.DoesNotContain(rejected, script.Bodies[1], StringComparison.Ordinal);
    }

    [Fact]
    public async Task ExpiredQueuedSamplesAreRemovedBeforeUpload()
    {
        var clock = new ManualUsageClock();
        var store = new MemoryHealthQueueStore();
        store.Save(new HealthQueueState
        {
            DeviceId = "device-1",
            Items = [Record("expired-sample", clock.UtcNow.AddDays(-8))],
        });
        var script = new Script();
        var reporter = Reporter(new Probe(), clock, new ManualHeartbeatTicker(), store, script);

        reporter.Start();
        await reporter.Ticker.PulseAsync();

        var body = Assert.Single(script.Bodies);
        Assert.DoesNotContain("expired-sample", body, StringComparison.Ordinal);
        Assert.DoesNotContain(store.Load().Items, item => item.Id == "expired-sample");
    }

    [Fact]
    public async Task TheQueueStaysInsideItsBoundsWhileUploadsFail()
    {
        var clock = new ManualUsageClock();
        var store = new MemoryHealthQueueStore();
        var script = new Script { HealthMode = "offline" };
        var reporter = Reporter(new Probe(), clock, new ManualHeartbeatTicker(), store, script);
        reporter.Start();
        var allocatedBefore = GC.GetTotalAllocatedBytes(true);
        var watch = Stopwatch.StartNew();
        await reporter.Ticker.PulseAsync();
        var first = SampleId(script.Bodies[0]);
        for (var i = 0; i < 209; i++)
        {
            clock.Advance(TimeSpan.FromSeconds(30));
            await reporter.Ticker.PulseAsync();
        }
        watch.Stop();
        var allocated = GC.GetTotalAllocatedBytes(true) - allocatedBefore;
        var state = store.Load();
        var queueBytes = TelemetrySync.PayloadBytes(state.Items);
        var line = string.Create(CultureInfo.InvariantCulture, $"HEALTH_BURST_MEASURE elapsedMs={watch.Elapsed.TotalMilliseconds:F1} allocatedBytes={allocated} queueRecords={state.Items.Count} queueBytes={queueBytes} workingSetBytes={Environment.WorkingSet} uploadAttempts={script.Bodies.Count}");
        _output.WriteLine(line);

        Assert.True(watch.Elapsed < TimeSpan.FromSeconds(30));
        Assert.Equal(TelemetrySync.MaxRecords, state.Items.Count);
        Assert.True(queueBytes <= TelemetrySync.MaxBytes);
        Assert.DoesNotContain(state.Items, item => item.Id == first);
        Assert.InRange(script.Bodies.Count, 1, 80);
        Assert.DoesNotContain(Secret, System.Text.Json.JsonSerializer.Serialize(state), StringComparison.Ordinal);
        Assert.True(reporter.Ticker.IsRunning);
    }

    [Fact]
    public async Task RevocationStopsUploadsAcrossARestart()
    {
        var clock = new ManualUsageClock();
        using var dir = new TempDir();
        var store = new FileHealthQueueStore(dir.Queue);
        var script = new Script { HealthMode = "revoked" };
        var auth = new List<string?>();
        var first = Reporter(new Probe(), clock, new ManualHeartbeatTicker(), store, script, error => auth.Add(error.Code));
        first.Start();
        await first.Ticker.PulseAsync();

        Assert.Equal("DEVICE_REVOKED", Assert.Single(auth));
        Assert.Equal("revoked", first.Snapshot.SyncPhase);
        Assert.False(first.Ticker.IsRunning);
        Assert.True(store.Load().Halted);
        var kept = Assert.Single(store.Load().Items);
        var uploads = script.Bodies.Count;

        script.HealthMode = "ok";
        var resumed = Reporter(new Probe(), clock, new ManualHeartbeatTicker(), store, script);
        resumed.Start();
        await resumed.Ticker.PulseAsync();

        Assert.False(resumed.Ticker.IsRunning);
        Assert.Equal(uploads, script.Bodies.Count);
        Assert.Equal(kept.Id, Assert.Single(store.Load().Items).Id);
        Assert.Equal(kept.Payload, store.Load().Items[0].Payload);
    }

    [Fact]
    public async Task ANewDeviceClearsAHaltedQueue()
    {
        var clock = new ManualUsageClock();
        var store = new MemoryHealthQueueStore();
        store.Save(new HealthQueueState
        {
            DeviceId = "device-1",
            Halted = true,
            Items = [Record("old-sample", clock.UtcNow)],
        });
        var script = new Script();
        HealthChannel? channel = Channel(script, "device-2");
        var ticker = new ManualHeartbeatTicker();
        var reporter = new HealthReporter(new Probe(), clock, ticker, store, () => channel, TimeSpan.FromSeconds(30), _ => 0);

        reporter.Start();
        await ticker.PulseAsync();

        Assert.False(store.Load().Halted);
        Assert.Equal("device-2", store.Load().DeviceId);
        Assert.DoesNotContain(store.Load().Items, item => item.Id == "old-sample");
        var body = Assert.Single(script.Bodies);
        Assert.DoesNotContain("old-sample", body, StringComparison.Ordinal);
        Assert.Contains("/api/me/agent-devices/device-2/health-batches", Assert.Single(script.Calls), StringComparison.Ordinal);
    }

    [Fact]
    public async Task SignOutKeepsTheQueueAndTheNextSignInUploadsTheSameSample()
    {
        using var dir = new TempDir();
        var clock = new ManualUsageClock();
        var ticker = new ManualHeartbeatTicker();
        var devices = StoredDevice();
        var script = new WorkspaceScript { HealthMode = "offline" };
        var store = new FileHealthQueueStore(dir.Queue);
        var workspace = Workspace(dir, devices, script, clock, ticker, store);

        var signedIn = await workspace.SignInAsync("http://127.0.0.1:4000", Email, Password);
        Assert.True(signedIn.Succeeded);
        Assert.True(ticker.IsRunning);
        await ticker.PulseAsync();
        var id = Assert.Single(store.Load().Items).Id;
        await workspace.SignOutAsync();

        Assert.False(workspace.IsSignedIn);
        Assert.False(ticker.IsRunning);
        Assert.Single(script.HealthBodies);
        var queued = await File.ReadAllTextAsync(dir.Queue);
        var settings = await File.ReadAllTextAsync(dir.Settings);
        Assert.Contains(id, queued, StringComparison.Ordinal);
        Assert.DoesNotContain(Secret, queued, StringComparison.Ordinal);
        Assert.DoesNotContain(Password, queued, StringComparison.Ordinal);
        Assert.DoesNotContain("eyJ", queued, StringComparison.Ordinal);
        Assert.DoesNotContain("credential", queued, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("apiBaseUrl", settings, StringComparison.Ordinal);
        Assert.DoesNotContain(Secret, settings, StringComparison.Ordinal);
        Assert.DoesNotContain(Password, settings, StringComparison.Ordinal);
        Assert.DoesNotContain("eyJ", settings, StringComparison.Ordinal);
        Assert.DoesNotContain("cpuPercent", settings, StringComparison.Ordinal);
        Assert.DoesNotContain("clientSampleId", settings, StringComparison.Ordinal);
        Assert.DoesNotContain(script.Calls, call => call.Contains("/api/data/devices", StringComparison.Ordinal));

        script.HealthMode = "ok";
        clock.Advance(TimeSpan.FromSeconds(5));
        var again = await workspace.SignInAsync("http://127.0.0.1:4000", Email, Password);
        Assert.True(again.Succeeded);
        Assert.True(ticker.IsRunning);
        Assert.Single(script.HealthBodies);
        await ticker.PulseAsync();

        Assert.Equal(2, script.HealthBodies.Count);
        Assert.Equal(script.HealthBodies[0], script.HealthBodies[1]);
        Assert.Contains(id, script.HealthBodies[1], StringComparison.Ordinal);
        Assert.Empty(store.Load().Items);
        Assert.Equal("idle", workspace.Health.SyncPhase);
    }

    [Fact]
    public async Task RevocationDoesNotSignTheUserOutOrKeepUploading()
    {
        using var dir = new TempDir();
        var clock = new ManualUsageClock();
        var ticker = new ManualHeartbeatTicker();
        var devices = StoredDevice();
        var script = new WorkspaceScript { HealthMode = "revoked" };
        var store = new FileHealthQueueStore(dir.Queue);
        var workspace = Workspace(dir, devices, script, clock, ticker, store);

        Assert.True((await workspace.SignInAsync("http://127.0.0.1:4000", Email, Password)).Succeeded);
        await ticker.PulseAsync();
        clock.Advance(TimeSpan.FromMinutes(10));
        await ticker.PulseAsync();

        Assert.True(workspace.IsSignedIn);
        Assert.Equal("revoked", workspace.Enrollment.Phase);
        Assert.Equal("revoked", devices.Load()!.Status);
        Assert.Equal(Secret, devices.Load()!.Secret);
        Assert.False(ticker.IsRunning);
        Assert.True(store.Load().Halted);
        Assert.Single(script.HealthBodies);
        Assert.DoesNotContain(script.Calls, call => call.Contains("/api/auth/refresh", StringComparison.Ordinal));
        Assert.NotEmpty(store.Load().Items);
    }

    [Fact]
    public async Task CredentialRejectionStopsUploadsWithoutRefreshingOrClearingTheSession()
    {
        using var dir = new TempDir();
        var clock = new ManualUsageClock();
        var ticker = new ManualHeartbeatTicker();
        var devices = StoredDevice();
        var script = new WorkspaceScript { HealthMode = "credential" };
        var store = new MemoryHealthQueueStore();
        var workspace = Workspace(dir, devices, script, clock, ticker, store);

        Assert.True((await workspace.SignInAsync("http://127.0.0.1:4000", Email, Password)).Succeeded);
        await ticker.PulseAsync();
        var uploads = script.HealthBodies.Count;
        clock.Advance(TimeSpan.FromMinutes(10));
        await ticker.PulseAsync();

        Assert.True(workspace.IsSignedIn);
        Assert.Equal("active", workspace.Enrollment.Phase);
        Assert.Equal("active", devices.Load()!.Status);
        Assert.False(ticker.IsRunning);
        Assert.False(store.Load().Halted);
        Assert.NotEmpty(store.Load().Items);
        Assert.Equal(uploads, script.HealthBodies.Count);
        Assert.DoesNotContain(script.Calls, call => call.Contains("/api/auth/refresh", StringComparison.Ordinal));
        Assert.DoesNotContain(Secret, System.Text.Json.JsonSerializer.Serialize(store.Load()), StringComparison.Ordinal);
    }

    [Fact]
    public void CorruptHealthQueueIsQuarantinedInsteadOfBeingReplaced()
    {
        using var dir = new TempDir();
        File.WriteAllText(dir.Queue, "{not-json");
        var store = new FileHealthQueueStore(dir.Queue);
        Assert.Empty(store.Load().Items);
        Assert.False(File.Exists(dir.Queue));
        var quarantined = Assert.Single(Directory.GetFiles(dir.Root, "health-queue.json.corrupt*"));
        Assert.Equal("{not-json", File.ReadAllText(quarantined));
        store.Save(new HealthQueueState());
        Assert.Equal("{not-json", File.ReadAllText(quarantined));
        Assert.True(File.Exists(dir.Queue));
    }

    private static RunningReporter Reporter(
        Probe probe,
        ManualUsageClock clock,
        ManualHeartbeatTicker ticker,
        IHealthQueueStore store,
        Script script,
        Action<TrilezApiException>? onAuthorization = null)
    {
        HealthChannel? channel = Channel(script, "device-1");
        var reporter = new HealthReporter(probe, clock, ticker, store, () => channel, TimeSpan.FromSeconds(30), _ => 0, onAuthorization);
        return new RunningReporter(reporter, ticker);
    }

    private static HealthChannel Channel(Script script, string deviceId) => new()
    {
        Client = script.Client,
        DeviceId = deviceId,
        Credential = Secret,
        Active = true,
        ConnectionStatus = "online",
        LastSeenAt = DateTimeOffset.Parse("2026-10-16T07:59:00Z"),
        CollectorPhase = "running",
    };

    private static TrilezEmployeeWorkspace Workspace(
        TempDir dir,
        MemoryDeviceCredentialStore devices,
        WorkspaceScript script,
        ManualUsageClock clock,
        ManualHeartbeatTicker ticker,
        IHealthQueueStore store) => new(
        new JsonAgentSettingsStore(dir.Settings),
        (url, session) => new TrilezApiClient(new HttpClient(script) { Timeout = TimeSpan.FromSeconds(5) }, TrilezApiClient.NormalizeBase(url), session),
        devices,
        new IdleHeartbeatTicker(),
        usageClock: clock,
        healthProbe: new Probe(),
        healthTicker: ticker,
        healthQueue: store,
        healthSampleInterval: TimeSpan.FromSeconds(30),
        healthJitter: _ => 0);

    private static MemoryDeviceCredentialStore StoredDevice()
    {
        var devices = new MemoryDeviceCredentialStore();
        devices.Save(new StoredDeviceCredential
        {
            InstallationId = "22222222-2222-2222-2222-222222222222",
            EnrollmentId = DeviceId,
            Secret = Secret,
            DeviceName = "laptop",
            Status = "active",
        });
        return devices;
    }

    private static TelemetryRecord Record(string id, DateTimeOffset createdAt) => new()
    {
        Id = id,
        Payload = "{\"clientSampleId\":\"" + id + "\",\"sampledAt\":\"2026-10-16T08:00:00+00:00\",\"online\":true,\"agentVersion\":\"0.2.0\",\"collectorPhase\":\"stopped\",\"syncPhase\":\"pending\",\"queueDepth\":1,\"pendingBytes\":1}",
        CreatedAt = createdAt,
    };

    private static string SampleId(string body)
    {
        var match = Regex.Match(body, "\"clientSampleId\":\"([^\"]+)\"");
        Assert.True(match.Success);
        return match.Groups[1].Value;
    }

    private sealed class RunningReporter(HealthReporter reporter, ManualHeartbeatTicker ticker)
    {
        public ManualHeartbeatTicker Ticker { get; } = ticker;
        public HealthSnapshot Snapshot => reporter.Snapshot;
        public void Start() => reporter.Start();
    }

    private sealed class Probe : IHealthProbe
    {
        public HealthReading Next { get; set; } = new()
        {
            CpuPercent = 12.5,
            MemoryUsedBytes = 100,
            MemoryTotalBytes = 1_000,
            DiskFreeBytes = 4_096,
            DiskTotalBytes = 8_192,
            OsName = "Windows 11",
            OsVersion = "10.0.22631",
            Architecture = "X64",
        };
        public int Reads { get; private set; }
        public bool Throw { get; set; }
        public HealthReading Read()
        {
            Reads++;
            if (Throw) throw new InvalidOperationException("probe failed");
            return Next;
        }
    }

    private sealed class ManualUsageClock : IUsageClock
    {
        public long Timestamp { get; private set; }
        public DateTimeOffset UtcNow { get; private set; } = DateTimeOffset.Parse("2026-10-16T08:00:00Z");
        public TimeSpan Elapsed(long startedAt, long endedAt) => TimeSpan.FromMilliseconds(endedAt - startedAt);
        public void Advance(TimeSpan by)
        {
            Timestamp += (long)by.TotalMilliseconds;
            UtcNow = UtcNow.Add(by);
        }
    }

    private sealed class TempDir : IDisposable
    {
        public TempDir()
        {
            Root = Directory.CreateTempSubdirectory("trilez-health-").FullName;
            Settings = Path.Combine(Root, "agent-settings.json");
            Queue = Path.Combine(Root, "health-queue.json");
        }

        public string Root { get; }
        public string Settings { get; }
        public string Queue { get; }
        public void Dispose() => Directory.Delete(Root, recursive: true);
    }

    private sealed class Script : HttpMessageHandler
    {
        private readonly SessionState _session = new() { AccessToken = "eyJhbGciOiJub25lIn0.health.sig" };
        public Script() => Client = new TrilezApiClient(new HttpClient(this) { Timeout = TimeSpan.FromSeconds(5) }, new Uri("https://trileez.example"), _session);
        public TrilezApiClient Client { get; }
        public string HealthMode { get; set; } = "ok";
        public List<string> Calls { get; } = [];
        public List<string> Bodies { get; } = [];
        public List<string> Credentials { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var path = request.RequestUri!.AbsolutePath;
            var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
            Calls.Add(request.Method.Method + " " + path);
            if (!path.EndsWith("/health-batches", StringComparison.Ordinal))
                return Json(HttpStatusCode.InternalServerError, """{"error":"unexpected","code":"INTERNAL_ERROR"}""");
            Bodies.Add(body);
            if (request.Headers.TryGetValues("X-Device-Credential", out var values)) Credentials.Add(values.Single());
            if (HealthMode == "offline") throw new HttpRequestException("temporary outage");
            if (HealthMode == "server") return Json(HttpStatusCode.ServiceUnavailable, """{"error":"unavailable","code":"INTERNAL_ERROR"}""");
            if (HealthMode == "revoked") return Json(HttpStatusCode.Forbidden, """{"error":"revoked","code":"DEVICE_REVOKED"}""");
            if (HealthMode == "credential") return Json(HttpStatusCode.Unauthorized, """{"error":"rejected","code":"DEVICE_CREDENTIAL_REJECTED"}""");
            if (HealthMode == "poison") return Json(HttpStatusCode.BadRequest, """{"error":"Validation failed","code":"VALIDATION_ERROR"}""");
            if (HealthMode == "duplicate")
            {
                var ids = Ids(body);
                return Json(HttpStatusCode.OK, "{\"data\":{\"accepted\":0,\"duplicate\":" + ids.Count.ToString(CultureInfo.InvariantCulture) + ",\"duplicateIds\":[" + string.Join(',', ids.Select(id => "\"" + id + "\"")) + "],\"rejected\":[]}}");
            }
            if (HealthMode == "accept-first")
            {
                var first = Ids(body)[0];
                return Json(HttpStatusCode.OK, "{\"data\":{\"accepted\":1,\"duplicate\":0,\"acceptedIds\":[\"" + first + "\"],\"duplicateIds\":[],\"rejected\":[]}}");
            }
            return Json(HttpStatusCode.OK, """{"data":{"accepted":1,"duplicate":0,"acceptedIds":[],"duplicateIds":[],"rejected":[],"lastSuccessfulUploadAt":"2026-10-16T08:05:00.0000000Z"}}""");
        }

        private static List<string> Ids(string body)
        {
            var ids = new List<string>();
            foreach (Match match in Regex.Matches(body, "\"clientSampleId\":\"([^\"]+)\"")) ids.Add(match.Groups[1].Value);
            return ids;
        }

        private static HttpResponseMessage Json(HttpStatusCode status, string body) =>
            new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
    }

    private sealed class WorkspaceScript : HttpMessageHandler
    {
        public string HealthMode { get; set; } = "ok";
        public List<string> Calls { get; } = [];
        public List<string> HealthBodies { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var path = request.RequestUri!.AbsolutePath;
            var method = request.Method.Method;
            var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
            Calls.Add(method + " " + path);
            if (path == "/api/health/live") return Json(HttpStatusCode.OK, """{"ok":true}""");
            if (path.EndsWith("/health-batches", StringComparison.Ordinal))
            {
                HealthBodies.Add(body);
                if (HealthMode == "offline") throw new HttpRequestException("temporary outage");
                if (HealthMode == "revoked") return Json(HttpStatusCode.Forbidden, """{"error":"revoked","code":"DEVICE_REVOKED"}""");
                if (HealthMode == "credential") return Json(HttpStatusCode.Unauthorized, """{"error":"rejected","code":"DEVICE_CREDENTIAL_REJECTED"}""");
                return Json(HttpStatusCode.OK, """{"data":{"accepted":1,"duplicate":0,"acceptedIds":[],"duplicateIds":[],"rejected":[],"lastSuccessfulUploadAt":"2026-10-16T08:05:00.0000000Z"}}""");
            }
            if (path == "/api/auth/login")
                return Json(HttpStatusCode.OK, "{\"token\":\"eyJhbGciOiJub25lIn0.payload.sig\",\"user\":{\"id\":\"user-health\",\"name\":\"Actor health\",\"email\":\"" + Email + "\",\"role\":\"member\",\"isActive\":true,\"mustChangePassword\":false}}");
            if (path == "/api/auth/me")
                return Json(HttpStatusCode.OK, "{\"user\":{\"id\":\"user-health\",\"name\":\"Actor health\",\"email\":\"" + Email + "\",\"role\":\"member\",\"isActive\":true,\"mustChangePassword\":false},\"employee\":{\"state\":\"active\",\"employeeId\":\"employee-health\",\"employmentStatus\":\"active\"}}");
            if (path == "/api/auth/logout") return new HttpResponseMessage(HttpStatusCode.NoContent);
            if (path == "/api/auth/refresh") return Json(HttpStatusCode.Unauthorized, """{"error":"Session is revoked or expired","code":"SESSION_REVOKED"}""");
            if (method == "GET" && path == "/api/me/agent-devices/" + DeviceId)
                return Json(HttpStatusCode.OK, "{\"data\":{\"id\":\"" + DeviceId + "\",\"installationId\":\"22222222-2222-2222-2222-222222222222\",\"deviceName\":\"laptop\",\"status\":\"active\",\"connectionStatus\":\"online\",\"agentVersion\":\"0.2.0\",\"lastSeenAt\":\"2026-10-16T07:59:00.0000000Z\"}}");
            if (path.EndsWith("/disconnect", StringComparison.Ordinal))
                return Json(HttpStatusCode.OK, "{\"data\":{\"id\":\"" + DeviceId + "\",\"status\":\"active\",\"connectionStatus\":\"offline\"}}");
            return Json(HttpStatusCode.OK, """{"data":[],"page":{"limit":200,"hasMore":false}}""");
        }

        private static HttpResponseMessage Json(HttpStatusCode status, string body) =>
            new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
    }
}
