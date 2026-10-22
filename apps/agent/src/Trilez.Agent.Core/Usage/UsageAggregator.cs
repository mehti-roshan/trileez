using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace Trilez.Agent;

public interface IUsageClock
{
    long Timestamp { get; }
    TimeSpan Elapsed(long startedAt, long endedAt);
    DateTimeOffset UtcNow { get; }
}

public sealed class SystemUsageClock : IUsageClock
{
    public long Timestamp => System.Diagnostics.Stopwatch.GetTimestamp();
    public TimeSpan Elapsed(long startedAt, long endedAt) => System.Diagnostics.Stopwatch.GetElapsedTime(startedAt, endedAt);
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
}

public enum UsageBoundary
{
    None = 0,
    Lock,
    Sleep,
    Logout,
    Shutdown,
    Restart,
}

public readonly record struct UsageObservation(string? ProcessName, string? DisplayName, bool InputIdle, UsageBoundary Boundary);

public sealed class UsageIntervalDraft
{
    public required string ClientSessionId { get; init; }
    public required string ClientIntervalId { get; init; }
    public required string ProcessName { get; init; }
    public string? DisplayName { get; set; }
    public required DateTimeOffset StartedAt { get; init; }
    public long DurationMs { get; set; }
}

public sealed class UsageSessionDraft
{
    public required string ClientSessionId { get; init; }
    public required DateTimeOffset StartedAt { get; init; }
    public DateTimeOffset? EndedAt { get; set; }
    public string? EndReason { get; set; }
    public bool Open { get; set; }
    public bool Uploaded { get; set; }
}

/// <summary>
/// Credits foreground time from monotonic samples. A poll credits the previous application only when
/// the new sample is still active, so idle, lock, and sleep gaps are not attributed. One open segment
/// means a switch cannot be counted twice.
/// </summary>
public sealed class UsageAggregator
{
    public const int BucketSeconds = 300;
    public const long MaxDurationMs = 302_000;
    private readonly IUsageClock _clock;
    private readonly TimeSpan _bucket;
    private readonly TimeSpan _creditLimit;
    private readonly List<UsageIntervalDraft> _intervals = [];
    private long? _lastStamp;
    private DateTimeOffset? _lastWall;
    private UsageObservation? _previous;

    public UsageAggregator(IUsageClock clock, TimeSpan sampleInterval, TimeSpan? bucketLength = null)
    {
        _clock = clock ?? throw new ArgumentNullException(nameof(clock));
        if (sampleInterval <= TimeSpan.Zero) throw new ArgumentOutOfRangeException(nameof(sampleInterval));
        _bucket = bucketLength ?? TimeSpan.FromSeconds(BucketSeconds);
        _creditLimit = sampleInterval + TimeSpan.FromMilliseconds(250);
    }

    public UsageSessionDraft? Session { get; private set; }
    public DateTimeOffset? LastSampleAt => _lastWall;
    public IReadOnlyList<UsageIntervalDraft> Intervals => _intervals;

    public UsageSessionDraft StartSession()
    {
        if (Session is { Open: true }) return Session;
        var now = _clock.UtcNow;
        Session = new UsageSessionDraft
        {
            ClientSessionId = Guid.NewGuid().ToString("D"),
            StartedAt = now,
            Open = true,
        };
        _lastStamp = _clock.Timestamp;
        _lastWall = now;
        _previous = null;
        return Session;
    }

    public void EndSession(string reason)
    {
        if (Session is not { Open: true }) return;
        Session.Open = false;
        Session.EndReason = reason;
        Session.EndedAt = _lastWall ?? _clock.UtcNow;
        Session.Uploaded = false;
        _previous = null;
    }

    public void Forget(IReadOnlyCollection<string> intervalIds)
    {
        if (intervalIds.Count == 0) return;
        _intervals.RemoveAll(interval => intervalIds.Contains(interval.ClientIntervalId));
    }

