using System.Text.Json;

namespace Trilez.Agent.Presentation;

/// <summary>
/// Applies a one-shot install flag only when the employee does not already have settings.
/// An upgrade must not turn startup back on after the employee turned it off.
/// </summary>
public static class FirstRunFlags
{
    public static bool Apply(string settingsPath, string flagsPath, IStartupRegistration? startup)
    {
        if (string.IsNullOrWhiteSpace(flagsPath) || !File.Exists(flagsPath)) return false;
        try
        {
            if (File.Exists(settingsPath)) return false;
            using var document = JsonDocument.Parse(File.ReadAllText(flagsPath));
            if (document.RootElement.ValueKind != JsonValueKind.Object) return false;
            if (!document.RootElement.TryGetProperty("startWithWindows", out var value) || value.ValueKind != JsonValueKind.True)
                return false;
            new JsonAgentSettingsStore(settingsPath).Save(new AgentSettings { StartWithWindows = true });
            startup?.Apply(true);
            return true;
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException or InvalidOperationException or ArgumentException)
        {
            return false;
        }
        finally
        {
            try
            {
                if (File.Exists(flagsPath)) File.Delete(flagsPath);
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException)
            {
            }
        }
    }
}
