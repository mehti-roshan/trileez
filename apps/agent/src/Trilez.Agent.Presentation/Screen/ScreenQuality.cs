namespace Trilez.Agent.Presentation;

/// <summary>
/// Caps for the existing JPEG relay. Adaptation may move down the ladder.
/// It never raises frame rate, edge, or quality above the configured profile.
/// </summary>
public readonly record struct ScreenQualityProfile(string Mode, int MaxFps, int MaxEdge, int JpegQuality)
{
    public const int MaxFrameBytes = 400_000;
}

public readonly record struct ScreenCaptureProfile(int MaxEdge, int JpegQuality, int MaxBytes, bool AllMonitors);

public readonly record struct ScreenMonitorRect(int X, int Y, int Width, int Height);

public sealed class ScreenCaptureSettings
{
    public string Mode { get; init; } = "assistance";
    public int Fps { get; init; } = 2;
    public int Edge { get; init; } = 1280;
    public int Quality { get; init; } = 60;
    public bool FellBack { get; init; }
    public string RequestedMode { get; init; } = "assistance";

    public bool SameRung(ScreenCaptureSettings other) =>
        Mode == other.Mode && Fps == other.Fps && Edge == other.Edge && Quality == other.Quality && FellBack == other.FellBack;
}

public readonly record struct ScreenTransferSample(
    DateTimeOffset At,
    int Bytes,
    int? UploadMilliseconds,
    bool Accepted,
    bool Dropped,
    bool CaptureFailed);

public sealed class ScreenShareMetrics
{
    public double? ActualFps { get; init; }
    public int? LatencyMs { get; init; }
    public int? BandwidthBytesPerSecond { get; init; }
    public int CaptureFailures { get; init; }
    public int DroppedFrames { get; init; }
    public int AcceptedFrames { get; init; }
}

public static class ScreenCaptureLayout
{
    public static ScreenMonitorRect Union(IReadOnlyList<ScreenMonitorRect> monitors)
    {
        if (monitors.Count == 0) return default;
        var left = monitors.Min(item => item.X);
        var top = monitors.Min(item => item.Y);
        var right = monitors.Max(item => item.X + item.Width);
        var bottom = monitors.Max(item => item.Y + item.Height);
        return new ScreenMonitorRect(left, top, Math.Max(0, right - left), Math.Max(0, bottom - top));
    }

    public static ScreenMonitorRect Primary(IReadOnlyList<ScreenMonitorRect> monitors)
    {
        if (monitors.Count == 0) return default;
        foreach (var monitor in monitors)
        {
            if (monitor.Width <= 0 || monitor.Height <= 0) continue;
            if (monitor.X <= 0 && monitor.Y <= 0 && monitor.X + monitor.Width > 0 && monitor.Y + monitor.Height > 0)
                return monitor;
        }
        return monitors[0];
    }

    public static ScreenMonitorRect Select(IReadOnlyList<ScreenMonitorRect> monitors, bool allMonitors) =>
        allMonitors && monitors.Count > 1 ? Union(monitors) : Primary(monitors);
}

public static class ScreenQuality
{
    public static ScreenQualityProfile Clamp(string? mode, int? fps, int? edge, int? quality)
    {
        if (string.Equals(mode, "high", StringComparison.Ordinal))
            return new ScreenQualityProfile("high", ClampInt(fps, 30, 15, 30), ClampInt(edge, 1920, 640, 1920), ClampInt(quality, 75, 40, 85));
        return new ScreenQualityProfile("assistance", ClampInt(fps, 2, 1, 5), ClampInt(edge, 1280, 640, 1280), ClampInt(quality, 60, 30, 70));
    }

    public static TimeSpan IntervalFor(ScreenCaptureSettings settings)
    {
        var fps = Math.Max(1, settings.Fps);
        var ms = 1000.0 / fps;
        if (settings.Mode == "high" && !settings.FellBack)
        {
            if (ms < 1000.0 / 30.0) ms = 1000.0 / 30.0;
            if (ms > 1000.0 / 15.0) ms = 1000.0 / 15.0;
        }
        else
        {
            if (ms < 200) ms = 200;
            if (ms > 1000) ms = 1000;
        }
        return TimeSpan.FromMilliseconds(ms);
    }

    public static IReadOnlyList<ScreenCaptureSettings> BuildLadder(ScreenQualityProfile cap)
    {
        var rungs = new List<ScreenCaptureSettings>();
        void Add(string mode, int fps, int edge, int quality, bool fellBack)
        {
            var rung = new ScreenCaptureSettings
            {
                Mode = mode,
                Fps = Math.Clamp(fps, 1, Math.Max(1, cap.MaxFps)),
                Edge = Math.Clamp(edge, 640, Math.Max(640, cap.MaxEdge)),
                Quality = Math.Clamp(quality, 30, Math.Max(30, cap.JpegQuality)),
                FellBack = fellBack,
                RequestedMode = cap.Mode,
            };
            if (rungs.Exists(existing => existing.SameRung(rung))) return;
            rungs.Add(rung);
        }

        if (cap.Mode == "high")
        {
            Add("assistance", 2, Math.Min(1280, cap.MaxEdge), Math.Min(60, cap.JpegQuality), true);
            Add("high", Math.Min(15, cap.MaxFps), Math.Min(1280, cap.MaxEdge), Math.Min(50, cap.JpegQuality), false);
            Add("high", cap.MaxFps, cap.MaxEdge, cap.JpegQuality, false);
        }
        else
        {
            Add("assistance", 1, Math.Min(640, cap.MaxEdge), Math.Min(40, cap.JpegQuality), false);
            Add("assistance", cap.MaxFps, cap.MaxEdge, cap.JpegQuality, false);
        }
        return rungs;
    }

