namespace Trilez.Agent.Presentation;

/// <summary>
/// Visible per-user startup. Implementations must not register a service, a scheduled task, or a machine-wide run key.
/// </summary>
public interface IStartupRegistration
{
    void Apply(bool enabled);
}

public static class StartupCommand
{
    public static string Quote(string executablePath)
    {
        if (string.IsNullOrWhiteSpace(executablePath))
            throw new ArgumentException("Executable path is required.", nameof(executablePath));
        var trimmed = executablePath.Trim();
        if (trimmed.Contains('"') || trimmed.Contains('\n') || trimmed.Contains('\r'))
            throw new ArgumentException("Executable path cannot be quoted safely.", nameof(executablePath));
        return "\"" + trimmed + "\"";
    }
}
