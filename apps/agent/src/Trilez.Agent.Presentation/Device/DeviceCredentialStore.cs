using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Trilez.Agent.Presentation;

public sealed record StoredDeviceCredential
{
    public required string InstallationId { get; init; }
    public string? EnrollmentId { get; init; }
    public string? Secret { get; init; }
    public string? DeviceName { get; init; }
    public string? Status { get; init; }
}

public interface IDeviceSecretProtector
{
    string Protect(string secret);
    string Unprotect(string protectedSecret);
}

public interface IDeviceCredentialStore
{
    StoredDeviceCredential? Load();
    void Save(StoredDeviceCredential credential);
    void Clear();
}

/// <summary>Test stand-in. The stored form is not the raw secret. Windows uses DPAPI instead.</summary>
public sealed class ReversingDeviceSecretProtector : IDeviceSecretProtector
{
    public string Protect(string secret)
    {
        var bytes = Encoding.UTF8.GetBytes(secret);
        Array.Reverse(bytes);
        return "protected:" + Convert.ToBase64String(bytes);
    }

    public string Unprotect(string protectedSecret)
    {
        const string prefix = "protected:";
        if (!protectedSecret.StartsWith(prefix, StringComparison.Ordinal))
            throw new InvalidOperationException("Device credential protection was not recognized.");
        var bytes = Convert.FromBase64String(protectedSecret[prefix.Length..]);
        Array.Reverse(bytes);
        return Encoding.UTF8.GetString(bytes);
    }
}

public sealed class MemoryDeviceCredentialStore : IDeviceCredentialStore
{
    private StoredDeviceCredential? _current;

    public StoredDeviceCredential? Load() => _current is null ? null : Copy(_current);

    public void Save(StoredDeviceCredential credential) => _current = Copy(credential);

    public void Clear() => _current = null;

    private static StoredDeviceCredential Copy(StoredDeviceCredential credential) => new()
    {
        InstallationId = credential.InstallationId,
        EnrollmentId = credential.EnrollmentId,
        Secret = credential.Secret,
        DeviceName = credential.DeviceName,
        Status = credential.Status,
    };
}

public sealed class ProtectedFileDeviceCredentialStore : IDeviceCredentialStore
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly string _path;
    private readonly IDeviceSecretProtector _protector;

    public ProtectedFileDeviceCredentialStore(string path, IDeviceSecretProtector protector)
    {
        if (string.IsNullOrWhiteSpace(path)) throw new ArgumentException("Device credential path is required.", nameof(path));
        _path = path;
        _protector = protector ?? throw new ArgumentNullException(nameof(protector));
    }

    public static string DefaultPath()
    {
        var root = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        if (string.IsNullOrWhiteSpace(root))
            root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".trilez");
        return Path.Combine(root, "Trilez", "device-credential.json");
    }

    public StoredDeviceCredential? Load()
    {
        try
        {
            if (!File.Exists(_path)) return null;
            var model = JsonSerializer.Deserialize<FileModel>(File.ReadAllText(_path), Options);
            if (model is null || string.IsNullOrWhiteSpace(model.InstallationId)) return null;
            string? secret = null;
            if (!string.IsNullOrWhiteSpace(model.ProtectedSecret))
            {
                try { secret = _protector.Unprotect(model.ProtectedSecret); }
                catch (Exception error) when (error is FormatException or InvalidOperationException or CryptographicException)
                {
                    secret = null;
                }
            }
            return new StoredDeviceCredential
            {
                InstallationId = model.InstallationId,
                EnrollmentId = model.EnrollmentId,
                Secret = secret,
                DeviceName = model.DeviceName,
                Status = model.Status,
            };
        }
        catch (Exception error) when (error is IOException or JsonException or UnauthorizedAccessException)
        {
            return null;
        }
    }

    public void Save(StoredDeviceCredential credential)
    {
        if (string.IsNullOrWhiteSpace(credential.InstallationId))
            throw new ArgumentException("Installation id is required.", nameof(credential));
        var directory = Path.GetDirectoryName(_path);
        if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);
        var model = new FileModel
        {
            InstallationId = credential.InstallationId,
            EnrollmentId = credential.EnrollmentId,
            ProtectedSecret = string.IsNullOrEmpty(credential.Secret) ? null : _protector.Protect(credential.Secret),
            DeviceName = credential.DeviceName,
            Status = credential.Status,
        };
        var temporary = _path + ".tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(model, Options));
        File.Move(temporary, _path, overwrite: true);
    }

    public void Clear()
    {
        if (File.Exists(_path)) File.Delete(_path);
    }

    private sealed class FileModel
    {
        public string? InstallationId { get; set; }
        public string? EnrollmentId { get; set; }
        public string? ProtectedSecret { get; set; }
        public string? DeviceName { get; set; }
        public string? Status { get; set; }
    }
}
