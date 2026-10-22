using Xunit;

namespace Trilez.Agent.Presentation.Tests;

public sealed class LinuxPlatformTests
{
    [Fact]
    public void AesFileSecretProtector_roundtrips_and_rejects_unknown_prefix()
    {
        var dir = Path.Combine(Path.GetTempPath(), "trileez-aes-" + Guid.NewGuid().ToString("n"));
        Directory.CreateDirectory(dir);
        try
        {
            var protector = new AesFileSecretProtector(Path.Combine(dir, "device-protect.key"));
            var protectedSecret = protector.Protect("device-secret-value");
            Assert.StartsWith("aesgcm:", protectedSecret, StringComparison.Ordinal);
            Assert.Equal("device-secret-value", protector.Unprotect(protectedSecret));
            Assert.Throws<InvalidOperationException>(() => protector.Unprotect("protected:AAAA"));
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    [Fact]
    public void LinuxHealthProbe_reads_os_identity_without_fabricating_frames()
    {
        var reading = new LinuxHealthProbe().Read();
        Assert.False(string.IsNullOrWhiteSpace(reading.Architecture));
        Assert.False(string.IsNullOrWhiteSpace(reading.OsName));
        if (OperatingSystem.IsLinux())
        {
            Assert.Equal("Linux", reading.OsName);
            Assert.NotNull(reading.MemoryTotalBytes);
            Assert.True(reading.MemoryTotalBytes > 0);
        }
    }

    [Fact]
    public void XdgAutostartRegistration_writes_and_removes_desktop_file()
    {
        var path = Path.Combine(Path.GetTempPath(), "trileez-auto-" + Guid.NewGuid().ToString("n"), "trileez-agent.desktop");
        var registration = new XdgAutostartRegistration(path);
        registration.Apply(true);
        Assert.True(File.Exists(path));
        var body = File.ReadAllText(path);
        Assert.Contains("[Desktop Entry]", body, StringComparison.Ordinal);
        Assert.Contains("Exec=", body, StringComparison.Ordinal);
        Assert.DoesNotContain("Type=Service", body, StringComparison.Ordinal);
        registration.Apply(false);
        Assert.False(File.Exists(path));
    }

    [Fact]
    public void Startup_checkbox_text_matches_operating_system()
    {
        if (OperatingSystem.IsLinux())
        {
            Assert.Equal(PresentationText.LinuxStartupCheckbox, PresentationText.StartupCheckbox);
            Assert.Equal("شروع همراه رایانه", PresentationText.StartupCheckboxName);
            Assert.Contains("شروع همراه رایانه", PresentationText.StartupLine(false), StringComparison.Ordinal);
        }
        else
        {
            Assert.Equal(PresentationText.WindowsStartupCheckbox, PresentationText.StartupCheckbox);
            Assert.Equal("شروع همراه ویندوز", PresentationText.StartupCheckboxName);
        }
    }

    [Fact]
    public void AesGcm_key_file_is_created()
    {
        var dir = Path.Combine(Path.GetTempPath(), "trileez-key-" + Guid.NewGuid().ToString("n"));
        var keyPath = Path.Combine(dir, "device-protect.key");
        try
        {
            var protector = new AesFileSecretProtector(keyPath);
            _ = protector.Protect("abc");
            Assert.True(File.Exists(keyPath));
            Assert.Equal(32, File.ReadAllBytes(keyPath).Length);
        }
        finally
        {
            if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true);
        }
    }
}
