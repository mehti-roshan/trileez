using System.Diagnostics;
using System.Runtime.InteropServices;
using Trilez.Agent.Presentation;

namespace Trilez.Agent.Desktop;

/// <summary>
/// Reads the foreground process and idle state. Window titles, keystrokes, clipboard text, and document contents are not read.
/// </summary>
public sealed class WindowsForegroundProbe : IForegroundProbe
{
    private readonly Dictionary<string, string?> _descriptions = new(StringComparer.OrdinalIgnoreCase);

    public UsageObservation Read(TimeSpan idleThreshold)
    {
        try
        {
            if (IdleFor() >= idleThreshold)
                return new UsageObservation(null, null, true, UsageBoundary.None);
            var window = GetForegroundWindow();
            if (window == IntPtr.Zero)
                return new UsageObservation(null, null, true, UsageBoundary.None);
            _ = GetWindowThreadProcessId(window, out var processId);
            if (processId == 0)
                return new UsageObservation(null, null, true, UsageBoundary.None);
            using var process = Process.GetProcessById(unchecked((int)processId));
            var name = process.ProcessName;
            if (name.Equals("LockApp", StringComparison.OrdinalIgnoreCase) || name.Equals("LogonUI", StringComparison.OrdinalIgnoreCase))
                return new UsageObservation(null, null, true, UsageBoundary.Lock);
            return new UsageObservation(name, Description(name, process), false, UsageBoundary.None);
        }
        catch (Exception)
        {
            return new UsageObservation(null, null, true, UsageBoundary.None);
        }
    }

    private string? Description(string name, Process process)
    {
        if (_descriptions.TryGetValue(name, out var cached)) return cached;
        string? description = null;
        try
        {
            var path = process.MainModule?.FileName;
            if (!string.IsNullOrWhiteSpace(path))
                description = UsageAggregator.Display(FileVersionInfo.GetVersionInfo(path).FileDescription);
        }
        catch (Exception)
        {
            description = null;
        }
        if (_descriptions.Count < 256) _descriptions[name] = description;
        return description;
    }

    private static TimeSpan IdleFor()
    {
        var info = new LastInputInfo { Size = (uint)Marshal.SizeOf<LastInputInfo>() };
        if (!GetLastInputInfo(ref info)) return TimeSpan.MaxValue;
        var idle = unchecked((uint)Environment.TickCount - info.Time);
        return TimeSpan.FromMilliseconds(idle);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct LastInputInfo
    {
        public uint Size;
        public uint Time;
    }

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll")]
    private static extern bool GetLastInputInfo(ref LastInputInfo info);
}
