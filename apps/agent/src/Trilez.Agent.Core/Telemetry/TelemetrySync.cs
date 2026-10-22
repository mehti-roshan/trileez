using System.Text;
using System.Text.Json;

namespace Trilez.Agent;

public enum QueueAdd
{
    Added,
    Duplicate,
    Rejected,
}

public enum SyncFailure
{
    Transient,
    Terminal,
    Poison,
}

public sealed class TelemetryRecord
{
    public string Id { get; set; } = "";
    public string Payload { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>
/// Bounds, deduplication, and retry policy for device-health telemetry.
/// Payloads that look like secrets are rejected and never kept.
/// </summary>
public static class TelemetrySync
{
    public const int MaxRecords = 200;
    public const int MaxBytes = 512 * 1024;
    public const int MaxBatchRecords = 20;
    public const int MaxBatchBytes = 64 * 1024;
    public static readonly TimeSpan MaxAge = TimeSpan.FromDays(7);
    public static readonly TimeSpan MinDelay = TimeSpan.FromSeconds(5);
    public static readonly TimeSpan MaxDelay = TimeSpan.FromSeconds(300);

    public static SyncFailure Classify(int status, string? code)
    {
        if (code is "DEVICE_REVOKED" or "DEVICE_CREDENTIAL_REJECTED" or "SESSION_REVOKED" or "DEVICE_DISABLED" or "HEALTH_CAPABILITY")
            return SyncFailure.Terminal;
        if (status == 401) return SyncFailure.Terminal;
        if (status is 0 or 408 or 429 || status >= 500) return SyncFailure.Transient;
        return SyncFailure.Poison;
    }

    public static TimeSpan Delay(int attempt, Func<int, int>? jitter = null)
    {
        if (attempt < 1) attempt = 1;
        var exponent = Math.Min(attempt - 1, 16);
        var baseMs = (int)Math.Min(MaxDelay.TotalMilliseconds, MinDelay.TotalMilliseconds * Math.Pow(2, exponent));
        var room = Math.Min(baseMs / 4, 30_000);
        var extra = 0;
        if (jitter is not null && room > 0) extra = Math.Clamp(jitter(room), 0, room);
        return TimeSpan.FromMilliseconds(baseMs + extra);
    }

    public static bool ContainsSecret(string? value)
    {
        if (string.IsNullOrEmpty(value)) return false;
        if (value.Contains("password", StringComparison.OrdinalIgnoreCase)) return true;
        if (value.Contains("token", StringComparison.OrdinalIgnoreCase)) return true;
        if (value.Contains("Bearer ", StringComparison.OrdinalIgnoreCase)) return true;
        if (value.Contains("eyJ", StringComparison.Ordinal)) return true;
        if (value.Contains("credential", StringComparison.OrdinalIgnoreCase)) return true;
        if (value.Contains("secret", StringComparison.OrdinalIgnoreCase)) return true;
        if (value.Contains("screenshot", StringComparison.OrdinalIgnoreCase)) return true;
        if (value.Contains("clipboard", StringComparison.OrdinalIgnoreCase)) return true;
        if (value.Contains("keystroke", StringComparison.OrdinalIgnoreCase)) return true;
        return false;
    }

    public static int PayloadBytes(IReadOnlyList<TelemetryRecord> records)
    {
        var total = 0;
        foreach (var record in records)
        {
            total += Encoding.UTF8.GetByteCount(record.Payload);
            total += Encoding.UTF8.GetByteCount(record.Id);
        }
        return total;
    }

    public static void Trim(List<TelemetryRecord> records, DateTimeOffset now)
    {
        records.RemoveAll(item => !Keep(item, now));
        while (records.Count > MaxRecords || (records.Count > 0 && PayloadBytes(records) > MaxBytes))
            records.RemoveAt(0);
    }

    public static QueueAdd Enqueue(List<TelemetryRecord> records, TelemetryRecord record, DateTimeOffset now)
    {
        Trim(records, now);
        if (!Keep(record, now)) return QueueAdd.Rejected;
        if (records.Any(item => string.Equals(item.Id, record.Id, StringComparison.Ordinal))) return QueueAdd.Duplicate;
        records.Add(record);
        Trim(records, now);
        return records.Any(item => string.Equals(item.Id, record.Id, StringComparison.Ordinal))
            ? QueueAdd.Added
            : QueueAdd.Rejected;
    }

    public static IReadOnlyList<TelemetryRecord> TakeBatch(IReadOnlyList<TelemetryRecord> records)
    {
        var batch = new List<TelemetryRecord>();
        var bytes = Encoding.UTF8.GetByteCount("{\"samples\":[]}");
        foreach (var record in records)
        {
            if (!IsJsonObject(record.Payload)) continue;
            var size = Encoding.UTF8.GetByteCount(record.Payload) + (batch.Count == 0 ? 0 : 1);
            if (batch.Count >= MaxBatchRecords) break;
            if (bytes + size > MaxBatchBytes) break;
            batch.Add(record);
            bytes += size;
        }
        return batch;
    }

    private static bool Keep(TelemetryRecord record, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(record.Id) || string.IsNullOrWhiteSpace(record.Payload)) return false;
        if (ContainsSecret(record.Id) || ContainsSecret(record.Payload)) return false;
        if (now - record.CreatedAt > MaxAge) return false;
        if (Encoding.UTF8.GetByteCount(record.Payload) > MaxBatchBytes) return false;
        return IsJsonObject(record.Payload);
    }

    private static bool IsJsonObject(string payload)
    {
        try
        {
            using var document = JsonDocument.Parse(payload);
            return document.RootElement.ValueKind == JsonValueKind.Object;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
