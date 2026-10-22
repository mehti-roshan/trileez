using System.Security.Cryptography;
using System.Text;

namespace Trilez.Agent.Presentation;

/// <summary>
/// Protects the device secret with AES-GCM and a local key file. Windows desktop still uses DPAPI.
/// The key file is created with user-only Unix permissions when the OS supports them.
/// </summary>
public sealed class AesFileSecretProtector : IDeviceSecretProtector
{
    private const string Prefix = "aesgcm:";
    private readonly string _keyPath;

    public AesFileSecretProtector(string keyPath)
    {
        if (string.IsNullOrWhiteSpace(keyPath)) throw new ArgumentException("Key path is required.", nameof(keyPath));
        _keyPath = keyPath;
    }

    public static string DefaultKeyPath()
    {
        var root = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        if (string.IsNullOrWhiteSpace(root))
            root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".trilez");
        return Path.Combine(root, "Trilez", "device-protect.key");
    }

    public string Protect(string secret)
    {
        var key = LoadOrCreateKey();
        var nonce = RandomNumberGenerator.GetBytes(12);
        var plain = Encoding.UTF8.GetBytes(secret);
        var cipher = new byte[plain.Length];
        var tag = new byte[16];
        using var aes = new AesGcm(key, 16);
        aes.Encrypt(nonce, plain, cipher, tag);
        return Prefix + Convert.ToBase64String(nonce.Concat(tag).Concat(cipher).ToArray());
    }

    public string Unprotect(string protectedSecret)
    {
        if (!protectedSecret.StartsWith(Prefix, StringComparison.Ordinal))
            throw new InvalidOperationException("Device credential protection was not recognized.");
        var payload = Convert.FromBase64String(protectedSecret[Prefix.Length..]);
        if (payload.Length < 28) throw new InvalidOperationException("Device credential protection was not recognized.");
        var nonce = payload.AsSpan(0, 12);
        var tag = payload.AsSpan(12, 16);
        var cipher = payload.AsSpan(28);
        var plain = new byte[cipher.Length];
        using var aes = new AesGcm(LoadOrCreateKey(), 16);
        aes.Decrypt(nonce, cipher, tag, plain);
        return Encoding.UTF8.GetString(plain);
    }

    private byte[] LoadOrCreateKey()
    {
        var directory = Path.GetDirectoryName(_keyPath);
        if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);
        if (File.Exists(_keyPath))
        {
            var existing = File.ReadAllBytes(_keyPath);
            if (existing.Length == 32) return existing;
        }

        var key = RandomNumberGenerator.GetBytes(32);
        File.WriteAllBytes(_keyPath, key);
        Restrict(key);
        return key;
    }

    private void Restrict(byte[] _)
    {
        if (!OperatingSystem.IsLinux() && !OperatingSystem.IsMacOS()) return;
        try
        {
            File.SetUnixFileMode(_keyPath, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        }
        catch (Exception)
        {
        }
    }
}