    public void Observe(UsageObservation observation)
    {
        var nowStamp = _clock.Timestamp;
        var nowWall = _clock.UtcNow;
        if (Session is not { Open: true })
        {
            _lastStamp = nowStamp;
            _lastWall = nowWall;
            _previous = null;
            return;
        }
        if (observation.Boundary != UsageBoundary.None)
        {
            EndSession(Reason(observation.Boundary));
            _lastStamp = nowStamp;
            _lastWall = nowWall;
            return;
        }
        if (_lastStamp is long last)
        {
            var delta = _clock.Elapsed(last, nowStamp);
            if (delta < TimeSpan.Zero) delta = TimeSpan.Zero;
            if (delta > _creditLimit)
            {
                EndSession("sleep");
                _lastStamp = nowStamp;
                _lastWall = nowWall;
                return;
            }
            if (_previous is { InputIdle: false, ProcessName: var process }
                && !observation.InputIdle
                && TryProcess(process, out var safe)
                && delta > TimeSpan.Zero)
            {
                Credit(safe, Display(_previous.Value.DisplayName), _lastWall ?? nowWall, delta);
            }
        }
        _lastStamp = nowStamp;
        _lastWall = nowWall;
        _previous = observation.InputIdle ? observation with { ProcessName = null, DisplayName = null } : observation;
    }

    private void Credit(string process, string? display, DateTimeOffset from, TimeSpan amount)
    {
        if (Session is not { Open: true }) return;
        var remaining = (long)amount.TotalMilliseconds;
        var cursor = from.ToUniversalTime();
        while (remaining > 0)
        {
            var bucket = Floor(cursor);
            var room = (long)(bucket.Add(_bucket) - cursor).TotalMilliseconds;
            if (room <= 0)
            {
                cursor = bucket.Add(_bucket);
                continue;
            }
            var slice = Math.Min(remaining, room);
            Add(process, display, bucket, slice);
            cursor = cursor.AddMilliseconds(slice);
            remaining -= slice;
        }
    }

    private void Add(string process, string? display, DateTimeOffset bucket, long durationMs)
    {
        if (Session is null || durationMs <= 0) return;
        var id = IntervalId(Session.ClientSessionId, bucket, process);
        var existing = _intervals.FirstOrDefault(interval => interval.ClientIntervalId == id);
        var capped = Math.Min(durationMs, MaxDurationMs);
        if (existing is null)
        {
            _intervals.Add(new UsageIntervalDraft
            {
                ClientSessionId = Session.ClientSessionId,
                ClientIntervalId = id,
                ProcessName = process,
                DisplayName = display,
                StartedAt = bucket,
                DurationMs = capped,
            });
            return;
        }
        existing.DurationMs = Math.Min(MaxDurationMs, existing.DurationMs + capped);
        if (existing.DisplayName is null && display is not null) existing.DisplayName = display;
    }

    private DateTimeOffset Floor(DateTimeOffset value)
    {
        var seconds = value.ToUnixTimeSeconds();
        var size = (long)_bucket.TotalSeconds;
        var floored = seconds - (seconds % size + size) % size;
        return DateTimeOffset.FromUnixTimeSeconds(floored);
    }

    private static string IntervalId(string sessionId, DateTimeOffset bucket, string process)
    {
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(process))).ToLowerInvariant()[..12];
        var stamp = bucket.ToUniversalTime().ToString("yyyyMMddHHmmss", CultureInfo.InvariantCulture);
        return "u" + sessionId.Replace("-", "", StringComparison.Ordinal) + stamp + hash;
    }

    public static bool TryProcess(string? value, out string name)
    {
        name = "";
        if (string.IsNullOrWhiteSpace(value)) return false;
        var trimmed = value.Trim();
        if (trimmed.Length is < 1 or > 64) return false;
        if (!IsToken(trimmed[0])) return false;
        foreach (var character in trimmed)
        {
            if (character is (>= 'A' and <= 'Z') or (>= 'a' and <= 'z') or (>= '0' and <= '9') or ' ' or '.' or '_' or '+' or '(' or ')' or '-')
                continue;
            return false;
        }
        name = trimmed;
        return true;
    }

    private static bool IsToken(char character) => character is (>= 'A' and <= 'Z') or (>= 'a' and <= 'z') or (>= '0' and <= '9');

    public static string? Display(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var builder = new StringBuilder(value.Length);
        foreach (var character in value.Trim())
        {
            if (character is '\\' or '/' or '\r' or '\n' or '\0') continue;
            if (character < ' ') continue;
            builder.Append(character);
        }
        var text = builder.ToString().Trim();
        if (text.Length == 0) return null;
        return text.Length <= 80 ? text : text[..80];
    }

    private static string Reason(UsageBoundary boundary) => boundary switch
    {
        UsageBoundary.Lock => "lock",
        UsageBoundary.Sleep => "sleep",
        UsageBoundary.Logout => "logout",
        UsageBoundary.Shutdown => "shutdown",
        UsageBoundary.Restart => "restart",
        _ => "stop",
    };
}
