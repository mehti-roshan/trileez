using Trilez.Agent;
using Xunit;

namespace Trilez.Agent.Core.Tests;

public sealed class UsageAggregatorTests
{
    [Fact]
    public void ActiveForegroundTimeAccumulatesInsideOneBucket()
    {
        var clock = new ManualUsageClock();
        var aggregator = new UsageAggregator(clock, TimeSpan.FromSeconds(1));
        aggregator.StartSession();
        aggregator.Observe(Active("Notepad"));
        clock.Advance(TimeSpan.FromMilliseconds(1000));
        aggregator.Observe(Active("Notepad"));
        clock.Advance(TimeSpan.FromMilliseconds(1200));
        aggregator.Observe(Active("Notepad"));

        var interval = Assert.Single(aggregator.Intervals);
        Assert.Equal("Notepad", interval.ProcessName);
        Assert.Equal(2200, interval.DurationMs);
        Assert.True(aggregator.Session!.Open);
    }

    [Fact]
    public void SwitchingCreditsOnlyThePreviousApplication()
    {
        var clock = new ManualUsageClock();
        var aggregator = new UsageAggregator(clock, TimeSpan.FromSeconds(1));
        aggregator.StartSession();
        aggregator.Observe(Active("Notepad"));
        clock.Advance(TimeSpan.FromSeconds(1));
        aggregator.Observe(Active("Notepad"));
        clock.Advance(TimeSpan.FromSeconds(1));
        aggregator.Observe(Active("Code"));
        clock.Advance(TimeSpan.FromSeconds(1));
        aggregator.Observe(Active("Code"));

        Assert.Equal(2000, Duration(aggregator, "Notepad"));
        Assert.Equal(1000, Duration(aggregator, "Code"));
        Assert.Equal(3000, aggregator.Intervals.Sum(interval => interval.DurationMs));
    }

    [Fact]
    public void IdleDoesNotCreditTheOpenProcess()
    {
        var clock = new ManualUsageClock();
        var aggregator = new UsageAggregator(clock, TimeSpan.FromSeconds(1));
        aggregator.StartSession();
        aggregator.Observe(Active("Notepad"));
        clock.Advance(TimeSpan.FromSeconds(1));
        aggregator.Observe(Active("Notepad"));
        clock.Advance(TimeSpan.FromSeconds(1));
        aggregator.Observe(new UsageObservation(null, null, true, UsageBoundary.None));
        clock.Advance(TimeSpan.FromSeconds(1));
        aggregator.Observe(Active("Notepad"));
        clock.Advance(TimeSpan.FromSeconds(1));
        aggregator.Observe(Active("Notepad"));

        Assert.Equal(2000, Duration(aggregator, "Notepad"));
    }

    [Fact]
    public void ALargeGapEndsTheSessionAsSleepWithoutCreditingIt()
    {
        var clock = new ManualUsageClock();
        var aggregator = new UsageAggregator(clock, TimeSpan.FromSeconds(1));
        aggregator.StartSession();
        aggregator.Observe(Active("Notepad"));
        clock.Advance(TimeSpan.FromSeconds(1));
        aggregator.Observe(Active("Notepad"));
        clock.Advance(TimeSpan.FromSeconds(10));
        aggregator.Observe(Active("Notepad"));

        Assert.Equal(1000, Duration(aggregator, "Notepad"));
        Assert.False(aggregator.Session!.Open);
        Assert.Equal("sleep", aggregator.Session.EndReason);
        Assert.Equal(clock.UtcNow.AddSeconds(-10), aggregator.Session.EndedAt);
    }

    [Fact]
    public void LockEndsTheSessionWithoutThePartialInterval()
    {
        var clock = new ManualUsageClock();
        var aggregator = new UsageAggregator(clock, TimeSpan.FromSeconds(1));
        aggregator.StartSession();
        aggregator.Observe(Active("Notepad"));
        clock.Advance(TimeSpan.FromSeconds(1));
        aggregator.Observe(Active("Notepad"));
        clock.Advance(TimeSpan.FromMilliseconds(400));
        aggregator.Observe(new UsageObservation("LockApp", null, false, UsageBoundary.Lock));

        Assert.Equal(1000, Duration(aggregator, "Notepad"));
        Assert.False(aggregator.Session!.Open);
        Assert.Equal("lock", aggregator.Session.EndReason);
        Assert.DoesNotContain(aggregator.Intervals, interval => interval.ProcessName == "LockApp");
    }

    [Fact]
    public void DurationSplitsAcrossWallClockBuckets()
    {
        var clock = new ManualUsageClock { UtcNow = DateTimeOffset.FromUnixTimeSeconds(100).AddMilliseconds(1500) };
        var aggregator = new UsageAggregator(clock, TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(2));
        aggregator.StartSession();
        aggregator.Observe(Active("Notepad"));
        clock.Advance(TimeSpan.FromMilliseconds(1000));
        aggregator.Observe(Active("Notepad"));

        Assert.Equal(2, aggregator.Intervals.Count);
        Assert.Equal(1000, aggregator.Intervals.Sum(interval => interval.DurationMs));
        Assert.Equal(500, aggregator.Intervals.Min(interval => interval.DurationMs));
        Assert.Equal(DateTimeOffset.FromUnixTimeSeconds(100), aggregator.Intervals.Min(interval => interval.StartedAt));
        Assert.Equal(DateTimeOffset.FromUnixTimeSeconds(102), aggregator.Intervals.Max(interval => interval.StartedAt));
    }

    [Fact]
    public void APathOrWindowTitleIsNotAProcessName()
    {
        Assert.False(UsageAggregator.TryProcess(@"C:\Users\secret\notepad.exe", out _));
        Assert.False(UsageAggregator.TryProcess("report.docx - Notepad!", out _));
        Assert.False(UsageAggregator.TryProcess("", out _));
        Assert.True(UsageAggregator.TryProcess("Notepad", out var name));
        Assert.Equal("Notepad", name);
        var display = UsageAggregator.Display(@"C:\secret\Notepad");
        Assert.NotNull(display);
        Assert.DoesNotContain("\\", display);
        Assert.DoesNotContain("/", display);
        Assert.Null(UsageAggregator.Display(""));
    }

    private static UsageObservation Active(string process) => new(process, process, false, UsageBoundary.None);

    private static long Duration(UsageAggregator aggregator, string process) =>
        aggregator.Intervals.Where(interval => interval.ProcessName == process).Sum(interval => interval.DurationMs);

    private sealed class ManualUsageClock : IUsageClock
    {
        public long Timestamp { get; set; }
        public DateTimeOffset UtcNow { get; set; } = DateTimeOffset.Parse("2026-10-16T08:00:00Z");
        public TimeSpan Elapsed(long startedAt, long endedAt) => TimeSpan.FromMilliseconds(endedAt - startedAt);
        public void Advance(TimeSpan by)
        {
            Timestamp += (long)by.TotalMilliseconds;
            UtcNow = UtcNow.Add(by);
        }
    }
}
