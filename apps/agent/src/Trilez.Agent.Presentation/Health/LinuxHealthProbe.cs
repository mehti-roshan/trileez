using System.Runtime.InteropServices;

namespace Trilez.Agent.Presentation;

/// <summary>
/// Reads CPU, memory, and disk from Linux procfs and DriveInfo. Window titles and screen pixels are not read.
/// </summary>
public sealed class LinuxHealthProbe : IHealthProbe
{
    private ulong _lastIdle;
    private ulong _lastTotal;
    private bool _hasCpu;

    public HealthReading Read()
    {
        return new HealthReading
        {
            CpuPercent = ReadCpu(),
            MemoryUsedBytes = ReadMemory(out var total),
            MemoryTotalBytes = total,
            DiskFreeBytes = ReadDisk(out var diskTotal),
            DiskTotalBytes = diskTotal,
            OsName = OperatingSystem.IsLinux() ? "Linux" : Environment.OSVersion.VersionString,
            OsVersion = ReadOsRelease() ?? Environment.OSVersion.Version.ToString(),
            Architecture = RuntimeInformation.OSArchitecture.ToString(),
        };
    }

    private double? ReadCpu()
    {
        try
        {
            if (!File.Exists("/proc/stat")) return null;
            var line = File.ReadLines("/proc/stat").FirstOrDefault();
            if (line is null || !line.StartsWith("cpu ", StringComparison.Ordinal)) return null;
            var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 5) return null;
            ulong user = ulong.Parse(parts[1]);
            ulong nice = ulong.Parse(parts[2]);
            ulong system = ulong.Parse(parts[3]);
            ulong idle = ulong.Parse(parts[4]);
            ulong iowait = parts.Length > 5 ? ulong.Parse(parts[5]) : 0;
            var idleAll = idle + iowait;
            var total = user + nice + system + idleAll;
            for (var i = 6; i < parts.Length; i++) total += ulong.Parse(parts[i]);
            double? cpu = null;
            if (_hasCpu)
            {
                var idleDelta = idleAll - _lastIdle;
                var totalDelta = total - _lastTotal;
                if (totalDelta > 0)
                {
                    var busy = totalDelta > idleDelta ? totalDelta - idleDelta : 0;
                    cpu = Math.Clamp(busy * 100d / totalDelta, 0d, 100d);
                }
            }
            _lastIdle = idleAll;
            _lastTotal = total;
            _hasCpu = true;
            return cpu;
        }
        catch (Exception)
        {
            return null;
        }
    }

    private static long? ReadMemory(out long? total)
    {
        total = null;
        try
        {
            if (!File.Exists("/proc/meminfo")) return null;
            long? memTotal = null;
            long? memAvailable = null;
            foreach (var line in File.ReadLines("/proc/meminfo"))
            {
                if (line.StartsWith("MemTotal:", StringComparison.Ordinal)) memTotal = ParseKb(line);
                else if (line.StartsWith("MemAvailable:", StringComparison.Ordinal)) memAvailable = ParseKb(line);
            }
            if (memTotal is null or <= 0) return null;
            total = memTotal;
            if (memAvailable is null) return null;
            var used = memTotal.Value > memAvailable.Value ? memTotal.Value - memAvailable.Value : 0;
            return used;
        }
        catch (Exception)
        {
            return null;
        }
    }

    private static long? ParseKb(string line)
    {
        var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length < 2 || !ulong.TryParse(parts[1], out var kb)) return null;
        var bytes = kb * 1024UL;
        return bytes > long.MaxValue ? null : (long)bytes;
    }

    private static long? ReadDisk(out long? total)
    {
        total = null;
        try
        {
            var root = Path.GetPathRoot(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile));
            if (string.IsNullOrWhiteSpace(root)) root = "/";
            var info = new DriveInfo(root);
            if (!info.IsReady) return null;
            total = info.TotalSize;
            return info.AvailableFreeSpace;
        }
        catch (Exception)
        {
            return null;
        }
    }

    private static string? ReadOsRelease()
    {
        try
        {
            if (!File.Exists("/etc/os-release")) return null;
            foreach (var line in File.ReadLines("/etc/os-release"))
            {
                if (!line.StartsWith("PRETTY_NAME=", StringComparison.Ordinal)) continue;
                return line["PRETTY_NAME=".Length..].Trim().Trim('"');
            }
        }
        catch (Exception)
        {
        }
        return null;
    }
}
