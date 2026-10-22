namespace Trilez.Agent.Presentation;

/// <summary>
/// One running employee agent per user. The lock is the open file handle, so a leftover file after a crash does not block the next start.
/// </summary>
public sealed class InstanceLock : IDisposable
{
    private readonly FileStream _stream;

    private InstanceLock(FileStream stream) => _stream = stream;

    public static InstanceLock? TryAcquire(string path)
    {
        if (string.IsNullOrWhiteSpace(path)) throw new ArgumentException("Lock path is required.", nameof(path));
        try
        {
            var directory = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);
            var stream = new FileStream(path, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
            return new InstanceLock(stream);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            return null;
        }
    }

    public void Dispose() => _stream.Dispose();
}
