using System.Text.Json;
using System.Text.Json.Serialization;

namespace Trilez.Agent.Presentation;

public sealed class HealthReading
{
    public double? CpuPercent { get; init; }
    public long? MemoryUsedBytes { get; init; }
    public long? MemoryTotalBytes { get; init; }
    public long? DiskFreeBytes { get; init; }
    public long? DiskTotalBytes { get; init; }
    public string? OsName { get; init; }
    public string? OsVersion { get; init; }
    public string? Architecture { get; init; }
}

public interface IHealthProbe
{
    HealthReading Read();
}

public sealed class HealthChannel
{
    public required TrilezApiClient Client { get; init; }
    public required string DeviceId { get; init; }
    public required string Credential { get; init; }
    public bool Active { get; init; }
    public string? ConnectionStatus { get; init; }
    public DateTimeOffset? LastSeenAt { get; init; }
    public string CollectorPhase { get; init; } = "stopped";
}

public sealed class HealthQueueState
{
    public string? DeviceId { get; set; }
    public List<TelemetryRecord> Items { get; set; } = [];
    public DateTimeOffset? LastSampledAt { get; set; }
    public DateTimeOffset? LastSuccessfulUploadAt { get; set; }
    public DateTimeOffset? NextAttemptAt { get; set; }
    public int Attempt { get; set; }
    public string SyncPhase { get; set; } = "idle";
    public string CollectorPhase { get; set; } = "stopped";
    public string? Message { get; set; }
    public bool Halted { get; set; }
    public double? CpuPercent { get; set; }
    public long? MemoryUsedBytes { get; set; }
    public long? MemoryTotalBytes { get; set; }
    public long? DiskFreeBytes { get; set; }
    public long? DiskTotalBytes { get; set; }
    public string? OsName { get; set; }
    public string? OsVersion { get; set; }
    public string? Architecture { get; set; }
    public string? AgentVersion { get; set; }
    public bool Online { get; set; }
    public DateTimeOffset? LastHeartbeatAt { get; set; }
    public int SampleIntervalSeconds { get; set; } = 60;
}

public interface IHealthQueueStore
{
    HealthQueueState Load();
    void Save(HealthQueueState state);
}

static class HealthJson
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
}

public sealed class MemoryHealthQueueStore : IHealthQueueStore
{
    private HealthQueueState _state = new();
    public HealthQueueState Load() => Clone(_state);
    public void Save(HealthQueueState state) => _state = Clone(state);

    private static HealthQueueState Clone(HealthQueueState state) =>
        JsonSerializer.Deserialize<HealthQueueState>(JsonSerializer.Serialize(state, HealthJson.Options), HealthJson.Options) ?? new HealthQueueState();
}

public sealed class FileHealthQueueStore : IHealthQueueStore
{
    private readonly string _path;

    public FileHealthQueueStore(string path)
    {
        if (string.IsNullOrWhiteSpace(path)) throw new ArgumentException("Health queue path is required.", nameof(path));
        _path = path;
    }

    public static string DefaultPath()
    {
        var root = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        if (string.IsNullOrWhiteSpace(root))
            root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".trilez");
        return Path.Combine(root, "Trilez", "health-queue.json");
    }

    public HealthQueueState Load() => QueueFile.Load<HealthQueueState>(_path, HealthJson.Options);

    public void Save(HealthQueueState state)
    {
        var directory = Path.GetDirectoryName(_path);
        if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);
        var temporary = _path + ".tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(state, HealthJson.Options));
        File.Move(temporary, _path, overwrite: true);
    }
}
