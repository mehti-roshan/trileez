using System.Net;
using System.Text;
using System.Text.Json;
using Trilez.Agent;
using Trilez.Agent.Presentation;
using Xunit;

namespace Trilez.Agent.Presentation.Tests;

public sealed class UsageCollectorTests
{
    private const string Secret = "device-secret-value";
    private const string Email = "usage.agent@example.com";
    private const string Password = "StrongPassword123!";

    [Fact]
    public async Task BatchedUploadKeepsCumulativeDurationsAcrossASwitch()
    {
        var clock = new ManualUsageClock();
        var probe = new Probe();
        var ticker = new ManualHeartbeatTicker();
        var store = new MemoryUsageQueueStore();
        var script = new Script();
        var collector = Collector(probe, clock, ticker, store, script);

        collector.Start();
        probe.Enqueue("Notepad");
        await ticker.PulseAsync();
        clock.Advance(TimeSpan.FromSeconds(1));
        probe.Enqueue("Notepad");
        await ticker.PulseAsync();
        clock.Advance(TimeSpan.FromSeconds(1));
        probe.Enqueue("Code");
        await ticker.PulseAsync();
        clock.Advance(TimeSpan.FromSeconds(1));
        probe.Enqueue("Code");
        await ticker.PulseAsync();

        Assert.Single(script.UploadBodies);
        Assert.Equal(2000, store.Load().Intervals.Where(interval => interval.ProcessName == "Notepad").Sum(interval => interval.DurationMs));
        Assert.Equal(1000, store.Load().Intervals.Where(interval => interval.ProcessName == "Code").Sum(interval => interval.DurationMs));
        await collector.FlushAsync();
        var latest = Durations(script.UploadBodies[^1]);
        Assert.Equal(2000, latest["Notepad"]);
        Assert.Equal(1000, latest["Code"]);
        Assert.Equal(3000, latest.Values.Sum());
        Assert.DoesNotContain(script.UploadBodies, body => body.Contains("employeeId", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(script.UploadBodies, body => body.Contains("windowTitle", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(script.UploadBodies, body => body.Contains("keystroke", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(script.UploadBodies, body => body.Contains("clipboard", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(script.Calls, call => call.Contains("/api/data/devices", StringComparison.Ordinal));
    }

    [Fact]
    public async Task ALostUploadIsRetriedWithTheSameDuration()
    {
        var clock = new ManualUsageClock();
        var probe = new Probe();
        var ticker = new ManualHeartbeatTicker();
        var store = new MemoryUsageQueueStore();
        var script = new Script { FailUploads = 1 };
        var collector = Collector(probe, clock, ticker, store, script);

        collector.Start();
        probe.Enqueue("Notepad");
        await ticker.PulseAsync();
        clock.Advance(TimeSpan.FromSeconds(1));
        probe.Enqueue("Notepad");
        await ticker.PulseAsync();
        Assert.Equal(1000, store.Load().Intervals.Single().DurationMs);
        await collector.FlushAsync();

        Assert.Equal(2, script.UploadBodies.Count);
        Assert.Equal(Durations(script.UploadBodies[0])["Notepad"], Durations(script.UploadBodies[1])["Notepad"]);
        Assert.Equal(1000, Durations(script.UploadBodies[1])["Notepad"]);
        Assert.Empty(store.Load().Intervals);
        Assert.Equal("running", collector.Snapshot.Phase);
    }

    [Fact]
    public async Task OfflineQueueSurvivesANewCollectorWithoutCountingTheGap()
    {
        var clock = new ManualUsageClock();
        var probe = new Probe();
        var ticker = new ManualHeartbeatTicker();
        using var dir = new TempDir();
        var store = new FileUsageQueueStore(dir.Queue);
        var script = new Script { FailUploads = 1 };
        var collector = Collector(probe, clock, ticker, store, script);
        collector.Start();
        probe.Enqueue("Notepad");
        await ticker.PulseAsync();
        clock.Advance(TimeSpan.FromSeconds(1));
        probe.Enqueue("Notepad");
        await ticker.PulseAsync();
        var sampleAt = store.Load().LastSampleAt;
        Assert.Equal(1000, store.Load().Intervals.Single().DurationMs);
        var raw = await File.ReadAllTextAsync(dir.Queue);
        Assert.DoesNotContain(Secret, raw);
        Assert.DoesNotContain("employeeId", raw, StringComparison.OrdinalIgnoreCase);

        clock.Advance(TimeSpan.FromHours(2));
        var resumedScript = new Script();
        var resumed = Collector(new Probe(), clock, new ManualHeartbeatTicker(), store, resumedScript);
        resumed.Start();
        var queued = store.Load();
        Assert.Equal("restart", queued.Sessions.Single().EndReason);
        Assert.Equal(sampleAt, queued.Sessions.Single().EndedAt);
        Assert.Equal(1000, queued.Intervals.Single().DurationMs);
        await resumed.FlushAsync();
        Assert.Empty(store.Load().Intervals);
        var uploaded = Assert.Single(resumedScript.UploadBodies);
        Assert.Contains("\"endReason\":\"restart\"", uploaded, StringComparison.Ordinal);
        Assert.Equal(1000, Durations(uploaded)["Notepad"]);
        Assert.DoesNotContain("10:00:01", uploaded, StringComparison.Ordinal);
    }

    [Fact]
    public async Task LockEndsTheSessionWithoutCreditingThePartialSample()
    {
        var clock = new ManualUsageClock();
        var probe = new Probe();
        var signals = new Signals();
        var ticker = new ManualHeartbeatTicker();
        var store = new MemoryUsageQueueStore();
        var script = new Script();
        var collector = Collector(probe, clock, ticker, store, script, signals);

        collector.Start();
        probe.Enqueue("Notepad");
        await ticker.PulseAsync();
        clock.Advance(TimeSpan.FromSeconds(1));
        probe.Enqueue("Notepad");
        await ticker.PulseAsync();
        clock.Advance(TimeSpan.FromMilliseconds(400));
        signals.Pending = UsageBoundary.Lock;
        probe.Enqueue("Notepad");
        await ticker.PulseAsync();

        var session = store.Load().Sessions.Single();
        Assert.False(session.Open);
        Assert.Equal("lock", session.EndReason);
        Assert.All(script.UploadBodies, body => Assert.True(Durations(body).GetValueOrDefault("Notepad") <= 1000));
        Assert.Equal(1000, script.UploadBodies.Max(body => Durations(body).GetValueOrDefault("Notepad")));
        Assert.Contains(script.UploadBodies, body => body.Contains("\"endReason\":\"lock\"", StringComparison.Ordinal));
    }

    [Fact]
    public async Task DisabledPolicyStopsBeforeSampling()
    {
        var probe = new Probe();
        var ticker = new ManualHeartbeatTicker();
        var script = new Script { Enabled = false };
        var collector = Collector(probe, new ManualUsageClock(), ticker, new MemoryUsageQueueStore(), script);

        collector.Start();
        await ticker.PulseAsync();

        Assert.Equal(0, probe.Reads);
        Assert.False(ticker.IsRunning);
        Assert.Equal("disabled", collector.Snapshot.Phase);
        Assert.Empty(script.UploadBodies);
    }

    [Fact]
    public async Task SignOutUploadsTheOpenSessionBeforeDisconnect()
    {
        var clock = new ManualUsageClock();
        var probe = new Probe();
        var ticker = new ManualHeartbeatTicker();
        using var dir = new TempDir();
        var devices = new MemoryDeviceCredentialStore();
        devices.Save(new StoredDeviceCredential
        {
            InstallationId = "11111111-1111-1111-1111-111111111111",
            EnrollmentId = "device-1",
            Secret = Secret,
            DeviceName = "laptop",
            Status = "active",
        });
        var script = new Script { FailUploads = 1 };
        var settings = new JsonAgentSettingsStore(dir.Settings);
        var workspace = new TrilezEmployeeWorkspace(
            settings,
            (url, session) => new TrilezApiClient(new HttpClient(script) { Timeout = TimeSpan.FromSeconds(5) }, TrilezApiClient.NormalizeBase(url), session),
            devices,
            new IdleHeartbeatTicker(),
            probe,
            usageClock: clock,
            usageTicker: ticker,
            usageQueue: new FileUsageQueueStore(dir.Queue));

        var signedIn = await workspace.SignInAsync("http://127.0.0.1:4000", Email, Password);
        Assert.True(signedIn.Succeeded);
        Assert.True(ticker.IsRunning);
        probe.Enqueue("Notepad");
        await ticker.PulseAsync();
        clock.Advance(TimeSpan.FromSeconds(1));
        probe.Enqueue("Notepad");
        await ticker.PulseAsync();
        var batchesBeforeSignOut = script.UploadBodies.Count;
        await workspace.SignOutAsync();

        Assert.False(workspace.IsSignedIn);
        Assert.True(script.UploadBodies.Count > batchesBeforeSignOut);
        var batchAt = script.Calls.FindIndex(call => call.Contains("/usage-batches", StringComparison.Ordinal));
        var disconnectAt = script.Calls.FindLastIndex(call => call.EndsWith("/disconnect", StringComparison.Ordinal));
        var logoutAt = script.Calls.FindIndex(call => call == "POST /api/auth/logout");
        Assert.True(batchAt >= 0 && batchAt < disconnectAt && disconnectAt < logoutAt);
        Assert.Equal(1000, Durations(script.UploadBodies[^1])["Notepad"]);
        Assert.DoesNotContain(script.UploadBodies, body => body.Contains("employeeId", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(await File.ReadAllTextAsync(dir.Settings), Secret);
    }

    [Fact]
    public async Task ShellShowsCollectorStateAndClearsItOnSignOut()
    {
        var workspace = new FakeWorkspace();
        var shell = new ShellViewModel(workspace)
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
        workspace.Usage = new UsageSnapshot
        {
            Phase = "running",
            PendingIntervals = 2,
            CanPause = true,
            LastSuccessfulUploadAt = DateTimeOffset.Parse("2026-10-16T08:00:00Z"),
        };
        workspace.NotifyUsageChanged();

        Assert.True(shell.IsSignedIn);
        Assert.Equal("در حال جمع‌آوری", shell.UsagePhaseLabel);
        Assert.Contains("نمونه‌های منتظر ارسال: 2", shell.UsageDetail);
        Assert.Contains("آخرین ارسال موفق", shell.UsageDetail);
        Assert.Equal(PresentationText.SignedInMessage, shell.SuccessMessage);
        Assert.True(shell.CanPauseUsage);

        workspace.Usage = new UsageSnapshot { Phase = "disabled" };
        workspace.NotifyUsageChanged();
        Assert.True(shell.IsSignedIn);
        Assert.Equal("سیاست جمع‌آوری خاموش است", shell.UsagePhaseLabel);

        workspace.OnPause = paused =>
        {
            Assert.True(paused);
            workspace.Usage = new UsageSnapshot { Phase = "paused", CanResume = true };
            return UsageCommandResult.Ok(PresentationText.UsagePaused);
        };
        await shell.PauseUsageAsync();
        Assert.Equal(PresentationText.UsagePaused, shell.SuccessMessage);
        Assert.Equal("متوقف‌شده", shell.UsagePhaseLabel);
        Assert.DoesNotContain("حقوق", shell.SuccessMessage);

        await shell.SignOutAsync();
        Assert.Equal("", shell.UsagePhaseLabel);
        Assert.Equal("", shell.UsageDetail);
        Assert.False(shell.CanPauseUsage);
        Assert.False(shell.CanResumeUsage);
    }

    [Fact]
    public async Task APausedRejectionStaysQueuedAndIsRetried()
    {
        var clock = new ManualUsageClock();
        var probe = new Probe();
        var ticker = new ManualHeartbeatTicker();
        var store = new MemoryUsageQueueStore();
        var script = new Script { RejectProcess = "Notepad", RejectCode = "USAGE_PAUSED" };
        var collector = Collector(probe, clock, ticker, store, script);

        collector.Start();
        probe.Enqueue("Notepad");
        await ticker.PulseAsync();
        clock.Advance(TimeSpan.FromSeconds(1));
        probe.Enqueue("Notepad");
        await ticker.PulseAsync();

        var kept = Assert.Single(store.Load().Intervals);
        Assert.Equal("Notepad", kept.ProcessName);
        Assert.Equal("offline", collector.Snapshot.Phase);
        Assert.Equal(UserMessages.For(403, "USAGE_PAUSED"), collector.Snapshot.Message);
        Assert.Null(store.Load().LastSuccessfulUploadAt);
        var first = Assert.Single(script.UploadBodies);
        await collector.FlushAsync();

        Assert.Equal(2, script.UploadBodies.Count);
        Assert.Equal(IntervalIds(first), IntervalIds(script.UploadBodies[1]));
        Assert.Equal(kept.ClientIntervalId, Assert.Single(store.Load().Intervals).ClientIntervalId);
        Assert.Equal("offline", collector.Snapshot.Phase);
    }

    [Fact]
    public async Task APermanentRejectionIsDroppedWithoutASuccessfulSync()
    {
        var clock = new ManualUsageClock();
        var probe = new Probe();
        var ticker = new ManualHeartbeatTicker();
        var store = new MemoryUsageQueueStore();
        var script = new Script { RejectProcess = "Notepad", RejectCode = "USAGE_DURATION" };
        var collector = Collector(probe, clock, ticker, store, script);

        collector.Start();
        probe.Enqueue("Notepad");
        await ticker.PulseAsync();
        clock.Advance(TimeSpan.FromSeconds(1));
        probe.Enqueue("Notepad");
        await ticker.PulseAsync();

        Assert.Empty(store.Load().Intervals);
        Assert.Equal("running", collector.Snapshot.Phase);
        Assert.Null(collector.Snapshot.Message);
        Assert.Null(store.Load().LastSuccessfulUploadAt);
        var rejectedId = Assert.Single(IntervalIds(Assert.Single(script.UploadBodies)));
        await collector.FlushAsync();
        Assert.DoesNotContain(script.UploadBodies.Skip(1), body => body.Contains(rejectedId, StringComparison.Ordinal));
    }

    [Fact]
    public async Task AnUnacknowledgedBatchStaysQueuedForRetry()
    {
        var clock = new ManualUsageClock();
        var probe = new Probe();
        var ticker = new ManualHeartbeatTicker();
        var store = new MemoryUsageQueueStore();
        var script = new Script { Unacknowledged = true };
        var collector = Collector(probe, clock, ticker, store, script);

        collector.Start();
        probe.Enqueue("Notepad");
        await ticker.PulseAsync();
        clock.Advance(TimeSpan.FromSeconds(1));
        probe.Enqueue("Notepad");
        await ticker.PulseAsync();
        clock.Advance(TimeSpan.FromSeconds(1));
        probe.Enqueue("Code");
        await ticker.PulseAsync();
        clock.Advance(TimeSpan.FromSeconds(1));
        probe.Enqueue("Code");
        await ticker.PulseAsync();
        await collector.FlushAsync();

        var queued = store.Load().Intervals;
        Assert.Equal(2, queued.Count);
        Assert.Contains(queued, interval => interval.ProcessName == "Notepad");
        Assert.Contains(queued, interval => interval.ProcessName == "Code");
        Assert.Equal("offline", collector.Snapshot.Phase);
        Assert.Equal(UsageCollector.IncompleteUploadMessage, collector.Snapshot.Message);
        Assert.Null(store.Load().LastSuccessfulUploadAt);
        var sent = IntervalIds(script.UploadBodies[^1]);
        await collector.FlushAsync();
        Assert.Equal(sent, IntervalIds(script.UploadBodies[^1]));
        Assert.Equal(2, store.Load().Intervals.Count);
    }

    [Fact]
    public void StartDropsExpiredUsageAndKeepsTheQueueBounded()
    {
        var clock = new ManualUsageClock();
        var store = new MemoryUsageQueueStore();
        var state = new UsageQueueState
        {
            Policy = new UsagePolicyCache { Enabled = true, RetentionDays = 30, FetchedAt = clock.UtcNow },
            Sessions =
            [
                new UsageSessionDraft { ClientSessionId = "session-closed", StartedAt = clock.UtcNow.AddDays(-1), Open = false, Uploaded = false },
            ],
        };
        state.Intervals.Add(new UsageIntervalDraft
        {
            ClientSessionId = "session-closed",
            ClientIntervalId = "old-interval",
            ProcessName = "Old",
            StartedAt = clock.UtcNow.AddDays(-40),
            DurationMs = 1000,
        });
        for (var index = 0; index < UsageCollector.MaxQueuedIntervals + 25; index++)
        {
            state.Intervals.Add(new UsageIntervalDraft
            {
                ClientSessionId = "session-closed",
                ClientIntervalId = "extra-" + index.ToString("D4"),
                ProcessName = "App",
                StartedAt = clock.UtcNow.AddMinutes(-UsageCollector.MaxQueuedIntervals - 25 + index),
                DurationMs = 1000,
            });
        }
        state.Intervals.Add(new UsageIntervalDraft
        {
            ClientSessionId = "session-closed",
            ClientIntervalId = "newest-interval",
            ProcessName = "New",
            StartedAt = clock.UtcNow.AddMinutes(-1),
            DurationMs = 1000,
        });
        store.Save(state);

        Collector(new Probe(), clock, new ManualHeartbeatTicker(), store, new Script()).Start();

        var queued = store.Load().Intervals;
        Assert.DoesNotContain(queued, interval => interval.ClientIntervalId == "old-interval");
        Assert.DoesNotContain(queued, interval => interval.ClientIntervalId == "extra-0000");
        Assert.Contains(queued, interval => interval.ClientIntervalId == "newest-interval");
        Assert.True(queued.Count <= UsageCollector.MaxQueuedIntervals);
    }

    [Fact]
    public void StartDropsOversizedQueuedUsageUntilTheByteCap()
    {
        var clock = new ManualUsageClock();
        var store = new MemoryUsageQueueStore();
        var bulky = new string('A', 20_000);
        var state = new UsageQueueState
        {
            Policy = new UsagePolicyCache { Enabled = true, RetentionDays = 30, FetchedAt = clock.UtcNow },
            Sessions =
            [
                new UsageSessionDraft { ClientSessionId = "session-bulk", StartedAt = clock.UtcNow.AddHours(-2), Open = false, Uploaded = false },
            ],
        };
        for (var index = 0; index < 40; index++)
        {
            state.Intervals.Add(new UsageIntervalDraft
            {
                ClientSessionId = "session-bulk",
                ClientIntervalId = "bulk-" + index.ToString("D2"),
                ProcessName = "App",
                DisplayName = bulky,
                StartedAt = clock.UtcNow.AddMinutes(-40 + index),
                DurationMs = 1000,
            });
        }
        store.Save(state);

        Collector(new Probe(), clock, new ManualHeartbeatTicker(), store, new Script()).Start();

        var queued = store.Load().Intervals;
        Assert.DoesNotContain(queued, interval => interval.ClientIntervalId == "bulk-00");
        Assert.Contains(queued, interval => interval.ClientIntervalId == "bulk-39");
        Assert.True(queued.Count < 40);
    }

    [Fact]
    public async Task QueueCapKeepsTheOpenSessionsCurrentInterval()
    {
        var clock = new ManualUsageClock();
        var probe = new Probe();
        var ticker = new ManualHeartbeatTicker();
        var store = new MemoryUsageQueueStore();
        var script = new Script { FailUploads = 5 };
        var collector = Collector(probe, clock, ticker, store, script);

        collector.Start();
        probe.Enqueue("Notepad");
        await ticker.PulseAsync();
        clock.Advance(TimeSpan.FromSeconds(1));
        probe.Enqueue("Notepad");
        await ticker.PulseAsync();

        var current = store.Load();
        var open = Assert.Single(current.Sessions, session => session.Open);
        var kept = Assert.Single(current.Intervals);
        current.Intervals[0] = new UsageIntervalDraft
        {
            ClientSessionId = kept.ClientSessionId,
            ClientIntervalId = kept.ClientIntervalId,
            ProcessName = kept.ProcessName,
            DisplayName = kept.DisplayName,
            StartedAt = clock.UtcNow.AddDays(-10),
            DurationMs = kept.DurationMs,
        };
        current.Sessions.Add(new UsageSessionDraft
        {
            ClientSessionId = "closed-session",
            StartedAt = clock.UtcNow.AddHours(-3),
            Open = false,
            Uploaded = true,
        });
        for (var index = 0; index < UsageCollector.MaxQueuedIntervals; index++)
        {
            current.Intervals.Add(new UsageIntervalDraft
            {
                ClientSessionId = "closed-session",
                ClientIntervalId = "newer-" + index.ToString("D4"),
                ProcessName = "App",
                StartedAt = clock.UtcNow.AddMinutes(-30).AddSeconds(index),
                DurationMs = 1000,
            });
        }
        store.Save(current);
        await collector.FlushAsync();

        var after = store.Load().Intervals;
        Assert.Contains(after, interval => interval.ClientIntervalId == kept.ClientIntervalId);
        Assert.DoesNotContain(after, interval => interval.ClientIntervalId == "newer-0000");
        Assert.Equal(UsageCollector.MaxQueuedIntervals, after.Count);
        Assert.Equal(open.ClientSessionId, kept.ClientSessionId);
    }

    [Fact]
    public void CorruptUsageQueueIsQuarantinedInsteadOfBeingReplaced()
    {
        using var dir = new TempDir();
        File.WriteAllText(dir.Queue, "{not-json");
        var store = new FileUsageQueueStore(dir.Queue);
        Assert.Empty(store.Load().Intervals);
        Assert.False(File.Exists(dir.Queue));
        var quarantined = Assert.Single(Directory.GetFiles(dir.Root, "usage-queue.json.corrupt*"));
        Assert.Equal("{not-json", File.ReadAllText(quarantined));
        store.Save(new UsageQueueState());
        Assert.Equal("{not-json", File.ReadAllText(quarantined));
        Assert.True(File.Exists(dir.Queue));
    }

    private static UsageCollector Collector(Probe probe, ManualUsageClock clock, ManualHeartbeatTicker ticker, IUsageQueueStore store, Script script, Signals? signals = null)
    {
        var session = new SessionState { AccessToken = "access-token" };
        var client = new TrilezApiClient(new HttpClient(script) { Timeout = TimeSpan.FromSeconds(5) }, new Uri("https://trileez.example"), session);
        return new UsageCollector(probe, signals, clock, ticker, store, () => new UsageChannel
        {
            Client = client,
            DeviceId = "device-1",
            Credential = Secret,
            Active = true,
        }, TimeSpan.FromSeconds(1), TimeSpan.FromMinutes(5));
    }

    private static Dictionary<string, long> Durations(string body)
    {
        using var document = JsonDocument.Parse(body);
        var totals = new Dictionary<string, long>(StringComparer.Ordinal);
        foreach (var interval in document.RootElement.GetProperty("intervals").EnumerateArray())
        {
            var name = interval.GetProperty("processName").GetString() ?? "";
            totals[name] = totals.GetValueOrDefault(name) + interval.GetProperty("durationMs").GetInt64();
        }
        return totals;
    }

    private static List<string> IntervalIds(string body)
    {
        using var document = JsonDocument.Parse(body);
        var ids = new List<string>();
        if (!document.RootElement.TryGetProperty("intervals", out var intervals)) return ids;
        foreach (var interval in intervals.EnumerateArray())
            ids.Add(interval.GetProperty("clientIntervalId").GetString() ?? "");
        return ids;
    }

    private static EmployeeDashboard Sample() => new()
    {
        Profile = new EmployeeProfile
        {
            Id = "user-usage", Name = "Actor usage", Email = Email, Role = "member", IsActive = true,
            EmployeeState = "active", EmployeeId = "employee-usage",
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

    private sealed class Probe : IForegroundProbe
    {
        private readonly Queue<UsageObservation> _next = new();
        public int Reads { get; private set; }
        public void Enqueue(string process) => _next.Enqueue(new UsageObservation(process, process, false, UsageBoundary.None));
        public UsageObservation Read(TimeSpan idleThreshold)
        {
            Reads++;
            return _next.Count == 0 ? new UsageObservation(null, null, true, UsageBoundary.None) : _next.Dequeue();
        }
    }

    private sealed class Signals : IUsageSignals
    {
        public bool Locked { get; set; }
        public UsageBoundary Pending { get; set; }
        public UsageBoundary ConsumeBoundary()
        {
            var value = Pending;
            Pending = UsageBoundary.None;
            return value;
        }
    }

    private sealed class ManualUsageClock : IUsageClock
    {
        public long Timestamp { get; set; }
        public DateTimeOffset UtcNow { get; set; } = DateTimeOffset.Parse("2026-10-16T08:00:00Z");
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
            var root = Directory.CreateTempSubdirectory("trilez-usage-").FullName;
            Settings = Path.Combine(root, "agent-settings.json");
            Queue = Path.Combine(root, "usage-queue.json");
            Root = root;
        }

        public string Root { get; }
        public string Settings { get; }
        public string Queue { get; }
        public void Dispose() => Directory.Delete(Root, recursive: true);
    }

    private sealed class Script : HttpMessageHandler
    {
        public bool Enabled { get; set; } = true;
        public int FailUploads { get; set; }
        public bool Unacknowledged { get; set; }
        public string? RejectProcess { get; set; }
        public string RejectCode { get; set; } = "USAGE_DURATION";
        public List<string> Calls { get; } = [];
        public List<string> UploadBodies { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var path = request.RequestUri!.AbsolutePath;
            var method = request.Method.Method;
            var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
            Calls.Add(method + " " + path);
            if (path == "/api/health/live") return Json(HttpStatusCode.OK, """{"ok":true}""");
            if (path.EndsWith("/usage-batches", StringComparison.Ordinal))
            {
                UploadBodies.Add(body);
                if (FailUploads > 0)
                {
                    FailUploads--;
                    return Json(HttpStatusCode.InternalServerError, """{"error":"unavailable","code":"INTERNAL_ERROR"}""");
                }
                return Json(HttpStatusCode.OK, UsageResult(body));
            }
            if (path.EndsWith("/usage-policy", StringComparison.Ordinal))
            {
                var enabled = Enabled ? "true" : "false";
                return Json(HttpStatusCode.OK, "{\"data\":{\"enabled\":" + enabled + ",\"employeeMayPause\":true,\"idleThresholdSeconds\":60,\"bucketSeconds\":300,\"retentionDays\":30,\"collectWindowTitles\":false,\"paused\":false}}");
            }
            if (path == "/api/auth/login")
                return Json(HttpStatusCode.OK, "{\"token\":\"eyJhbGciOiJub25lIn0.payload.sig\",\"user\":{\"id\":\"user-usage\",\"name\":\"Actor usage\",\"email\":\"" + Email + "\",\"role\":\"member\",\"isActive\":true,\"mustChangePassword\":false}}");
            if (path == "/api/auth/me")
                return Json(HttpStatusCode.OK, "{\"user\":{\"id\":\"user-usage\",\"name\":\"Actor usage\",\"email\":\"" + Email + "\",\"role\":\"member\",\"isActive\":true,\"mustChangePassword\":false},\"employee\":{\"state\":\"active\",\"employeeId\":\"employee-usage\",\"employmentStatus\":\"active\"}}");
            if (path == "/api/auth/logout") return new HttpResponseMessage(HttpStatusCode.NoContent);
            if (path == "/api/auth/refresh") return Json(HttpStatusCode.Unauthorized, """{"error":"Session is revoked or expired","code":"SESSION_REVOKED"}""");
            if (method == "GET" && path == "/api/me/agent-devices/device-1")
                return Json(HttpStatusCode.OK, """{"data":{"id":"device-1","installationId":"11111111-1111-1111-1111-111111111111","deviceName":"laptop","status":"active","connectionStatus":"online","agentVersion":"0.2.0"}}""");
            if (path.EndsWith("/disconnect", StringComparison.Ordinal))
                return Json(HttpStatusCode.OK, """{"data":{"id":"device-1","status":"active","connectionStatus":"offline"}}""");
            return Json(HttpStatusCode.OK, """{"data":[],"page":{"limit":200,"hasMore":false}}""");
        }

        private string UsageResult(string body)
        {
            if (Unacknowledged)
                return """{"data":{"accepted":0,"duplicate":0,"updated":0,"rejected":[],"lastSuccessfulUploadAt":"2026-10-16T08:05:00.0000000Z","enabled":true,"paused":false}}""";
            var accepted = 0;
            var rejected = new StringBuilder();
            try
            {
                using var document = JsonDocument.Parse(body);
                if (document.RootElement.TryGetProperty("intervals", out var intervals))
                {
                    foreach (var interval in intervals.EnumerateArray())
                    {
                        var name = interval.TryGetProperty("processName", out var process) ? process.GetString() : null;
                        var id = interval.TryGetProperty("clientIntervalId", out var raw) ? raw.GetString() : null;
                        if (RejectProcess is not null && string.Equals(name, RejectProcess, StringComparison.Ordinal) && !string.IsNullOrEmpty(id))
                        {
                            if (rejected.Length > 0) rejected.Append(',');
                            rejected.Append("{\"clientIntervalId\":\"").Append(SafeToken(id)).Append("\",\"code\":\"").Append(SafeCode(RejectCode)).Append("\"}");
                        }
                        else accepted++;
                    }
                }
            }
            catch (JsonException)
            {
                accepted = 0;
            }
            return "{\"data\":{\"accepted\":" + accepted + ",\"duplicate\":0,\"updated\":0,\"rejected\":[" + rejected + "],\"lastSuccessfulUploadAt\":\"2026-10-16T08:05:00.0000000Z\",\"enabled\":true,\"paused\":false}}";
        }

        private static string SafeToken(string value)
        {
            var builder = new StringBuilder(value.Length);
            foreach (var character in value)
                if (char.IsAsciiLetterOrDigit(character) || character is '-' or '_') builder.Append(character);
            return builder.ToString();
        }

        private static string SafeCode(string code) => code is "USAGE_PAUSED" or "USAGE_DISABLED" or "USAGE_DURATION" or "USAGE_RETENTION" or "USAGE_INTERVAL_CONFLICT" or "VALIDATION_ERROR"
            ? code
            : "USAGE_DURATION";

        private static HttpResponseMessage Json(HttpStatusCode status, string body) =>
            new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
    }
}
