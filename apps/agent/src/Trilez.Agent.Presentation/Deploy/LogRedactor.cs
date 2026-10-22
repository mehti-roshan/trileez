using System.Text.RegularExpressions;

namespace Trilez.Agent.Presentation;

/// <summary>
/// Removes credentials and bearer tokens from diagnostic text. Logs keep status and code, not request bodies.
/// </summary>
public static class LogRedactor
{
    public const int MaxLength = 500;
    private static readonly TimeSpan Timeout = TimeSpan.FromMilliseconds(100);

    public static string Redact(string? value)
    {
        if (string.IsNullOrEmpty(value)) return "";
        try
        {
            var text = value.Length > 4000 ? value[..4000] : value;
            text = Replace(text, @"Bearer\s+\S+", "Bearer [redacted]");
            text = Replace(text, @"eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}", "[redacted]");
            text = Replace(text, """(?i)("(?:password|secret|token|credential|authorization)"\s*:\s*")([^"\\]*)(")""", "$1[redacted]$3");
            text = Replace(text, @"(?i)\b(password|secret|token|credential|authorization)\s*=\s*(""[^""]*""|'[^']*'|\S+)", "$1=[redacted]");
            text = Replace(text, @"(?i)(X-Device-Credential\s*[:=]\s*)\S+", "$1[redacted]");
            text = Replace(text, @"(?i)([a-z][a-z0-9+.-]*://)[^/\s:@]+:[^/\s@]+@", "$1[redacted]@");
            text = Replace(text, @"eyJ[A-Za-z0-9_-]{8,}", "[redacted]");
            if (text.Length > MaxLength) text = text[..MaxLength];
            return text;
        }
        catch (RegexMatchTimeoutException)
        {
            return "[redacted]";
        }
    }

    private static string Replace(string text, string pattern, string replacement) =>
        Regex.Replace(text, pattern, replacement, RegexOptions.None, Timeout);
}
