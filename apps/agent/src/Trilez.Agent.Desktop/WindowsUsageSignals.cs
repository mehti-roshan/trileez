using Microsoft.Win32;
using Trilez.Agent.Presentation;

namespace Trilez.Agent.Desktop;

/// <summary>Turns session lock, logoff, shutdown, and suspend into collector boundaries. It does not record input.</summary>
public sealed class WindowsUsageSignals : IUsageSignals, IDisposable
{
    private readonly object _gate = new();
    private UsageBoundary _pending = UsageBoundary.None;
    private bool _locked;

    public WindowsUsageSignals()
    {
        SystemEvents.SessionSwitch += OnSession;
        SystemEvents.SessionEnding += OnEnding;
        SystemEvents.PowerModeChanged += OnPower;
    }

    public bool Locked
    {
        get { lock (_gate) return _locked; }
    }

    public UsageBoundary ConsumeBoundary()
    {
        lock (_gate)
        {
            var boundary = _pending;
            _pending = UsageBoundary.None;
            return boundary;
        }
    }

    public void Dispose()
    {
        SystemEvents.SessionSwitch -= OnSession;
        SystemEvents.SessionEnding -= OnEnding;
        SystemEvents.PowerModeChanged -= OnPower;
    }

    private void OnSession(object? sender, SessionSwitchEventArgs args)
    {
        if (args.Reason is SessionSwitchReason.SessionLock or SessionSwitchReason.SessionLogoff or SessionSwitchReason.ConsoleDisconnect or SessionSwitchReason.RemoteDisconnect)
        {
            var reason = args.Reason == SessionSwitchReason.SessionLogoff ? UsageBoundary.Logout : UsageBoundary.Lock;
            lock (_gate)
            {
                _locked = true;
                _pending = Stronger(_pending, reason);
            }
            return;
        }
        if (args.Reason is SessionSwitchReason.SessionUnlock or SessionSwitchReason.ConsoleConnect or SessionSwitchReason.RemoteConnect)
        {
            lock (_gate) { _locked = false; }
        }
    }

    private void OnEnding(object? sender, SessionEndingEventArgs args)
    {
        var reason = args.Reason == SessionEndReasons.SystemShutdown ? UsageBoundary.Shutdown : UsageBoundary.Logout;
        lock (_gate) { _pending = Stronger(_pending, reason); }
    }

    private void OnPower(object? sender, PowerModeChangedEventArgs args)
    {
        if (args.Mode != PowerModes.Suspend) return;
        lock (_gate) { _pending = Stronger(_pending, UsageBoundary.Sleep); }
    }

    private static UsageBoundary Stronger(UsageBoundary current, UsageBoundary next) =>
        Rank(next) > Rank(current) ? next : current;

    private static int Rank(UsageBoundary boundary) => boundary switch
    {
        UsageBoundary.Shutdown => 5,
        UsageBoundary.Logout => 4,
        UsageBoundary.Sleep => 3,
        UsageBoundary.Lock => 2,
        UsageBoundary.Restart => 1,
        _ => 0,
    };
}
