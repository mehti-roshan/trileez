using Microsoft.Win32;
using Trilez.Agent.Presentation;

namespace Trilez.Agent.Desktop;

/// <summary>
/// Visible per-user startup entry under HKCU Run. Task Manager shows it. This is not a service, a scheduled task, or a machine-wide key.
/// </summary>
public sealed class WindowsUserStartupRegistration : IStartupRegistration
{
    public void Apply(bool enabled)
    {
        using var key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", writable: true)
            ?? throw new InvalidOperationException("The current-user startup key is not available.");
        if (!enabled)
        {
            key.DeleteValue(AgentInfo.StartupValueName, throwOnMissingValue: false);
            return;
        }

        var executable = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(executable))
            throw new InvalidOperationException("The application path is not available.");
        key.SetValue(AgentInfo.StartupValueName, StartupCommand.Quote(executable), RegistryValueKind.String);
    }
}
