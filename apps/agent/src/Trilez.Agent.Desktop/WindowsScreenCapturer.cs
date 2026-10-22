using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using Trilez.Agent.Presentation;

namespace Trilez.Agent.Desktop;

/// <summary>
/// Captures the interactive desktop with GDI CopyFromScreen.
/// Assistance mode captures the primary display. High mode captures the virtual desktop when more than one monitor is reported.
/// Bitmap and Graphics are released before the method returns. This file compiles only with the Windows desktop project.
/// </summary>
public sealed class WindowsScreenCapturer : IScreenCapturer
{
    private const int SmCxScreen = 0;
    private const int SmCyScreen = 1;
    private ScreenCaptureProfile _profile = new(1280, 60, ScreenQualityProfile.MaxFrameBytes, false);
    private List<ScreenMonitorRect> _monitors = [];
    private ScreenMonitorRect _bounds;
    private bool _capturing;

    public bool IsCapturing => _capturing;
    public int MonitorCount => _monitors.Count;

    public void Start()
    {
        _capturing = true;
        ReadLayout();
    }

    public void Stop() => _capturing = false;

    public void ApplyProfile(ScreenCaptureProfile profile)
    {
        _profile = profile.MaxBytes > 0
            ? profile with { MaxBytes = Math.Min(profile.MaxBytes, ScreenQualityProfile.MaxFrameBytes) }
            : profile with { MaxBytes = ScreenQualityProfile.MaxFrameBytes };
        ReadLayout();
    }

    public byte[]? CaptureJpeg()
    {
        if (!_capturing) return null;
        if (_bounds.Width <= 0 || _bounds.Height <= 0) ReadLayout();
        if (_bounds.Width <= 0 || _bounds.Height <= 0) return null;
        try
        {
            if (_profile.AllMonitors && _monitors.Count > 1) return CaptureUnion();
            return CaptureRect(_bounds);
        }
        catch (Exception)
        {
            return null;
        }
    }

    public void Dispose() => Stop();

    private byte[]? CaptureRect(ScreenMonitorRect bounds)
    {
        Bitmap? source = null;
        Graphics? graphics = null;
        try
        {
            source = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format24bppRgb);
            graphics = Graphics.FromImage(source);
            graphics.CopyFromScreen(bounds.X, bounds.Y, 0, 0, new Size(bounds.Width, bounds.Height), CopyPixelOperation.SourceCopy);
            return Encode(source);
        }
        finally
        {
            graphics?.Dispose();
            source?.Dispose();
        }
    }

    private byte[]? CaptureUnion()
    {
        var longest = Math.Max(_bounds.Width, _bounds.Height);
        var scale = longest <= _profile.MaxEdge ? 1.0 : _profile.MaxEdge / (double)longest;
        var width = Math.Max(1, (int)Math.Round(_bounds.Width * scale));
        var height = Math.Max(1, (int)Math.Round(_bounds.Height * scale));
        using var destination = new Bitmap(width, height, PixelFormat.Format24bppRgb);
        using var canvas = Graphics.FromImage(destination);
        canvas.InterpolationMode = InterpolationMode.Bilinear;
        var captured = 0;
        foreach (var monitor in _monitors)
        {
            if (monitor.Width <= 0 || monitor.Height <= 0) continue;
            Bitmap? source = null;
            Graphics? graphics = null;
            try
            {
                source = new Bitmap(monitor.Width, monitor.Height, PixelFormat.Format24bppRgb);
                graphics = Graphics.FromImage(source);
                graphics.CopyFromScreen(monitor.X, monitor.Y, 0, 0, new Size(monitor.Width, monitor.Height), CopyPixelOperation.SourceCopy);
                var x = (int)Math.Round((monitor.X - _bounds.X) * scale);
                var y = (int)Math.Round((monitor.Y - _bounds.Y) * scale);
                var w = Math.Max(1, (int)Math.Round(monitor.Width * scale));
                var h = Math.Max(1, (int)Math.Round(monitor.Height * scale));
                canvas.DrawImage(source, x, y, w, h);
                captured++;
            }
            catch (Exception)
            {
                continue;
            }
            finally
            {
                graphics?.Dispose();
                source?.Dispose();
            }
        }
        if (captured == 0) return null;
        return Encode(destination);
    }

    private byte[]? Encode(Bitmap source)
    {
        var edge = Math.Max(320, _profile.MaxEdge);
        var quality = (long)Math.Clamp(_profile.JpegQuality, 30, 85);
        while (edge >= 320)
        {
            using var scaled = Scale(source, edge);
            var bytes = SaveJpeg(scaled, quality);
            if (bytes.Length <= _profile.MaxBytes && bytes.Length >= 4 && bytes[0] == 0xFF && bytes[1] == 0xD8) return bytes;
            if (quality > 30) quality = Math.Max(30, quality - 10);
            else
            {
                if (edge == 320) break;
                edge = Math.Max(320, edge / 2);
            }
        }
        return null;
    }

    private void ReadLayout()
    {
        var found = new List<ScreenMonitorRect>();
        MonitorProc proc = (IntPtr _monitor, IntPtr _hdc, ref Rect rect, IntPtr _data) =>
        {
            var width = rect.Right - rect.Left;
            var height = rect.Bottom - rect.Top;
            if (width > 0 && height > 0) found.Add(new ScreenMonitorRect(rect.Left, rect.Top, width, height));
            return true;
        };
        try
        {
            EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, proc, IntPtr.Zero);
        }
        catch (Exception)
        {
            found.Clear();
        }
        if (found.Count == 0)
        {
            var width = GetSystemMetrics(SmCxScreen);
            var height = GetSystemMetrics(SmCyScreen);
            if (width > 0 && height > 0) found.Add(new ScreenMonitorRect(0, 0, width, height));
        }
        _monitors = found;
        _bounds = ScreenCaptureLayout.Select(_monitors, _profile.AllMonitors);
    }

    private static Bitmap Scale(Bitmap source, int maxEdge)
    {
        var longest = Math.Max(source.Width, source.Height);
        if (longest <= maxEdge) return (Bitmap)source.Clone();
        var scale = maxEdge / (double)longest;
        var width = Math.Max(1, (int)Math.Round(source.Width * scale));
        var height = Math.Max(1, (int)Math.Round(source.Height * scale));
        var bitmap = new Bitmap(width, height, PixelFormat.Format24bppRgb);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.InterpolationMode = InterpolationMode.Bilinear;
        graphics.DrawImage(source, 0, 0, width, height);
        return bitmap;
    }

    private static byte[] SaveJpeg(Bitmap bitmap, long quality)
    {
        using var stream = new MemoryStream();
        var encoder = ImageCodecInfo.GetImageEncoders().FirstOrDefault(item => item.FormatID == ImageFormat.Jpeg.Guid);
        if (encoder is null)
        {
            bitmap.Save(stream, ImageFormat.Jpeg);
            return stream.ToArray();
        }
        using var parameters = new EncoderParameters(1);
        parameters.Param[0] = new EncoderParameter(Encoder.Quality, quality);
        bitmap.Save(stream, encoder, parameters);
        return stream.ToArray();
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Rect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    private delegate bool MonitorProc(IntPtr monitor, IntPtr hdc, ref Rect rect, IntPtr data);

    [DllImport("user32.dll")]
    private static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonitorProc proc, IntPtr data);

    [DllImport("user32.dll")]
    private static extern int GetSystemMetrics(int index);
}
