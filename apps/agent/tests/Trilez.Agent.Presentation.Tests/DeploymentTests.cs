using System.Security.Cryptography;
using System.Text;
using Trilez.Agent.Presentation;
using Xunit;

namespace Trilez.Agent.Presentation.Tests;

public sealed class DeploymentTests
{
    [Fact]
    public void VersionCompareTreatsEachNumericPartSeparately()
    {
        Assert.True(PackageIntegrity.IsNewer("0.2.1", "0.2.0"));
        Assert.True(PackageIntegrity.IsNewer("0.10.0", "0.9.0"));
        Assert.False(PackageIntegrity.IsNewer("0.2.0", "0.2.0"));
        Assert.False(PackageIntegrity.IsNewer("0.1.9", "0.2.0"));
        Assert.True(PackageIntegrity.SameVersion("0.2.0", "0.2.0"));
        Assert.Equal(14393, AgentInfo.MinimumWindowsBuild);
        Assert.Equal("0.2.0", AgentInfo.Version);
        Assert.Throws<InvalidDataException>(() => PackageIntegrity.ParseVersion("1.2"));
        Assert.Throws<InvalidDataException>(() => PackageIntegrity.ParseVersion("1.2.3.4"));
        Assert.Throws<InvalidDataException>(() => PackageIntegrity.ParseVersion("1.2.10000"));
    }

    [Fact]
    public void OwnedRootsRejectDriveRootsAndShortPaths()
    {
        var root = Path.GetPathRoot(Path.GetFullPath(Path.Combine(Path.GetTempPath(), "file")))!;
        Assert.Throws<InvalidOperationException>(() => DeploymentLayout.EnsureOwnedRoot(root));
        Assert.Throws<InvalidOperationException>(() => DeploymentLayout.EnsureOwnedRoot(Path.Combine(root, "trilez-too-short")));
    }

    [Fact]
    public void QuoteWrapsTheExecutableAndRejectsBreakouts()
    {
        Assert.Equal("\"C:\\Users\\employee\\Trilez Agent\\current\\Trilez.Agent.Desktop.exe\"", StartupCommand.Quote("  C:\\Users\\employee\\Trilez Agent\\current\\Trilez.Agent.Desktop.exe  "));
        Assert.Throws<ArgumentException>(() => StartupCommand.Quote("C:\\app\\\"run.exe"));
        Assert.Throws<ArgumentException>(() => StartupCommand.Quote("C:\\app\r\n.exe"));
    }

    [Fact]
    public void StartupEditPreservesTheOtherSettings()
    {
        var original = """
            {
              "apiBaseUrl": "http://127.0.0.1:4000",
              "lastSuccessfulSyncUtc": "2026-10-16T00:00:00+00:00",
              "startWithWindows": false
            }
            """;
        var updated = StartupPreferenceFile.Enable(original);
        Assert.Contains("\"apiBaseUrl\": \"http://127.0.0.1:4000\"", updated);
        Assert.Contains("\"lastSuccessfulSyncUtc\": \"2026-10-16T00:00:00+00:00\"", updated);
        Assert.Contains("\"startWithWindows\": true", updated);
        Assert.DoesNotContain("false", updated);

        var inserted = StartupPreferenceFile.Enable("""{"apiBaseUrl":"http://127.0.0.1:4000"}""");
        Assert.Contains("\"apiBaseUrl\":\"http://127.0.0.1:4000\"", inserted);
        Assert.Contains("\"startWithWindows\": true", inserted);
    }

    [Fact]
    public void FirstRunFlagsDoNotOverwriteExistingSettings()
    {
        using var dir = new Temp();
        var settings = Path.Combine(dir.Path, "agent-settings.json");
        var flags = Path.Combine(dir.Path, "install-flags.json");
        File.WriteAllText(settings, """{"apiBaseUrl":"http://127.0.0.1:4000","startWithWindows":false}""");
        File.WriteAllText(flags, """{"startWithWindows":true}""");
        var calls = new List<bool>();

        Assert.False(FirstRunFlags.Apply(settings, flags, new Recording(calls)));

        Assert.Empty(calls);
        Assert.False(File.Exists(flags));
        Assert.Contains("false", File.ReadAllText(settings));
        Assert.Contains("http://127.0.0.1:4000", File.ReadAllText(settings));
    }

