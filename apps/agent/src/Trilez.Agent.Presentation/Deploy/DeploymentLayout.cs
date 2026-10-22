namespace Trilez.Agent.Presentation;

/// <summary>
/// Per-user program files and the separate user-data directory.
/// Upgrade and rollback never rewrite settings or the device credential.
/// Uninstall deletes only known Trilez files.
/// </summary>
public sealed class DeploymentLayout
{
    public DeploymentLayout(string programRoot, string userDataRoot)
    {
        ProgramRoot = EnsureOwnedRoot(programRoot);
        UserDataRoot = EnsureOwnedRoot(userDataRoot);
        if (PackageIntegrity.IsInside(ProgramRoot, UserDataRoot) || PackageIntegrity.IsInside(UserDataRoot, ProgramRoot))
            throw new InvalidOperationException("Program files and user data must be different directories.");
    }

    public string ProgramRoot { get; }
    public string UserDataRoot { get; }
    public string CurrentDirectory => Path.Combine(ProgramRoot, "current");
    public string PreviousDirectory => Path.Combine(ProgramRoot, "previous");

    public static string EnsureOwnedRoot(string path)
    {
        if (string.IsNullOrWhiteSpace(path)) throw new ArgumentException("A directory is required.", nameof(path));
        var full = Path.GetFullPath(path);
        var root = Path.GetPathRoot(full);
        if (string.IsNullOrEmpty(root)) throw new InvalidOperationException("Refusing to use a drive root.");
        var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        var trimmed = full.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var rootTrimmed = root.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        if (trimmed.Length == 0 || string.Equals(trimmed, rootTrimmed, comparison) || string.Equals(full, root, comparison))
            throw new InvalidOperationException("Refusing to use a drive root.");
        var relative = trimmed[root.Length..].Trim(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var segments = relative.Split([Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar], StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length < 2)
            throw new InvalidOperationException("Refusing to use a directory that is too close to the drive root.");
        return full;
    }

    public void Install(string packageRoot)
    {
        var manifest = PackageIntegrity.ReadAndVerify(packageRoot);
        if (File.Exists(Path.Combine(CurrentDirectory, "manifest.json")) || DirectoryHasEntries(CurrentDirectory))
            throw new InvalidOperationException("Trilez Agent is already installed.");
        CopyPayload(packageRoot, manifest, CurrentDirectory);
    }

    public void Upgrade(string packageRoot)
    {
        var manifest = PackageIntegrity.ReadAndVerify(packageRoot);
        var installedPath = Path.Combine(CurrentDirectory, "manifest.json");
        if (!File.Exists(installedPath)) throw new InvalidOperationException("Trilez Agent is not installed.");
        var installed = PackageManifest.Load(installedPath);
        if (!PackageIntegrity.IsNewer(manifest.Version, installed.Version))
            throw new InvalidOperationException("The package is not newer than the installed version.");
        if (Directory.Exists(PreviousDirectory)) DeleteTree(PreviousDirectory, ProgramRoot);
        Directory.Move(CurrentDirectory, PreviousDirectory);
        try
        {
            CopyPayload(packageRoot, manifest, CurrentDirectory);
        }
        catch
        {
            if (Directory.Exists(CurrentDirectory)) DeleteTree(CurrentDirectory, ProgramRoot);
            if (!Directory.Exists(CurrentDirectory) && Directory.Exists(PreviousDirectory))
                Directory.Move(PreviousDirectory, CurrentDirectory);
            throw;
        }
    }

    public void Repair(string packageRoot)
    {
        var manifest = PackageIntegrity.ReadAndVerify(packageRoot);
        var installedPath = Path.Combine(CurrentDirectory, "manifest.json");
        if (File.Exists(installedPath))
        {
            var installed = PackageManifest.Load(installedPath);
            if (!PackageIntegrity.SameVersion(installed.Version, manifest.Version))
                throw new InvalidOperationException("Repair only replaces the same version.");
        }
        var staging = Path.Combine(ProgramRoot, "repair-staging");
        if (Directory.Exists(staging)) DeleteTree(staging, ProgramRoot);
        var moved = false;
        if (Directory.Exists(CurrentDirectory))
        {
            Directory.Move(CurrentDirectory, staging);
            moved = true;
        }
        try
        {
            CopyPayload(packageRoot, manifest, CurrentDirectory);
            if (moved) DeleteTree(staging, ProgramRoot);
        }
        catch
        {
            if (Directory.Exists(CurrentDirectory)) DeleteTree(CurrentDirectory, ProgramRoot);
            if (moved && Directory.Exists(staging) && !Directory.Exists(CurrentDirectory))
                Directory.Move(staging, CurrentDirectory);
            throw;
        }
    }

    public void Rollback()
    {
        var previousManifest = Path.Combine(PreviousDirectory, "manifest.json");
        if (!File.Exists(previousManifest))
            throw new InvalidOperationException("There is no previous version to restore.");
        PackageIntegrity.ReadAndVerify(PreviousDirectory);
        var staging = Path.Combine(ProgramRoot, "rollback-staging");
        if (Directory.Exists(staging)) DeleteTree(staging, ProgramRoot);
        if (Directory.Exists(CurrentDirectory))
            Directory.Move(CurrentDirectory, staging);
        try
        {
            Directory.Move(PreviousDirectory, CurrentDirectory);
            if (Directory.Exists(staging))
                Directory.Move(staging, PreviousDirectory);
        }
        catch
        {
            if (!Directory.Exists(CurrentDirectory) && Directory.Exists(staging))
                Directory.Move(staging, CurrentDirectory);
            throw;
        }
    }

    public void Uninstall(bool keepUserData, IStartupRegistration? startup = null)
    {
        startup?.Apply(false);
        if (Directory.Exists(CurrentDirectory)) DeleteTree(CurrentDirectory, ProgramRoot);
        if (Directory.Exists(PreviousDirectory)) DeleteTree(PreviousDirectory, ProgramRoot);
        DeleteOwnedFile(Path.Combine(ProgramRoot, AgentDataPaths.UninstallScriptName), ProgramRoot);
        DeleteOwnedFile(Path.Combine(ProgramRoot, "install-flags.json"), ProgramRoot);
        TryDeleteIfEmpty(ProgramRoot);
        if (!keepUserData) RemoveKnownUserFiles();
    }

    private void RemoveKnownUserFiles()
    {
        var logs = Path.Combine(UserDataRoot, AgentDataPaths.LogDirectoryName);
        if (PackageIntegrity.IsLink(logs))
            RemoveLink(logs);
        else if (Directory.Exists(logs))
        {
            foreach (var name in AgentDataPaths.KnownLogFiles)
                DeleteOwnedFile(Path.Combine(logs, name), UserDataRoot);
            TryDeleteIfEmpty(logs);
        }
        foreach (var name in AgentDataPaths.KnownUserFiles)
            DeleteOwnedFile(Path.Combine(UserDataRoot, name), UserDataRoot);
        TryDeleteIfEmpty(UserDataRoot);
    }

    private void CopyPayload(string packageRoot, PackageManifest manifest, string destination)
    {
        Directory.CreateDirectory(destination);
        try
        {
            foreach (var relative in manifest.Files.Keys)
            {
                var source = PackageIntegrity.ResolvePayloadPath(packageRoot, relative);
                var target = Path.GetFullPath(Path.Combine(destination, relative.Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar)));
                if (!PackageIntegrity.IsInside(destination, target))
                    throw new InvalidDataException("A package path escapes the installation directory.");
                var parent = Path.GetDirectoryName(target);
                if (!string.IsNullOrEmpty(parent)) Directory.CreateDirectory(parent);
                File.Copy(source, target, overwrite: true);
            }
            PackageManifest.Save(Path.Combine(destination, "manifest.json"), manifest);
            PackageIntegrity.ReadAndVerify(destination);
        }
        catch
        {
            if (Directory.Exists(destination)) DeleteTree(destination, ProgramRoot);
            throw;
        }
    }

