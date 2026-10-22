using System.Text;
using System.Text.Json;

namespace Trilez.Agent.Presentation;

/// <summary>
/// Samples device health on a background ticker and uploads it through a bounded local queue.
/// Sign-out and revocation stop uploads. Queued samples stay on disk until a later active session of the same device.
/// </summary>
public sealed class HealthReporter
{
    private readonly IHealthProbe _probe;
    private readonly IUsageClock _clock;
    private readonly IHeartbeatTicker _ticker;
    private readonly IHealthQueueStore _store;
    private readonly Func<HealthChannel?> _channel;
    private readonly Action<TrilezApiException>? _onAuthorization;
    private readonly Func<int, int> _jitter;
    private readonly TimeSpan _sampleInterval;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly object _startLock = new();
    private int _stopRequested;
    private string _stopPhase = "stopped";
    private bool _started;

    public HealthReporter(
        IHealthProbe probe,
        IUsageClock clock,
        IHeartbeatTicker ticker,
        IHealthQueueStore store,
        Func<HealthChannel?> channel,
        TimeSpan? sampleInterval = null,
        Func<int, int>? jitter = null,
        Action<TrilezApiException>? onAuthorization = null)
    {
        _probe = probe ?? throw new ArgumentNullException(nameof(probe));
        _clock = clock ?? throw new ArgumentNullException(nameof(clock));
        _ticker = ticker ?? throw new ArgumentNullException(nameof(ticker));
        _store = store ?? throw new ArgumentNullException(nameof(store));
        _channel = channel ?? throw new ArgumentNullException(nameof(channel));
        _onAuthorization = onAuthorization;
        _jitter = jitter ?? (span => span <= 0 ? 0 : Random.Shared.Next(0, span + 1));
        _sampleInterval = ClampInterval(sampleInterval);
        Snapshot = HealthSnapshot.Stopped();
    }

    public HealthSnapshot Snapshot { get; private set; }
    public TimeSpan SampleInterval => _sampleInterval;
    public event EventHandler? Changed;

    public static TimeSpan ClampInterval(TimeSpan? value)
    {
        var interval = value ?? TimeSpan.FromSeconds(60);
        if (interval < TimeSpan.FromSeconds(30)) return TimeSpan.FromSeconds(30);
        if (interval > TimeSpan.FromSeconds(900)) return TimeSpan.FromSeconds(900);
        return interval;
    }

    public void Start()
    {
        var state = _store.Load();
        var channel = _channel();
        if (channel is not null && !string.IsNullOrWhiteSpace(state.DeviceId) && !string.Equals(state.DeviceId, channel.DeviceId, StringComparison.Ordinal))
        {
            state.Items.Clear();
            state.Halted = false;
            state.Attempt = 0;
            state.NextAttemptAt = null;
            state.Message = null;
            state.SyncPhase = "idle";
        }
        TelemetrySync.Trim(state.Items, _clock.UtcNow);
        if (state.Halted)
        {
            Publish(state, "revoked", state.Message);
            _store.Save(state);
            return;
        }
        if (channel is not { Active: true })
        {
            Publish(state, "stopped", state.Message);
            _store.Save(state);
            return;
        }
        lock (_startLock)
        {
            if (_started)
            {
                _store.Save(state);
                return;
            }
            _started = true;
            Volatile.Write(ref _stopRequested, 0);
            _stopPhase = "stopped";
        }
        state.DeviceId = channel.DeviceId;
        state.SampleIntervalSeconds = (int)_sampleInterval.TotalSeconds;
        _store.Save(state);
        _ticker.Start(_sampleInterval, TickAsync);
    }

    public void Stop(string phase)
    {
        _stopPhase = phase == "revoked" ? "revoked" : "stopped";
        Volatile.Write(ref _stopRequested, 1);
        lock (_startLock) { _started = false; }
        _ticker.Stop();
        if (!_gate.Wait(0)) return;
        try
        {
            var state = _store.Load();
            if (_stopPhase == "revoked") state.Halted = true;
            Publish(state, _stopPhase, state.Message);
            _store.Save(state);
        }
        finally { _gate.Release(); }
    }