    [Fact]
    public void FirstRunFlagsCreateSettingsOnlyWhenNoneExist()
    {
        using var dir = new Temp();
        var settings = Path.Combine(dir.Path, "nested", "agent-settings.json");
        var flags = Path.Combine(dir.Path, "install-flags.json");
        File.WriteAllText(flags, """{"startWithWindows":true}""");
        var calls = new List<bool>();

        Assert.True(FirstRunFlags.Apply(settings, flags, new Recording(calls)));

        Assert.Equal(new[] { true }, calls);
        Assert.False(File.Exists(flags));
        Assert.True(new JsonAgentSettingsStore(settings).Load().StartWithWindows);
    }

    [Fact]
    public async Task SaveAppliesStartupOnlyAfterTheSettingsAreAccepted()
    {
        using var dir = new Temp();
        var path = Path.Combine(dir.Path, "agent-settings.json");
        var calls = new List<bool>();
        var workspace = new TrilezEmployeeWorkspace(new JsonAgentSettingsStore(path), startup: new Recording(calls));

        await Assert.ThrowsAsync<ArgumentException>(() => workspace.SaveSettingsAsync(new AgentSettings
        {
            ApiBaseUrl = "http://user:SecretToken@127.0.0.1:4000",
            StartWithWindows = true,
        }));
        Assert.Empty(calls);
        Assert.False(File.Exists(path));

        await workspace.SaveSettingsAsync(new AgentSettings
        {
            ApiBaseUrl = "http://127.0.0.1:4000",
            StartWithWindows = true,
            LastSuccessfulSyncUtc = DateTimeOffset.Parse("2026-10-16T00:00:00Z"),
        });
        await workspace.SaveSettingsAsync(new AgentSettings
        {
            ApiBaseUrl = "http://127.0.0.1:4000",
            StartWithWindows = false,
            LastSuccessfulSyncUtc = workspace.CurrentSettings.LastSuccessfulSyncUtc,
        });

        Assert.Equal(new[] { true, false }, calls);
        var raw = await File.ReadAllTextAsync(path);
        Assert.Contains("http://127.0.0.1:4000", raw);
        Assert.Contains("2026-10-16", raw);
        Assert.Contains("startWithWindows", raw);
        Assert.DoesNotContain("SecretToken", raw);
        Assert.DoesNotContain("token", raw, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void PackageHashMustMatchAndTraversalIsRejected()
    {
        using var dir = new Temp();
        var package = Package(Path.Combine(dir.Path, "package"), "0.2.0", "app.txt", "payload");
        var outside = Path.Combine(dir.Path, "secret.txt");
        File.WriteAllText(outside, "do-not-read");
        var layout = Layout(dir);

        layout.Install(package);
        Assert.Equal("payload", File.ReadAllText(Path.Combine(layout.CurrentDirectory, "app.txt")));
        Assert.False(Directory.Exists(layout.UserDataRoot));

        var tampered = Package(Path.Combine(dir.Path, "tampered"), "0.2.1", "app.txt", "payload");
        File.WriteAllText(Path.Combine(tampered, "app.txt"), "changed");
        Assert.Throws<InvalidDataException>(() => layout.Upgrade(tampered));
        Assert.Equal("payload", File.ReadAllText(Path.Combine(layout.CurrentDirectory, "app.txt")));

        var escape = Path.Combine(dir.Path, "escape");
        Directory.CreateDirectory(escape);
        WriteManifest(escape, "0.2.1", new Dictionary<string, string> { ["../secret.txt"] = Hash(outside) });
        Assert.Throws<InvalidDataException>(() => layout.Upgrade(escape));
        Assert.Equal("do-not-read", File.ReadAllText(outside));
        Assert.Equal("payload", File.ReadAllText(Path.Combine(layout.CurrentDirectory, "app.txt")));

        WriteManifest(escape, "0.2.1", new Dictionary<string, string> { ["/etc/passwd"] = "aa" });
        Assert.Throws<InvalidDataException>(() => PackageIntegrity.ReadAndVerify(escape));
    }

    [Fact]
    public void UpgradePreservesUserDataAndRollbackRestoresThePreviousPayload()
    {
        using var dir = new Temp();
        var layout = Layout(dir);
        Directory.CreateDirectory(layout.UserDataRoot);
        var credential = Path.Combine(layout.UserDataRoot, "device-credential.json");
        var settings = Path.Combine(layout.UserDataRoot, "agent-settings.json");
        var credentialBytes = Encoding.UTF8.GetBytes("{\"installationId\":\"11111111-1111-1111-1111-111111111111\",\"protectedSecret\":\"protected:abc\"}");
        var settingsBytes = Encoding.UTF8.GetBytes("{\"apiBaseUrl\":\"http://127.0.0.1:4000\",\"lastSuccessfulSyncUtc\":\"2026-10-16T00:00:00+00:00\",\"startWithWindows\":false}");
        File.WriteAllBytes(credential, credentialBytes);
        File.WriteAllBytes(settings, settingsBytes);
        layout.Install(Package(Path.Combine(dir.Path, "v1"), "0.2.0", "app.txt", "one"));

        Assert.Throws<InvalidOperationException>(() => layout.Upgrade(Package(Path.Combine(dir.Path, "same"), "0.2.0", "app.txt", "same")));
        Assert.Equal("one", File.ReadAllText(Path.Combine(layout.CurrentDirectory, "app.txt")));

        layout.Upgrade(Package(Path.Combine(dir.Path, "v2"), "0.2.1", "app.txt", "two"));
        Assert.Equal("two", File.ReadAllText(Path.Combine(layout.CurrentDirectory, "app.txt")));
        Assert.Equal("one", File.ReadAllText(Path.Combine(layout.PreviousDirectory, "app.txt")));
        Assert.True(credentialBytes.AsSpan().SequenceEqual(File.ReadAllBytes(credential)));
        Assert.True(settingsBytes.AsSpan().SequenceEqual(File.ReadAllBytes(settings)));

        File.WriteAllText(Path.Combine(layout.PreviousDirectory, "app.txt"), "tampered");
        Assert.Throws<InvalidDataException>(() => layout.Rollback());
        Assert.Equal("two", File.ReadAllText(Path.Combine(layout.CurrentDirectory, "app.txt")));

        File.WriteAllText(Path.Combine(layout.PreviousDirectory, "app.txt"), "one");
        layout.Rollback();
        Assert.Equal("one", File.ReadAllText(Path.Combine(layout.CurrentDirectory, "app.txt")));
        Assert.Equal("two", File.ReadAllText(Path.Combine(layout.PreviousDirectory, "app.txt")));
        Assert.True(credentialBytes.AsSpan().SequenceEqual(File.ReadAllBytes(credential)));
        Assert.True(settingsBytes.AsSpan().SequenceEqual(File.ReadAllBytes(settings)));
    }

    [Fact]
    public void UninstallRemovesOnlyOwnedFiles()
    {
        using var dir = new Temp();
        var layout = Layout(dir);
        layout.Install(Package(Path.Combine(dir.Path, "v1"), "0.2.0", "app.txt", "one"));
        layout.Upgrade(Package(Path.Combine(dir.Path, "v2"), "0.2.1", "app.txt", "two"));
        Directory.CreateDirectory(layout.UserDataRoot);
        Directory.CreateDirectory(Path.Combine(layout.UserDataRoot, "logs"));
        File.WriteAllText(Path.Combine(layout.UserDataRoot, "device-credential.json"), "secret-file");
        File.WriteAllText(Path.Combine(layout.UserDataRoot, "agent-settings.json"), "settings");
        File.WriteAllText(Path.Combine(layout.UserDataRoot, "usage-queue.json"), "usage");
        File.WriteAllText(Path.Combine(layout.UserDataRoot, "notes.txt"), "keep-notes");
        File.WriteAllText(Path.Combine(layout.UserDataRoot, "logs", "agent.log"), "log");
        File.WriteAllText(Path.Combine(layout.UserDataRoot, "logs", "custom.txt"), "keep-log");
        var unrelated = Path.Combine(dir.Path, "Unrelated");
        Directory.CreateDirectory(unrelated);
        File.WriteAllText(Path.Combine(unrelated, "keep.txt"), "keep");
        File.WriteAllText(Path.Combine(layout.ProgramRoot, "operator-note.txt"), "operator");
        var outside = Path.Combine(dir.Path, "outside.txt");
        File.WriteAllText(outside, "outside-target");
        File.CreateSymbolicLink(Path.Combine(layout.CurrentDirectory, "linked.txt"), outside);
        var calls = new List<bool>();

        layout.Uninstall(keepUserData: false, new Recording(calls));

        Assert.Equal(new[] { false }, calls);
        Assert.False(Directory.Exists(layout.CurrentDirectory));
        Assert.False(Directory.Exists(layout.PreviousDirectory));
        Assert.Equal("operator", File.ReadAllText(Path.Combine(layout.ProgramRoot, "operator-note.txt")));
        Assert.Equal("keep-notes", File.ReadAllText(Path.Combine(layout.UserDataRoot, "notes.txt")));
        Assert.Equal("keep-log", File.ReadAllText(Path.Combine(layout.UserDataRoot, "logs", "custom.txt")));
        Assert.False(File.Exists(Path.Combine(layout.UserDataRoot, "device-credential.json")));
        Assert.False(File.Exists(Path.Combine(layout.UserDataRoot, "agent-settings.json")));
        Assert.False(File.Exists(Path.Combine(layout.UserDataRoot, "usage-queue.json")));
        Assert.False(File.Exists(Path.Combine(layout.UserDataRoot, "logs", "agent.log")));
        Assert.Equal("keep", File.ReadAllText(Path.Combine(unrelated, "keep.txt")));
        Assert.Equal("outside-target", File.ReadAllText(outside));
    }

    [Fact]
    public void UninstallCanKeepUserDataAndDoesNotFollowALogsLink()
    {
        using var dir = new Temp();
        var layout = Layout(dir);
        layout.Install(Package(Path.Combine(dir.Path, "v1"), "0.2.0", "app.txt", "one"));
        Directory.CreateDirectory(layout.UserDataRoot);
        var credential = Path.Combine(layout.UserDataRoot, "device-credential.json");
        File.WriteAllText(credential, "keep-credential");
        var outsideDir = Path.Combine(dir.Path, "outside-logs");
        Directory.CreateDirectory(outsideDir);
        File.WriteAllText(Path.Combine(outsideDir, "agent.log"), "keep-outside-log");
        Directory.CreateSymbolicLink(Path.Combine(layout.UserDataRoot, "logs"), outsideDir);

        layout.Uninstall(keepUserData: true);

        Assert.False(Directory.Exists(layout.CurrentDirectory));
        Assert.Equal("keep-credential", File.ReadAllText(credential));
        Assert.Equal("keep-outside-log", File.ReadAllText(Path.Combine(outsideDir, "agent.log")));

        layout.Install(Package(Path.Combine(dir.Path, "v2"), "0.2.0", "app.txt", "again"));
        layout.Uninstall(keepUserData: false);

        Assert.False(File.Exists(credential));
        Assert.Equal("keep-outside-log", File.ReadAllText(Path.Combine(outsideDir, "agent.log")));
        Assert.True(Directory.Exists(outsideDir));
    }

    [Fact]
    public void InstanceLockIsReleasedOnDisposeAndAStaleFileDoesNotBlockStartup()
    {
        using var dir = new Temp();
        var path = Path.Combine(dir.Path, "Trilez", "agent.lock");
        var first = InstanceLock.TryAcquire(path);
        Assert.NotNull(first);
        Assert.Null(InstanceLock.TryAcquire(path));
        first.Dispose();
        using var third = InstanceLock.TryAcquire(path);
        Assert.NotNull(third);
    }

    [Fact]
    public void DiagnosticLogRedactsSecretsAndRotates()
    {
        using var dir = new Temp();
        var path = Path.Combine(dir.Path, "logs", "agent.log");
        var log = new DiagnosticLog(path);
        log.Write("connection", "Authorization: Bearer eyJhbGciOiJub25lIn0.payload.sig");
        log.Write("connection", """{"password":"StrongPassword123!","secret":"device-secret-value"}""");
        log.Write("connection", "GET https://user:SecretToken@api.example/health");
        log.Write("connection", "X-Device-Credential: device-secret-value-should-not-leak");
        log.Write("connection", "password=hunter2 token=abc");

        var combined = File.ReadAllText(path);
        Assert.DoesNotContain("eyJ", combined);
        Assert.DoesNotContain("StrongPassword123!", combined);
        Assert.DoesNotContain("device-secret-value", combined);
        Assert.DoesNotContain("SecretToken", combined);
        Assert.DoesNotContain("hunter2", combined);
        Assert.Contains("Bearer [redacted]", combined);
        Assert.Contains("[redacted]@", combined);
        Assert.Contains("password=[redacted]", combined);

        var rotating = new DiagnosticLog(Path.Combine(dir.Path, "logs", "rotate.log"), rotateBytes: 64);
        rotating.Write("connection", "first line is long enough to cross the rotation threshold");
        rotating.Write("connection", "second line replaces the previous file as the single backup");
        Assert.True(File.Exists(Path.Combine(dir.Path, "logs", "rotate.log.1")));
        Assert.Contains("second line", File.ReadAllText(Path.Combine(dir.Path, "logs", "rotate.log")));
    }

    [Fact]
    public void RepairReplacesTheSameVersionOnly()
    {
        using var dir = new Temp();
        var layout = Layout(dir);
        layout.Install(Package(Path.Combine(dir.Path, "v1"), "0.2.0", "app.txt", "one"));
        Assert.Throws<InvalidOperationException>(() => layout.Repair(Package(Path.Combine(dir.Path, "newer"), "0.2.1", "app.txt", "two")));
        Assert.Equal("one", File.ReadAllText(Path.Combine(layout.CurrentDirectory, "app.txt")));
        layout.Repair(Package(Path.Combine(dir.Path, "repair"), "0.2.0", "app.txt", "repaired"));
        Assert.Equal("repaired", File.ReadAllText(Path.Combine(layout.CurrentDirectory, "app.txt")));
        Assert.False(Directory.Exists(layout.PreviousDirectory));
    }

    private static DeploymentLayout Layout(Temp dir) =>
        new(Path.Combine(dir.Path, "program"), Path.Combine(dir.Path, "user-data"));

    private static string Package(string root, string version, string name, string content)
    {
        Directory.CreateDirectory(root);
        File.WriteAllText(Path.Combine(root, name), content);
        var manifest = PackageManifest.CreateFromDirectory(root, version);
        PackageManifest.Save(Path.Combine(root, "manifest.json"), manifest);
        return root;
    }

    private static void WriteManifest(string root, string version, Dictionary<string, string> files)
    {
        PackageManifest.Save(Path.Combine(root, "manifest.json"), new PackageManifest
        {
            Product = AgentInfo.PackageProduct,
            Version = version,
            Runtime = AgentInfo.Runtime,
            Rid = AgentInfo.RuntimeId,
            Files = files,
        });
    }

    private static string Hash(string path)
    {
        using var stream = File.OpenRead(path);
        return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
    }

    private sealed class Recording(List<bool> calls) : IStartupRegistration
    {
        public void Apply(bool enabled) => calls.Add(enabled);
    }

    private sealed class Temp : IDisposable
    {
        public Temp() => Path = Directory.CreateTempSubdirectory("trilez-deploy-").FullName;
        public string Path { get; }
        public void Dispose() => Directory.Delete(Path, recursive: true);
    }
}