    private static bool DirectoryHasEntries(string path) =>
        Directory.Exists(path) && Directory.EnumerateFileSystemEntries(path).Any();

    private static void DeleteTree(string directory, string boundary)
    {
        var full = Path.GetFullPath(directory);
        if (!PackageIntegrity.IsInside(boundary, full))
            throw new InvalidOperationException("Refusing to delete a path outside the owned directory.");
        if (PackageIntegrity.IsLink(full))
        {
            RemoveLink(full);
            return;
        }
        if (!Directory.Exists(full))
        {
            if (File.Exists(full)) File.Delete(full);
            return;
        }
        foreach (var entry in Directory.EnumerateFileSystemEntries(full))
        {
            if (PackageIntegrity.IsLink(entry)) RemoveLink(entry);
            else if (File.Exists(entry) && !Directory.Exists(entry)) File.Delete(entry);
            else DeleteTree(entry, boundary);
        }
        Directory.Delete(full, recursive: false);
    }

    private static void DeleteOwnedFile(string path, string boundary)
    {
        var full = Path.GetFullPath(path);
        if (!PackageIntegrity.IsInside(boundary, full))
            throw new InvalidOperationException("Refusing to delete a path outside the owned directory.");
        if (AncestorLinkEscapes(full, boundary)) return;
        if (PackageIntegrity.IsLink(full))
        {
            RemoveLink(full);
            return;
        }
        if (File.Exists(full)) File.Delete(full);
    }

    private static bool AncestorLinkEscapes(string path, string boundary)
    {
        var current = Path.GetDirectoryName(Path.GetFullPath(path));
        while (!string.IsNullOrEmpty(current) && PackageIntegrity.IsInside(boundary, current))
        {
            if (string.Equals(Path.GetFullPath(current), Path.GetFullPath(boundary), OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal))
                break;
            if (PackageIntegrity.IsLink(current))
            {
                var target = ResolveFinal(current);
                if (target is null || !PackageIntegrity.IsInside(boundary, target)) return true;
            }
            current = Path.GetDirectoryName(current);
        }
        return false;
    }

    private static string? ResolveFinal(string path)
    {
        try
        {
            var file = File.ResolveLinkTarget(path, returnFinalTarget: true);
            if (file is not null) return file.FullName;
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or ArgumentException)
        {
        }
        try
        {
            return Directory.ResolveLinkTarget(path, returnFinalTarget: true)?.FullName;
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or ArgumentException)
        {
            return null;
        }
    }

    private static void RemoveLink(string path)
    {
        try
        {
            File.Delete(path);
            if (!StillThere(path)) return;
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
        }
        if ((File.GetAttributes(path) & FileAttributes.Directory) != 0)
            Directory.Delete(path, recursive: false);
        else
            File.Delete(path);
    }

    private static bool StillThere(string path)
    {
        try
        {
            _ = File.GetAttributes(path);
            return true;
        }
        catch (Exception error) when (error is FileNotFoundException or DirectoryNotFoundException)
        {
            return false;
        }
    }

    private static void TryDeleteIfEmpty(string directory)
    {
        if (!Directory.Exists(directory) || PackageIntegrity.IsLink(directory)) return;
        if (Directory.EnumerateFileSystemEntries(directory).Any()) return;
        Directory.Delete(directory, recursive: false);
    }
}
