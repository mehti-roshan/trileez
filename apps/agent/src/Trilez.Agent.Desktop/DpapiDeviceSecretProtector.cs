using System.Security.Cryptography;
using System.Text;
using Trilez.Agent.Presentation;

namespace Trilez.Agent.Desktop;

/// <summary>
/// Protects the device credential for the current Windows user.
/// This type is compiled only with the Windows desktop project and was not executed on Linux.
/// </summary>
internal sealed class DpapiDeviceSecretProtector : IDeviceSecretProtector
{
    public string Protect(string secret)
    {
        var protectedBytes = ProtectedData.Protect(Encoding.UTF8.GetBytes(secret), optionalEntropy: null, DataProtectionScope.CurrentUser);
        return Convert.ToBase64String(protectedBytes);
    }

    public string Unprotect(string protectedSecret)
    {
        var bytes = ProtectedData.Unprotect(Convert.FromBase64String(protectedSecret), optionalEntropy: null, DataProtectionScope.CurrentUser);
        return Encoding.UTF8.GetString(bytes);
    }
}
