using System.Text.Json;
using System.Text.Json.Serialization;

namespace Trilez.Agent.Presentation;

public sealed class JsonAgentSettingsStore : IAgentSettingsStore
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly string _path;

    public JsonAgentSettingsStore(string path)
    {
        if (string.IsNullOrWhiteSpace(path)) throw new ArgumentException("Settings path is required.", nameof(path));
        _path = path;
    }

    public static string DefaultPath()
    {
        var root = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        if (string.IsNullOrWhiteSpace(root))
            root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".trilez");
        return Path.Combine(root, "Trilez", "agent-settings.json");
    }

    public AgentSettings Load()
    {
        try
        {
            if (!File.Exists(_path)) return new AgentSettings();
            var settings = JsonSerializer.Deserialize<AgentSettings>(File.ReadAllText(_path), Options);
            return settings ?? new AgentSettings();
        }
        catch (Exception error) when (error is IOException or JsonException or UnauthorizedAccessException)
        {
            return new AgentSettings();
        }
    }

    public void Save(AgentSettings settings)
    {
        var directory = Path.GetDirectoryName(_path);
        if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);
        var json = JsonSerializer.Serialize(settings, Options);
        var temporary = _path + ".tmp";
        File.WriteAllText(temporary, json);
        File.Move(temporary, _path, overwrite: true);
    }

    public Task SaveAsync(AgentSettings settings, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        Save(settings);
        return Task.CompletedTask;
    }
}