    private static int ClampInt(int? value, int fallback, int min, int max)
    {
        var parsed = value ?? fallback;
        if (parsed < min) return min;
        if (parsed > max) return max;
        return parsed;
    }
}

public sealed class ScreenRateController
{
    private readonly TimeSpan _cooldown;
    private readonly List<ScreenTransferSample> _samples = [];
    private IReadOnlyList<ScreenCaptureSettings> _ladder = [];
    private ScreenQualityProfile _configured;
    private int _index;
    private DateTimeOffset? _lastStep;

    public ScreenRateController(TimeSpan? stepCooldown = null)
    {
        _cooldown = stepCooldown is { } value && value > TimeSpan.Zero ? value : stepCooldown ?? TimeSpan.FromSeconds(1);
        if (_cooldown < TimeSpan.Zero) _cooldown = TimeSpan.Zero;
        Configure(ScreenQuality.Clamp(null, null, null, null));
    }

    public ScreenQualityProfile Configured => _configured;
    public ScreenCaptureSettings Effective => _ladder[Math.Clamp(_index, 0, Math.Max(0, _ladder.Count - 1))];
    public ScreenShareMetrics Metrics { get; private set; } = new();
    public int CaptureFailures { get; private set; }
    public int DroppedFrames { get; private set; }
    public int AcceptedFrames { get; private set; }

    public void Configure(ScreenQualityProfile profile)
    {
        if (_ladder.Count > 0 && _configured.Equals(profile)) return;
        _configured = profile;
        _ladder = ScreenQuality.BuildLadder(profile);
        _index = _ladder.Count - 1;
        _samples.Clear();
        _lastStep = null;
        CaptureFailures = 0;
        DroppedFrames = 0;
        AcceptedFrames = 0;
        Metrics = new ScreenShareMetrics();
    }

    public void Observe(ScreenTransferSample sample)
    {
        if (sample.CaptureFailed) CaptureFailures++;
        if (sample.Dropped) DroppedFrames++;
        if (sample.Accepted) AcceptedFrames++;
        _samples.Add(sample);
        var cutoff = sample.At.AddSeconds(-1);
        _samples.RemoveAll(item => item.At < cutoff);
        Metrics = Compute();
        if (_lastStep is DateTimeOffset last && sample.At - last < _cooldown) return;
        if (ShouldStepDown())
        {
            if (_index > 0)
            {
                _index--;
                _lastStep = sample.At;
            }
            return;
        }
        if (ShouldStepUp() && _index < _ladder.Count - 1)
        {
            _index++;
            _lastStep = sample.At;
        }
    }

    private ScreenShareMetrics Compute()
    {
        var accepted = _samples.Where(item => item.Accepted).OrderBy(item => item.At).ToArray();
        double? fps = null;
        int? bandwidth = null;
        if (accepted.Length >= 2)
        {
            var span = (accepted[^1].At - accepted[0].At).TotalSeconds;
            if (span >= 0.5)
            {
                fps = (accepted.Length - 1) / span;
                bandwidth = (int)Math.Round(accepted.Sum(item => item.Bytes) / span);
            }
        }
        int? latency = accepted.Length == 0 ? null : (int)Math.Round(accepted.Average(item => item.UploadMilliseconds ?? 0));
        return new ScreenShareMetrics
        {
            ActualFps = fps,
            LatencyMs = latency,
            BandwidthBytesPerSecond = bandwidth,
            CaptureFailures = CaptureFailures,
            DroppedFrames = DroppedFrames,
            AcceptedFrames = AcceptedFrames,
        };
    }

    private bool ShouldStepDown()
    {
        if (_samples.Count(item => item.CaptureFailed) >= 2 || _samples.Count(item => item.Dropped) >= 2) return true;
        var accepted = _samples.Where(item => item.Accepted).ToArray();
        if (accepted.Length < 2) return false;
        var averageRtt = accepted.Average(item => item.UploadMilliseconds ?? 0);
        var budget = 1000.0 / Math.Max(1, Effective.Fps);
        if (averageRtt > budget * 1.25) return true;
        var elapsedMs = (accepted.Max(item => item.At) - accepted.Min(item => item.At)).TotalMilliseconds;
        if (elapsedMs < 200) return false;
        var bytesPerSecond = accepted.Sum(item => item.Bytes) / (elapsedMs / 1000.0);
        var needed = accepted.Average(item => item.Bytes) * Effective.Fps;
        return bytesPerSecond < needed * 0.85;
    }

    private bool ShouldStepUp()
    {
        if (_samples.Any(item => item.Dropped || item.CaptureFailed)) return false;
        var accepted = _samples.Where(item => item.Accepted).ToArray();
        if (accepted.Length < 4) return false;
        var elapsedMs = (accepted.Max(item => item.At) - accepted.Min(item => item.At)).TotalMilliseconds;
        if (elapsedMs < 500) return false;
        var averageRtt = accepted.Average(item => item.UploadMilliseconds ?? 0);
        var budget = 1000.0 / Math.Max(1, Effective.Fps);
        return averageRtt < budget * 0.5;
    }
}
