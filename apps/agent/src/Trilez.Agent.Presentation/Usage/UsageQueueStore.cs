using System.Text.Json;

namespace Trilez.Agent.Presentation;

public sealed class UsagePolicyCache
{
    public bool Enabled { get; set; }
    public bool EmployeeMayPause { get; set; }
    public int IdleThresholdSeconds { get; set; } = 60;
    public int BucketSeconds { get; set; } = UsageAggregator.BucketSeconds;
    public int RetentionDays { get; set; } = 30;
    public bool Paused { get; set; }
    public DateTimeOffset? FetchedAt { get; set; }
}

public sealed class UsageQueueState
{
    public UsagePolicyCache Policy { get; set; } = new();
    public List<UsageSessionDraft> Sessions { get; set; } = [];
    public List<UsageIntervalDraft> Intervals { get; set; } = [];
    public DateTimeOffset? LastSuccessfulUploadAt { get; set; }
    public DateTimeOffset? LastSampleAt { get; set; }
    public string? DeviceId { get; set; }
    public string Phase { get; set; } = "stopped";
    public string? Message { get; set; }
}

public interface IUsageQueueStore
{
    UsageQueueState Load();
    void Save(UsageQueueState state);
}

public sealed class MemoryUsageQueueStore : IUsageQueueStore
{
    private UsageQueueState _state = new();
    public UsageQueueState Load() => Clone(_state);
    public void Save(UsageQueueState state) => _state = Clone(state);

    private static UsageQueueState Clone(UsageQueueState state) =>
        JsonSerializer.Deserialize<UsageQueueState>(JsonSerializer.Serialize(state, Options), Options) ?? new UsageQueueState();

    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };
}

public sealed class FileUsageQueueStore : IUsageQueueStore
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = false,
    };

    private readonly string _path;

    public FileUsageQueueStore(string path)
    {
        if (string.IsNullOrWhiteSpace(path)) throw new ArgumentException("Usage queue path is required.", nameof(path));
        _path = path;
    }

    public static string DefaultPath()
    {
        var root = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        if (string.IsNullOrWhiteSpace(root))
            root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".trilez");
        return Path.Combine(root, "Trilez", "usage-queue.json");
    }

    public UsageQueueState Load() => QueueFile.Load<UsageQueueState>(_path, Options);

    public void Save(UsageQueueState state)
    {
        var directory = Path.GetDirectoryName(_path);
        if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);
        var temporary = _path + ".tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(state, Options));
        File.Move(temporary, _path, overwrite: true);
    }
}

/// <summary>
/// Loads a queue file. A corrupt file is renamed aside so the next save cannot erase the unread bytes.
/// </summary>
static class QueueFile
{
    public static T Load<T>(string path, JsonSerializerOptions options) where T : class, new()
    {
        try
        {
            if (!File.Exists(path)) return new T();
            var state = JsonSerializer.Deserialize<T>(File.ReadAllText(path), options);
            if (state is not null) return state;
        }
        catch (Exception error) when (error is IOException or JsonException or UnauthorizedAccessException)
        {
        }
        Quarantine(path);
        return new T();
    }

    private static void Quarantine(string path)
    {
        try
        {
            if (!File.Exists(path)) return;
            var destination = path + ".corrupt";
            if (File.Exists(destination))
                destination = path + ".corrupt-" + DateTimeOffset.UtcNow.ToString("yyyyMMddHHmmssfff", System.Globalization.CultureInfo.InvariantCulture);
            File.Move(path, destination);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
        }
    }
}
