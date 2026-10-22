namespace Trilez.Agent.Presentation;

public interface IHeartbeatTicker
{
    void Start(TimeSpan interval, Func<CancellationToken, Task> beat);
    void Stop();
}

public sealed class IdleHeartbeatTicker : IHeartbeatTicker
{
    public void Start(TimeSpan interval, Func<CancellationToken, Task> beat) { }
    public void Stop() { }
}

public sealed class ManualHeartbeatTicker : IHeartbeatTicker
{
    private Func<CancellationToken, Task>? _beat;

    public bool IsRunning { get; private set; }

    public void Start(TimeSpan interval, Func<CancellationToken, Task> beat)
    {
        _beat = beat ?? throw new ArgumentNullException(nameof(beat));
        IsRunning = true;
    }

    public void Stop()
    {
        IsRunning = false;
        _beat = null;
    }

    public Task PulseAsync() => _beat?.Invoke(CancellationToken.None) ?? Task.CompletedTask;
}

/// <summary>Runs heartbeats off the caller thread. Stop does not wait, so it is safe to call from a beat.</summary>
public sealed class PeriodicHeartbeatTicker : IHeartbeatTicker
{
    public static readonly TimeSpan Interval = TimeSpan.FromSeconds(60);
    private CancellationTokenSource? _cancel;

    public void Start(TimeSpan interval, Func<CancellationToken, Task> beat)
    {
        Stop();
        var cancel = new CancellationTokenSource();
        _cancel = cancel;
        _ = Task.Run(() => LoopAsync(interval, beat, cancel.Token));
    }

    public void Stop()
    {
        var cancel = _cancel;
        _cancel = null;
        if (cancel is null) return;
        try { cancel.Cancel(); }
        catch (ObjectDisposedException) { }
    }

    private static async Task LoopAsync(TimeSpan interval, Func<CancellationToken, Task> beat, CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(interval);
        try
        {
            while (await timer.WaitForNextTickAsync(cancellationToken))
            {
                try { await beat(cancellationToken); }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { break; }
                catch (Exception) { }
            }
        }
        catch (OperationCanceledException) { }
    }
}
