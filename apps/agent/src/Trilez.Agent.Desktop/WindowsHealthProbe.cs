using System.Runtime.InteropServices;
using Trilez.Agent.Presentation;

namespace Trilez.Agent.Desktop;

/// <summary>
/// Reads CPU, memory, and free disk space. The first CPU sample has no delta and is omitted.
/// User names, window titles, keystrokes, clipboard text, and screen images are not read.
/// </summary>
public sealed class WindowsHealthProbe : IHealthProbe
{
    private ulong _lastIdle;
    private ulong _lastKernel;
    private ulong _lastUser;
    private bool _hasCpu;

    public HealthReading Read()
    {
        double? cpu = null;
        long? memoryUsed = null;
        long? memoryTotal = null;
        long? diskFree = null;
        long? diskTotal = null;
        try
        {
            if (GetSystemTimes(out var idle, out var kernel, out var user))
            {
                var idleTicks = ToUInt64(idle);
                var kernelTicks = ToUInt64(kernel);
                var userTicks = ToUInt64(user);
                if (_hasCpu)
                {
                    var idleDelta = idleTicks - _lastIdle;
                    var total = (kernelTicks - _lastKernel) + (userTicks - _lastUser);
                    if (total > 0)
                    {
                        var busy = total > idleDelta ? total - idleDelta : 0;
                        cpu = Math.Clamp(busy * 100d / total, 0d, 100d);
                    }
                }
                _lastIdle = idleTicks;
                _lastKernel = kernelTicks;
                _lastUser = userTicks;
                _hasCpu = true;
            }
        }
        catch (Exception)
        {
            cpu = null;
        }

        try
        {
            var status = new MemoryStatusEx { Length = (uint)Marshal.SizeOf<MemoryStatusEx>() };
            if (GlobalMemoryStatusEx(ref status) && status.TotalPhysical > 0)
            {
                memoryTotal = ToLong(status.TotalPhysical);
                var used = status.TotalPhysical > status.AvailablePhysical ? status.TotalPhysical - status.AvailablePhysical : 0;
                memoryUsed = ToLong(used);
            }
        }
        catch (Exception)
        {
            memoryUsed = null;
            memoryTotal = null;
        }

        try
        {
            var root = Path.GetPathRoot(Environment.SystemDirectory);
            if (!string.IsNullOrWhiteSpace(root) && GetDiskFreeSpaceEx(root, out var free, out var total, out _))
            {
                diskFree = ToLong(free);
                diskTotal = ToLong(total);
            }
        }
        catch (Exception)
        {
            diskFree = null;
            diskTotal = null;
        }

        return new HealthReading
        {
            CpuPercent = cpu,
            MemoryUsedBytes = memoryUsed,
            MemoryTotalBytes = memoryTotal,
            DiskFreeBytes = diskFree,
            DiskTotalBytes = diskTotal,
            OsName = Environment.OSVersion.VersionString,
            OsVersion = Environment.OSVersion.Version.ToString(),
            Architecture = RuntimeInformation.OSArchitecture.ToString(),
        };
    }

    private static ulong ToUInt64(FileTime value) => ((ulong)value.High << 32) | value.Low;

    private static long? ToLong(ulong value) => value > long.MaxValue ? null : (long)value;

    [StructLayout(LayoutKind.Sequential)]
    private struct FileTime
    {
        public uint Low;
        public uint High;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MemoryStatusEx
    {
        public uint Length;
        public uint MemoryLoad;
        public ulong TotalPhysical;
        public ulong AvailablePhysical;
        public ulong TotalPageFile;
        public ulong AvailablePageFile;
        public ulong TotalVirtual;
        public ulong AvailableVirtual;
        public ulong AvailableExtendedVirtual;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetSystemTimes(out FileTime idle, out FileTime kernel, out FileTime user);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GlobalMemoryStatusEx(ref MemoryStatusEx status);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool GetDiskFreeSpaceEx(string directory, out ulong freeBytesAvailable, out ulong totalBytes, out ulong totalFreeBytes);
}
