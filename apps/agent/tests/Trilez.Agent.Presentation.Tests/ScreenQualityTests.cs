using Trilez.Agent.Presentation;
using Xunit;

namespace Trilez.Agent.Presentation.Tests;

public sealed class ScreenQualityTests
{
    [Fact]
    public void ConfiguredCeilingsStayInsideTheMode()
    {
        var assistance = ScreenQuality.Clamp(null, null, null, null);
        Assert.Equal("assistance", assistance.Mode);
        Assert.Equal(2, assistance.MaxFps);
        Assert.Equal(1280, assistance.MaxEdge);
        Assert.Equal(60, assistance.JpegQuality);

        var raised = ScreenQuality.Clamp("assistance", 60, 4000, 99);
        Assert.Equal(5, raised.MaxFps);
        Assert.Equal(1280, raised.MaxEdge);
        Assert.Equal(70, raised.JpegQuality);

        var high = ScreenQuality.Clamp("high", 60, 4000, 99);
        Assert.Equal(30, high.MaxFps);
        Assert.Equal(1920, high.MaxEdge);
        Assert.Equal(85, high.JpegQuality);

        var capped = ScreenQuality.Clamp("high", 18, 1280, 50);
        Assert.Equal(18, capped.MaxFps);
        foreach (var rung in ScreenQuality.BuildLadder(capped))
        {
            Assert.True(rung.Fps <= 18);
            Assert.True(rung.Edge <= 1280);
            Assert.True(rung.Quality <= 50);
        }

        Assert.InRange(ScreenQuality.IntervalFor(new ScreenCaptureSettings { Mode = "high", Fps = 30 }).TotalMilliseconds, 33, 34);
        Assert.InRange(ScreenQuality.IntervalFor(new ScreenCaptureSettings { Mode = "high", Fps = 15 }).TotalMilliseconds, 66, 67);
        Assert.Equal(500, ScreenQuality.IntervalFor(new ScreenCaptureSettings { Mode = "assistance", Fps = 2 }).TotalMilliseconds);
        Assert.Equal(200, ScreenQuality.IntervalFor(new ScreenCaptureSettings { Mode = "assistance", Fps = 5 }).TotalMilliseconds);
        Assert.Equal(500, ScreenQuality.IntervalFor(new ScreenCaptureSettings { Mode = "assistance", Fps = 2, FellBack = true }).TotalMilliseconds);
    }

    [Fact]
    public void DegradationStepsDownAndDoesNotClimbAboveTheCap()
    {
        var controller = new ScreenRateController(TimeSpan.Zero);
        controller.Configure(ScreenQuality.Clamp("high", 30, 1920, 75));
        Assert.Equal(30, controller.Effective.Fps);
        Assert.Equal(1920, controller.Effective.Edge);
        Assert.False(controller.Effective.FellBack);

        var origin = DateTimeOffset.Parse("2026-10-16T08:00:00Z");
        controller.Observe(Slow(origin, 0));
        Assert.Equal(30, controller.Effective.Fps);
        controller.Observe(Slow(origin.AddMilliseconds(40), 1));
        Assert.Equal(15, controller.Effective.Fps);
        Assert.False(controller.Effective.FellBack);
        controller.Observe(Slow(origin.AddMilliseconds(80), 2));
        Assert.True(controller.Effective.FellBack);
        Assert.Equal("assistance", controller.Effective.Mode);
        Assert.Equal(2, controller.Effective.Fps);
        Assert.True(controller.Effective.Fps <= controller.Configured.MaxFps);

        var recovered = origin.AddSeconds(2);
        for (var index = 0; index < 4; index++)
            controller.Observe(Fast(recovered.AddMilliseconds(index * 200), index));
        Assert.Equal("high", controller.Effective.Mode);
        Assert.Equal(15, controller.Effective.Fps);
        Assert.True(controller.Effective.Fps <= 30);
        Assert.True(controller.Effective.Edge <= 1920);
    }

    [Fact]
    public void MeasuredRateComesFromSamplesAndBusyFramesAreDropped()
    {
        var controller = new ScreenRateController(TimeSpan.FromSeconds(5));
        controller.Configure(ScreenQuality.Clamp("high", 30, 1920, 75));
        var origin = DateTimeOffset.Parse("2026-10-16T08:00:00Z");
        for (var index = 0; index < 16; index++)
            controller.Observe(new ScreenTransferSample(origin.AddMilliseconds(index * 34), 10_000, 5, true, false, false));
        Assert.NotNull(controller.Metrics.ActualFps);
        Assert.InRange(controller.Metrics.ActualFps!.Value, 28, 31);
        Assert.Equal(5, controller.Metrics.LatencyMs);
        Assert.True(controller.Metrics.BandwidthBytesPerSecond > 0);
        Assert.Equal(30, controller.Effective.Fps);

        controller.Observe(new ScreenTransferSample(origin.AddSeconds(2), 0, null, false, true, false));
        controller.Observe(new ScreenTransferSample(origin.AddSeconds(2.1), 0, null, false, true, false));
        Assert.Equal(2, controller.DroppedFrames);
        Assert.True(controller.Effective.Fps < 30);
    }

    [Fact]
    public void CaptureFailuresStepDownAndMonitorLayoutUsesEveryDisplay()
    {
        var controller = new ScreenRateController(TimeSpan.Zero);
        controller.Configure(ScreenQuality.Clamp("assistance", 2, 1280, 60));
        var origin = DateTimeOffset.Parse("2026-10-16T08:00:00Z");
        controller.Observe(new ScreenTransferSample(origin, 0, null, false, false, true));
        Assert.Equal(2, controller.Effective.Fps);
        controller.Observe(new ScreenTransferSample(origin.AddMilliseconds(10), 0, null, false, false, true));
        Assert.Equal(1, controller.CaptureFailures == 2 ? controller.Effective.Fps : 0);
        Assert.Equal(2, controller.CaptureFailures);
        Assert.Equal(1, controller.Effective.Fps);

        var monitors = new[]
        {
            new ScreenMonitorRect(0, 0, 1920, 1080),
            new ScreenMonitorRect(1920, 0, 1280, 1024),
        };
        var union = ScreenCaptureLayout.Union(monitors);
        Assert.Equal(new ScreenMonitorRect(0, 0, 3200, 1080), union);
        Assert.Equal(monitors[0], ScreenCaptureLayout.Primary(monitors));
        Assert.Equal(union, ScreenCaptureLayout.Select(monitors, allMonitors: true));
        Assert.Equal(monitors[0], ScreenCaptureLayout.Select(monitors, allMonitors: false));
    }

    private static ScreenTransferSample Slow(DateTimeOffset at, int index) =>
        new(at, 80_000, 200, true, false, false);

    private static ScreenTransferSample Fast(DateTimeOffset at, int index) =>
        new(at, 20_000, 20, true, false, false);
}
