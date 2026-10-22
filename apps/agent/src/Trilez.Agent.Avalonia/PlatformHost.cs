using System.Runtime.InteropServices;
using Trilez.Agent.Presentation;

namespace Trilez.Agent.AvaloniaApp;

internal sealed class PlatformHost : IDisposable
{
    public required TrilezEmployeeWorkspace Workspace { get; init; }
    public InstanceLock? Instance { get; init; }
    public DiagnosticLog? Log { get; init; }
    public IDisposable? UsageSignals { get; init; }

    public static PlatformHost? TryCreate()
    {
        var settingsPath = JsonAgentSettingsStore.DefaultPath();
        var dataRoot = Path.GetDirectoryName(settingsPath)!;
        var instance = InstanceLock.TryAcquire(Path.Combine(dataRoot, "agent.lock"));
        if (instance is null) return null;

        var log = new DiagnosticLog(Path.Combine(dataRoot, "logs", "agent.log"));
        IStartupRegistration startup;
        IDeviceSecretProtector protector;
        IHealthProbe health;
        IForegroundProbe? foreground = null;
        IUsageSignals? usageSignals = null;
        IScreenCapturer? screen = null;
        IDisposable? usageDisposable = null;

        if (OperatingSystem.IsWindows())
        {
#if WINDOWS_AGENT
            startup = new Trilez.Agent.Desktop.WindowsUserStartupRegistration();
            protector = new Trilez.Agent.Desktop.DpapiDeviceSecretProtector();
            health = new Trilez.Agent.Desktop.WindowsHealthProbe();
            foreground = new Trilez.Agent.Desktop.WindowsForegroundProbe();
            var signals = new Trilez.Agent.Desktop.WindowsUsageSignals();
            usageSignals = signals;
            usageDisposable = signals;
            screen = new Trilez.Agent.Desktop.WindowsScreenCapturer();
#else
            throw new PlatformNotSupportedException("This Linux build does not contain Windows capture or DPAPI code.");
#endif
        }
        else
        {
            startup = new XdgAutostartRegistration();
            protector = new AesFileSecretProtector(AesFileSecretProtector.DefaultKeyPath());
            health = new LinuxHealthProbe();
        }

        FirstRunFlags.Apply(settingsPath, Path.Combine(AppContext.BaseDirectory, "install-flags.json"), startup);

        var workspace = new TrilezEmployeeWorkspace(
            new JsonAgentSettingsStore(settingsPath),
            devices: new ProtectedFileDeviceCredentialStore(ProtectedFileDeviceCredentialStore.DefaultPath(), protector),
            heartbeat: new PeriodicHeartbeatTicker(),
            foreground: foreground,
            usageSignals: usageSignals,
            usageTicker: foreground is null ? null : new PeriodicHeartbeatTicker(),
            usageQueue: foreground is null ? null : new FileUsageQueueStore(FileUsageQueueStore.DefaultPath()),
            healthProbe: health,
            healthTicker: new PeriodicHeartbeatTicker(),
            healthQueue: new FileHealthQueueStore(FileHealthQueueStore.DefaultPath()),
            screenCapturer: screen,
            screenPollTicker: screen is null ? null : new PeriodicHeartbeatTicker(),
            screenFrameTicker: screen is null ? null : new PeriodicHeartbeatTicker(),
            diagnosticLog: log,
            startup: startup);

        return new PlatformHost
        {
            Workspace = workspace,
            Instance = instance,
            Log = log,
            UsageSignals = usageDisposable,
        };
    }

    public void Dispose()
    {
        try
        {
            Workspace.StopScreenCapture();
            Task.Run(() => Workspace.SignOutAsync()).Wait(TimeSpan.FromSeconds(8));
        }
        catch (Exception)
        {
        }
        try { Log?.Write("shutdown", "version=" + AgentInfo.Version + " os=" + RuntimeInformation.OSDescription); }
        catch (Exception) { }
        UsageSignals?.Dispose();
        Instance?.Dispose();
    }
}
