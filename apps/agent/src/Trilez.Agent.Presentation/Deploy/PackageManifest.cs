using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Trilez.Agent.Presentation;

public sealed class PackageManifest
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public string Product { get; set; } = "";
    public string Version { get; set; } = "";
    public string Runtime { get; set; } = "";
    public string Rid { get; set; } = "";
    public Dictionary<string, string> Files { get; set; } = new(StringComparer.Ordinal);

    public static PackageManifest Load(string path)
    {
        PackageManifest? manifest;
        try
        {
            manifest = JsonSerializer.Deserialize<PackageManifest>(File.ReadAllText(path), Options);
        }
        catch (Exception error) when (error is IOException or JsonException or UnauthorizedAccessException)
        {
            throw new InvalidDataException("The package manifest could not be read.", error);
        }
        if (manifest is null) throw new InvalidDataException("The package manifest is empty.");
        manifest.Files ??= new Dictionary<string, string>(StringComparer.Ordinal);
        return manifest;
    }

    public static void Save(string path, PackageManifest manifest)
    {
        var directory = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);
        File.WriteAllText(path, JsonSerializer.Serialize(manifest, Options));
    }

    public static PackageManifest CreateFromDirectory(string directory, string version)
    {
        PackageIntegrity.ParseVersion(version);
        var root = Path.GetFullPath(directory);
        if (!Directory.Exists(root)) throw new DirectoryNotFoundException(root);
        var files = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var file in Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories).OrderBy(path => path, StringComparer.Ordinal))
        {
            if (PackageIntegrity.IsLink(file))
                throw new InvalidDataException("The package contains a link. Publish regular files only.");
            var relative = Path.GetRelativePath(root, file).Replace('\\', '/');
            if (string.Equals(relative, "manifest.json", StringComparison.OrdinalIgnoreCase)) continue;
            files[relative] = PackageIntegrity.HashFile(file);
        }
        if (files.Count == 0) throw new InvalidDataException("The package has no files.");
        return new PackageManifest
        {
            Product = AgentInfo.PackageProduct,
            Version = version,
            Runtime = AgentInfo.Runtime,
            Rid = AgentInfo.RuntimeId,
            Files = files,
        };
    }
}

public static class PackageIntegrity
{
    public static PackageManifest ReadAndVerify(string packageRoot)
    {
        var manifestPath = Path.Combine(packageRoot, "manifest.json");
        if (!File.Exists(manifestPath)) throw new InvalidDataException("The package manifest is missing.");
        var manifest = PackageManifest.Load(manifestPath);
        Verify(packageRoot, manifest);
        return manifest;
    }

    public static void Verify(string packageRoot, PackageManifest manifest)
    {
        if (!string.Equals(manifest.Product, AgentInfo.PackageProduct, StringComparison.Ordinal))
            throw new InvalidDataException("The package product is not Trilez Agent.");
        if (!string.Equals(manifest.Runtime, AgentInfo.Runtime, StringComparison.Ordinal))
            throw new InvalidDataException("The package runtime is not the Windows desktop runtime.");
        if (!string.Equals(manifest.Rid, AgentInfo.RuntimeId, StringComparison.Ordinal))
            throw new InvalidDataException("The package is not win-x64.");
        ParseVersion(manifest.Version);
        if (manifest.Files is null || manifest.Files.Count == 0)
            throw new InvalidDataException("The package lists no files.");
        foreach (var pair in manifest.Files)
        {
            if (string.IsNullOrWhiteSpace(pair.Value))
                throw new InvalidDataException("A package file has no hash.");
            var full = ResolvePayloadPath(packageRoot, pair.Key);
            var actual = HashFile(full);
            if (!string.Equals(actual, pair.Value.Trim(), StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("A package file hash does not match.");
        }
    }

    public static string ResolvePayloadPath(string packageRoot, string relative)
    {
        if (string.IsNullOrWhiteSpace(relative))
            throw new InvalidDataException("A package path is empty.");
        if (string.Equals(relative, "manifest.json", StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("The manifest is not a payload file.");
        if (relative.Contains(':') || relative.StartsWith('/') || relative.StartsWith('\\'))
            throw new InvalidDataException("A package path is not relative.");
        var parts = relative.Split(['/', '\\'], StringSplitOptions.None);
        if (parts.Any(part => part.Length == 0 || part == "." || part == ".."))
            throw new InvalidDataException("A package path is not allowed.");
        var root = Path.GetFullPath(packageRoot);
        var full = Path.GetFullPath(Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar)));
        if (!IsInside(root, full))
            throw new InvalidDataException("A package path escapes the package directory.");
        if (IsLink(full) || !File.Exists(full))
            throw new InvalidDataException("A package file is missing.");
        return full;
    }

    public static string HashFile(string path)
    {
        using var stream = File.OpenRead(path);
        return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
    }

    public static (int Major, int Minor, int Patch) ParseVersion(string? version)
    {
        var parts = (version ?? "").Split('.');
        if (parts.Length != 3) throw new InvalidDataException("The package version must be three numbers.");
        var numbers = new int[3];
        for (var i = 0; i < 3; i++)
        {
            if (!int.TryParse(parts[i], System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out var number) || number is < 0 or > 9999)
                throw new InvalidDataException("The package version must be three numbers.");
            numbers[i] = number;
        }
        return (numbers[0], numbers[1], numbers[2]);
    }

    public static bool IsNewer(string candidate, string installed) =>
        ParseVersion(candidate).CompareTo(ParseVersion(installed)) > 0;

    public static bool SameVersion(string left, string right) =>
        ParseVersion(left).CompareTo(ParseVersion(right)) == 0;

    public static bool IsLink(string path)
    {
        try
        {
            if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) return true;
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or ArgumentException)
        {
            return false;
        }
        try
        {
            if (File.ResolveLinkTarget(path, returnFinalTarget: false) is not null) return true;
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or ArgumentException)
        {
        }
        try
        {
            return Directory.ResolveLinkTarget(path, returnFinalTarget: false) is not null;
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or ArgumentException)
        {
            return false;
        }
    }

    public static bool IsInside(string boundary, string candidate)
    {
        var root = Path.GetFullPath(boundary);
        var full = Path.GetFullPath(candidate);
        var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        if (string.Equals(full, root, comparison)) return true;
        var prefix = root.EndsWith(Path.DirectorySeparatorChar) ? root : root + Path.DirectorySeparatorChar;
        return full.StartsWith(prefix, comparison);
    }
}