    private async Task TickAsync(CancellationToken cancellationToken)
    {
        if (!await _gate.WaitAsync(0, cancellationToken)) return;
        try
        {
            var state = _store.Load();
            if (Volatile.Read(ref _stopRequested) == 1)
            {
                ApplyStop(state);
                return;
            }
            await TickCoreAsync(state, cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (Exception)
        {
            var state = _store.Load();
            Publish(state, "offline", PresentationText.GenericFailure);
            _store.Save(state);
        }
        finally { _gate.Release(); }
    }

    private async Task TickCoreAsync(HealthQueueState state, CancellationToken cancellationToken)
    {
        var now = _clock.UtcNow;
        TelemetrySync.Trim(state.Items, now);
        if (state.Halted)
        {
            Publish(state, "revoked", state.Message);
            _store.Save(state);
            Halt();
            return;
        }
        var channel = _channel();
        if (channel is not { Active: true })
        {
            Publish(state, "stopped", state.Message);
            _store.Save(state);
            Halt();
            return;
        }
        if (!string.IsNullOrWhiteSpace(state.DeviceId) && !string.Equals(state.DeviceId, channel.DeviceId, StringComparison.Ordinal))
        {
            state.Items.Clear();
            state.Halted = false;
            state.Attempt = 0;
            state.NextAttemptAt = null;
            state.Message = null;
        }
        state.DeviceId = channel.DeviceId;
        state.CollectorPhase = Collector(channel.CollectorPhase);
        state.Online = string.Equals(channel.ConnectionStatus, "online", StringComparison.Ordinal);
        if (channel.LastSeenAt is DateTimeOffset seen) state.LastHeartbeatAt = seen;

        var due = state.LastSampledAt is null || now - state.LastSampledAt.Value >= _sampleInterval;
        if (due) Sample(state, channel, now);
        if (Volatile.Read(ref _stopRequested) == 1)
        {
            ApplyStop(state);
            return;
        }
        if (state.Items.Count == 0)
        {
            state.Attempt = 0;
            state.NextAttemptAt = null;
            Publish(state, "idle", null);
            _store.Save(state);
            return;
        }
        if (state.NextAttemptAt is DateTimeOffset next && now < next)
        {
            Publish(state, "retrying", state.Message);
            _store.Save(state);
            return;
        }

        var batch = TelemetrySync.TakeBatch(state.Items);
        if (batch.Count == 0)
        {
            Publish(state, "pending", state.Message);
            _store.Save(state);
            return;
        }
        if (Volatile.Read(ref _stopRequested) == 1)
        {
            ApplyStop(state);
            return;
        }
        try
        {
            var result = await channel.Client.UploadHealthBatchAsync(channel.DeviceId, channel.Credential, batch.Select(item => item.Payload).ToList(), cancellationToken);
            if (Volatile.Read(ref _stopRequested) == 1)
            {
                ApplyStop(state);
                return;
            }
            RemoveSettled(state, batch, result);
            state.Attempt = 0;
            state.NextAttemptAt = null;
            if (result.LastSuccessfulUploadAt is DateTimeOffset uploaded) state.LastSuccessfulUploadAt = uploaded;
            Publish(state, state.Items.Count == 0 ? "idle" : "pending", null);
            _store.Save(state);
        }
        catch (TrilezApiException error)
        {
            var kind = TelemetrySync.Classify(error.Status, error.Code);
            var safe = TrilezApiException.Sanitize(error.Message);
            if (kind == SyncFailure.Transient)
            {
                state.Attempt += 1;
                state.NextAttemptAt = now.Add(TelemetrySync.Delay(state.Attempt, _jitter));
                Publish(state, error.Status == 0 ? "offline" : "retrying", safe);
                _store.Save(state);
                return;
            }
            if (kind == SyncFailure.Poison)
            {
                var sent = batch.Select(item => item.Id).ToHashSet(StringComparer.Ordinal);
                state.Items.RemoveAll(item => sent.Contains(item.Id));
                Publish(state, state.Items.Count == 0 ? "idle" : "pending", safe);
                _store.Save(state);
                return;
            }
            state.Halted = error.Code == "DEVICE_REVOKED";
            Publish(state, state.Halted ? "revoked" : "stopped", safe);
            _store.Save(state);
            Halt();
            _onAuthorization?.Invoke(error);
        }
    }

    private void Sample(HealthQueueState state, HealthChannel channel, DateTimeOffset now)
    {
        HealthReading reading;
        try { reading = _probe.Read(); }
        catch (Exception) { reading = new HealthReading(); }
        var cpu = Percent(reading.CpuPercent);
        var memoryUsed = Bytes(reading.MemoryUsedBytes);
        var memoryTotal = Bytes(reading.MemoryTotalBytes);
        var diskFree = Bytes(reading.DiskFreeBytes);
        var diskTotal = Bytes(reading.DiskTotalBytes);
        if (memoryUsed is long used && memoryTotal is long total && used > total) memoryUsed = null;
        if (diskFree is long free && diskTotal is long disk && free > disk) diskFree = null;
        var sample = new HealthSample
        {
            ClientSampleId = "h" + Guid.NewGuid().ToString("N"),
            SampledAt = now,
            CpuPercent = cpu,
            MemoryUsedBytes = memoryUsed,
            MemoryTotalBytes = memoryTotal,
            DiskFreeBytes = diskFree,
            DiskTotalBytes = diskTotal,
            OsName = Clean(reading.OsName, 80),
            OsVersion = Clean(reading.OsVersion, 40),
            Architecture = CleanArchitecture(reading.Architecture),
            AgentVersion = AgentVersion(),
            Online = state.Online,
            LastHeartbeatAt = state.LastHeartbeatAt,
            CollectorPhase = state.CollectorPhase,
            SyncPhase = state.SyncPhase is "offline" or "retrying" ? state.SyncPhase : "pending",
            QueueDepth = Math.Min(state.Items.Count + 1, TelemetrySync.MaxRecords),
            PendingBytes = Math.Min(TelemetrySync.PayloadBytes(state.Items), 1_000_000_000_000),
        };
        var payload = JsonSerializer.Serialize(sample, HealthJson.Options);
        sample.PendingBytes = Math.Min(sample.PendingBytes + Encoding.UTF8.GetByteCount(payload), 1_000_000_000_000);
        payload = JsonSerializer.Serialize(sample, HealthJson.Options);
        if (TelemetrySync.ContainsSecret(payload) || payload.Contains(channel.Credential, StringComparison.Ordinal)) return;
        var added = TelemetrySync.Enqueue(state.Items, new TelemetryRecord
        {
            Id = sample.ClientSampleId,
            Payload = payload,
            CreatedAt = now,
        }, now);
        if (added != QueueAdd.Added) return;
        state.LastSampledAt = now;
        state.CpuPercent = cpu;
        state.MemoryUsedBytes = memoryUsed;
        state.MemoryTotalBytes = memoryTotal;
        state.DiskFreeBytes = diskFree;
        state.DiskTotalBytes = diskTotal;
        state.OsName = sample.OsName;
        state.OsVersion = sample.OsVersion;
        state.Architecture = sample.Architecture;
        state.AgentVersion = sample.AgentVersion;
    }

    private void ApplyStop(HealthQueueState state)
    {
        if (_stopPhase == "revoked") state.Halted = true;
        Publish(state, _stopPhase, state.Message);
        _store.Save(state);
        Halt();
    }

    private void Halt()
    {
        lock (_startLock) { _started = false; }
        _ticker.Stop();
    }

    private static void RemoveSettled(HealthQueueState state, IReadOnlyList<TelemetryRecord> batch, HealthBatchResult result)
    {
        var remove = new HashSet<string>(StringComparer.Ordinal);
        if (result.AcceptedIds is not null)
            foreach (var id in result.AcceptedIds)
                if (!string.IsNullOrWhiteSpace(id)) remove.Add(id);
        if (result.DuplicateIds is not null)
            foreach (var id in result.DuplicateIds)
                if (!string.IsNullOrWhiteSpace(id)) remove.Add(id);
        if (result.Rejected is not null)
            foreach (var row in result.Rejected)
                if (!string.IsNullOrWhiteSpace(row.ClientSampleId)) remove.Add(row.ClientSampleId);
        if (remove.Count == 0 && result.Rejected is not { Count: > 0 } && result.Accepted + result.Duplicate >= batch.Count)
            foreach (var item in batch) remove.Add(item.Id);
        state.Items.RemoveAll(item => remove.Contains(item.Id));
    }

    private void Publish(HealthQueueState state, string phase, string? message)
    {
        state.SyncPhase = phase;
        state.Message = TrilezApiException.Sanitize(message);
        Snapshot = new HealthSnapshot
        {
            SyncPhase = phase,
            CollectorPhase = string.IsNullOrWhiteSpace(state.CollectorPhase) ? "stopped" : state.CollectorPhase,
            AgentVersion = state.AgentVersion,
            OsName = state.OsName,
            OsVersion = state.OsVersion,
            Architecture = state.Architecture,
            CpuPercent = state.CpuPercent,
            MemoryUsedBytes = state.MemoryUsedBytes,
            MemoryTotalBytes = state.MemoryTotalBytes,
            DiskFreeBytes = state.DiskFreeBytes,
            DiskTotalBytes = state.DiskTotalBytes,
            Online = state.Online,
            LastHeartbeatAt = state.LastHeartbeatAt,
            LastSampleAt = state.LastSampledAt,
            LastSuccessfulUploadAt = state.LastSuccessfulUploadAt,
            NextRetryAt = state.NextAttemptAt,
            PendingCount = state.Items.Count,
            PendingBytes = TelemetrySync.PayloadBytes(state.Items),
            SampleIntervalSeconds = (int)_sampleInterval.TotalSeconds,
            Message = state.Message,
        };
        Changed?.Invoke(this, EventArgs.Empty);
    }

    private static string Collector(string? phase) =>
        phase is "running" or "offline" or "paused" or "disabled" or "stopped" ? phase : "stopped";

    private static string AgentVersion()
    {
        var text = Clean(AgentInfo.Version, 32) ?? "0.2.0";
        foreach (var ch in text)
        {
            if (!(char.IsAsciiLetterOrDigit(ch) || ch is '.' or '_' or '+' or '-')) return "0.2.0";
        }
        return text;
    }

    private static double? Percent(double? value)
    {
        if (value is not double number || !double.IsFinite(number)) return null;
        var rounded = Math.Round(number, 2, MidpointRounding.AwayFromZero);
        if (rounded < 0 || rounded > 100) return null;
        return rounded;
    }

    private static long? Bytes(long? value)
    {
        if (value is not long number || number < 0 || number > 1_000_000_000_000_000) return null;
        return number;
    }

    private static string? Clean(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var builder = new StringBuilder(Math.Min(value.Length, max));
        foreach (var ch in value.Trim())
        {
            if (ch < ' ' || ch == '\\' || ch == '/') continue;
            builder.Append(ch);
            if (builder.Length == max) break;
        }
        var text = builder.ToString().Trim();
        return text.Length == 0 ? null : text;
    }

    private static string? CleanArchitecture(string? value)
    {
        var text = Clean(value, 16);
        if (text is null) return null;
        foreach (var ch in text)
        {
            if (!(char.IsAsciiLetterOrDigit(ch) || ch is '_' or '-')) return null;
        }
        return text;
    }
}
