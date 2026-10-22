using System.Windows;
using Trilez.Agent.Presentation;

namespace Trilez.Agent.Desktop;

public partial class App : Application
{
    private TrilezEmployeeWorkspace? _workspace;
    private WindowsUsageSignals? _usageSignals;
    private InstanceLock? _instance;
    private DiagnosticLog? _log;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        DispatcherUnhandledException += (_, args) =>
        {
            LogFailure(args.Exception);
            MessageBox.Show(
                "خطای غیرمنتظره رخ داد. جزئیات حساس نمایش داده نمی‌شود.",
                "تری‌لیز",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
            args.Handled = true;
        };
        AppDomain.CurrentDomain.UnhandledException += (_, args) =>
        {
            if (args.ExceptionObject is Exception error) LogFailure(error);
        };

        var dataRoot = Path.GetDirectoryName(JsonAgentSettingsStore.DefaultPath())!;
        _instance = InstanceLock.TryAcquire(Path.Combine(dataRoot, "agent.lock"));
        if (_instance is null)
        {
            MessageBox.Show(PresentationText.AlreadyRunning, "تری‌لیز", MessageBoxButton.OK, MessageBoxImage.Information);
            Shutdown();
            return;
        }

        _log = new DiagnosticLog(Path.Combine(dataRoot, "logs", "agent.log"));
        var startup = new WindowsUserStartupRegistration();
        FirstRunFlags.Apply(
            JsonAgentSettingsStore.DefaultPath(),
            Path.Combine(AppContext.BaseDirectory, "install-flags.json"),
            startup);

        _usageSignals = new WindowsUsageSignals();
        _workspace = new TrilezEmployeeWorkspace(
            new JsonAgentSettingsStore(JsonAgentSettingsStore.DefaultPath()),
            devices: new ProtectedFileDeviceCredentialStore(ProtectedFileDeviceCredentialStore.DefaultPath(), new DpapiDeviceSecretProtector()),
            heartbeat: new PeriodicHeartbeatTicker(),
            foreground: new WindowsForegroundProbe(),
            usageSignals: _usageSignals,
            usageTicker: new PeriodicHeartbeatTicker(),
            usageQueue: new FileUsageQueueStore(FileUsageQueueStore.DefaultPath()),
            healthProbe: new WindowsHealthProbe(),
            healthTicker: new PeriodicHeartbeatTicker(),
            healthQueue: new FileHealthQueueStore(FileHealthQueueStore.DefaultPath()),
            screenCapturer: new WindowsScreenCapturer(),
            screenPollTicker: new PeriodicHeartbeatTicker(),
            screenFrameTicker: new PeriodicHeartbeatTicker(),
            diagnosticLog: _log,
            startup: startup);
        var window = new MainWindow { DataContext = new ShellViewModel(_workspace) };
        window.Title = "تری‌لیز — میز کار کارمند " + AgentInfo.Version;
        MainWindow = window;
        window.Show();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        var workspace = _workspace;
        if (workspace is not null)
        {
            try
            {
                workspace.StopScreenCapture();
                Task.Run(() => workspace.SignOutAsync()).Wait(TimeSpan.FromSeconds(8));
            }
            catch (Exception)
            {
            }
        }
        try { _log?.Write("shutdown", "version=" + AgentInfo.Version); }
        catch (Exception) { }
        _usageSignals?.Dispose();
        _instance?.Dispose();
        base.OnExit(e);
    }

    private void LogFailure(Exception error) =>
        _log?.Write("startup", error.GetType().Name + " " + error.Message);
}
