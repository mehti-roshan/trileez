using System.Globalization;

namespace Trilez.Agent.Presentation;

/// <summary>
/// Append-only diagnostic log under the Trilez data directory. One backup is kept. Secrets are redacted before the line is written.
/// </summary>
public sealed class DiagnosticLog
{
    public const long DefaultRotateBytes = 512 * 1024;
    private readonly string _path;
    private readonly long _rotateBytes;
    private readonly object _gate = new();

    public DiagnosticLog(string path, long rotateBytes = DefaultRotateBytes)
    {
        if (string.IsNullOrWhiteSpace(path)) throw new ArgumentException("Log path is required.", nameof(path));
        if (rotateBytes < 64) throw new ArgumentOutOfRangeException(nameof(rotateBytes));
        _path = path;
        _rotateBytes = rotateBytes;
    }

    public string Path => _path;

    public void Write(string category, string message)
    {
        var safeCategory = string.IsNullOrWhiteSpace(category) ? "log" : category.Trim();
        if (safeCategory.Length > 40) safeCategory = safeCategory[..40];
        safeCategory = safeCategory.Replace('\r', ' ').Replace('\n', ' ');
        var line = DateTimeOffset.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture)
            + " " + safeCategory + " " + LogRedactor.Redact(message);
        lock (_gate)
        {
            try
            {
                var directory = System.IO.Path.GetDirectoryName(_path);
                if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);
                RotateIfNeeded(System.Text.Encoding.UTF8.GetByteCount(line) + Environment.NewLine.Length);
                File.AppendAllText(_path, line + Environment.NewLine);
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException)
            {
            }
        }
    }

    private void RotateIfNeeded(int incoming)
    {
        if (!File.Exists(_path)) return;
        if (new FileInfo(_path).Length + incoming < _rotateBytes) return;
        var backup = _path + ".1";
        if (File.Exists(backup)) File.Delete(backup);
        File.Move(_path, backup);
    }
}
