using System.Globalization;
using Avalonia;

namespace Trilez.Agent.AvaloniaApp;

internal static class Program
{
    [STAThread]
    public static void Main(string[] args)
    {
        try
        {
            var culture = CultureInfo.GetCultureInfo("fa-IR");
            CultureInfo.DefaultThreadCurrentCulture = culture;
            CultureInfo.DefaultThreadCurrentUICulture = culture;
        }
        catch (CultureNotFoundException)
        {
        }

        BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);
    }

    public static AppBuilder BuildAvaloniaApp() =>
        AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .WithInterFont()
            .LogToTrace();
}
