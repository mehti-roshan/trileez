using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Avalonia.Threading;
using Trilez.Agent.Presentation;

namespace Trilez.Agent.AvaloniaApp;

public partial class App : Application
{
    private PlatformHost? _host;

    public override void Initialize() => AvaloniaXamlLoader.Load(this);

    public override void OnFrameworkInitializationCompleted()
    {
        Dispatcher.UIThread.UnhandledException += (_, args) =>
        {
            _host?.Log?.Write("startup", args.Exception.GetType().Name + " " + args.Exception.Message);
            args.Handled = true;
        };

        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            _host = PlatformHost.TryCreate();
            if (_host is null)
            {
                var notice = new Window
                {
                    Title = AgentInfo.ProductName,
                    Width = 420,
                    Height = 180,
                    FlowDirection = Avalonia.Media.FlowDirection.RightToLeft,
                    Content = new Avalonia.Controls.TextBlock
                    {
                        Text = PresentationText.AlreadyRunning,
                        Margin = new Thickness(24),
                        TextWrapping = Avalonia.Media.TextWrapping.Wrap,
                    },
                };
                desktop.MainWindow = notice;
                notice.Closed += (_, _) => desktop.Shutdown();
                base.OnFrameworkInitializationCompleted();
                return;
            }

            var window = new MainWindow
            {
                DataContext = new ShellViewModel(_host.Workspace),
                Title = "تری‌لیز — میز کار کارمند " + AgentInfo.Version,
            };
            desktop.MainWindow = window;
            desktop.ShutdownRequested += (_, _) =>
            {
                _host.Dispose();
                _host = null;
            };
        }

        base.OnFrameworkInitializationCompleted();
    }
}
