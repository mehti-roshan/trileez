using Trilez.Agent.AvaloniaApp;
using Xunit;

namespace Trilez.Agent.Avalonia.Tests;

public sealed class AssemblyReferenceTests
{
    [Fact]
    public void Linux_desktop_assembly_does_not_reference_wpf()
    {
        var names = typeof(MainWindow).Assembly.GetReferencedAssemblies()
            .Select(name => name.Name)
            .Where(name => name is not null)
            .ToHashSet(StringComparer.Ordinal);

        Assert.Contains("Avalonia.Controls", names);
        Assert.Contains("Trilez.Agent.Presentation", names);
        Assert.DoesNotContain("PresentationFramework", names);
        Assert.DoesNotContain("PresentationCore", names);
        Assert.DoesNotContain("WindowsBase", names);
        Assert.DoesNotContain("System.Windows.Forms", names);
        Assert.DoesNotContain("Trilez.Agent.Desktop", names);
    }

    [Fact]
    public void Linux_desktop_assembly_does_not_compile_windows_capture_types()
    {
        var typeNames = typeof(MainWindow).Assembly.GetTypes().Select(type => type.Name).ToHashSet(StringComparer.Ordinal);
        if (OperatingSystem.IsWindows())
        {
            Assert.Contains("WindowsScreenCapturer", typeNames);
            return;
        }

        Assert.DoesNotContain("WindowsScreenCapturer", typeNames);
        Assert.DoesNotContain("WindowsForegroundProbe", typeNames);
        Assert.DoesNotContain("DpapiDeviceSecretProtector", typeNames);
        Assert.Contains("PlatformHost", typeNames);
    }
}
