namespace Trilez.Agent.Presentation;

/// <summary>
/// Visible per-user XDG autostart entry. This is not a systemd service or a machine-wide unit.
/// </summary>
public sealed class XdgAutostartRegistration : IStartupRegistration
{
    public const string DesktopFileName = "trileez-agent.desktop";
    private readonly string _desktopPath;

    public XdgAutostartRegistration(string? desktopPath = null)
    {
        if (!string.IsNullOrWhiteSpace(desktopPath))
        {
            _desktopPath = desktopPath;
            return;
        }

        var config = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        if (string.IsNullOrWhiteSpace(config))
            config = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".config");
        _desktopPath = Path.Combine(config, "autostart", DesktopFileName);
    }

    public void Apply(bool enabled)
    {
        if (!enabled)
        {
            if (File.Exists(_desktopPath)) File.Delete(_desktopPath);
            return;
        }

        var executable = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(executable))
            throw new InvalidOperationException("The application path is not available.");
        var directory = Path.GetDirectoryName(_desktopPath);
        if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);
        var exec = StartupCommand.Quote(executable);
        var body =
            "[Desktop Entry]\n" +
            "Type=Application\n" +
            "Version=1.0\n" +
            "Name=Trilez Agent\n" +
            "Comment=Trilez employee desktop\n" +
            "Exec=" + exec + "\n" +
            "Terminal=false\n" +
            "X-GNOME-Autostart-enabled=true\n";
        File.WriteAllText(_desktopPath, body);
    }
}
