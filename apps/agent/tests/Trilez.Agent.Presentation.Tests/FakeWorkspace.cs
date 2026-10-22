using Trilez.Agent;
using Trilez.Agent.Presentation;

namespace Trilez.Agent.Presentation.Tests;

internal sealed class FakeWorkspace : IEmployeeWorkspace
{
    public AgentSettings CurrentSettings { get; set; } = new();
    public bool IsSignedIn { get; set; }
    public DateTimeOffset? LastSuccessfulSyncUtc { get; set; }
    public DeviceEnrollmentSnapshot Enrollment { get; set; } = DeviceEnrollmentSnapshot.Unenrolled();
    public UsageSnapshot Usage { get; set; } = UsageSnapshot.Stopped();
    public HealthSnapshot Health { get; set; } = HealthSnapshot.Stopped();
    public ScreenShareSnapshot ScreenShare { get; set; } = ScreenShareSnapshot.Unavailable();
    public event EventHandler? EnrollmentChanged;
    public event EventHandler? UsageChanged;
    public event EventHandler? HealthChanged;
    public event EventHandler? ScreenShareChanged;
    public int AcceptScreenCalls { get; private set; }
    public int StopScreenCalls { get; private set; }
    public int ControlCalls { get; private set; }
    public string? LastControlAction { get; private set; }
    public Func<string, ScreenCommandResult>? OnControl { get; set; }
    public int PauseCalls { get; private set; }
    public bool? LastPaused { get; private set; }
    public Func<bool, UsageCommandResult>? OnPause { get; set; }
    public int EnrollCalls { get; private set; }
    public int UnregisterCalls { get; private set; }
    public string? LastDeviceName { get; private set; }
    public Func<string, DeviceCommandResult>? OnEnroll { get; set; }
    public Func<DeviceCommandResult>? OnUnregister { get; set; }
    public int SignInCalls { get; private set; }
    public int SubmitCalls { get; private set; }
    public int SaveCalls { get; private set; }
    public string? LastPassword { get; private set; }
    public TimeEntryDraft? LastDraft { get; private set; }
    public TaskCompletionSource<bool>? SignInStarted { get; set; }
    public TaskCompletionSource<SignInResult>? SignInGate { get; set; }
    public TaskCompletionSource<bool>? SubmitStarted { get; set; }
    public TaskCompletionSource<TimeEntrySubmission>? SubmitGate { get; set; }
    public Func<string, string, string, SignInResult>? OnSignIn { get; set; }
    public Func<TimeEntryDraft, TimeEntrySubmission>? OnSubmit { get; set; }
    public Func<EmployeeSync>? OnRefresh { get; set; }
    public Exception? ThrowOnSignIn { get; set; }

    public Task<SignInResult> SignInAsync(string apiBaseUrl, string email, string password, CancellationToken cancellationToken = default)
    {
        SignInCalls++;
        LastPassword = password;
        SignInStarted?.TrySetResult(true);
        if (SignInGate is not null) return SignInGate.Task;
        if (ThrowOnSignIn is not null) throw ThrowOnSignIn;
        if (OnSignIn is null) throw new InvalidOperationException("Sign-in was not expected.");
        return Task.FromResult(OnSignIn(apiBaseUrl, email, password));
    }

    public Task SignOutAsync(CancellationToken cancellationToken = default)
    {
        IsSignedIn = false;
        return Task.CompletedTask;
    }

    public Task<EmployeeSync> RefreshAsync(CancellationToken cancellationToken = default)
    {
        if (OnRefresh is null) throw new InvalidOperationException("Refresh was not expected.");
        return Task.FromResult(OnRefresh());
    }

    public Task<TimeEntrySubmission> SubmitTimeEntryAsync(TimeEntryDraft draft, CancellationToken cancellationToken = default)
    {
        SubmitCalls++;
        LastDraft = draft;
        SubmitStarted?.TrySetResult(true);
        if (SubmitGate is not null) return SubmitGate.Task;
        if (OnSubmit is null) throw new InvalidOperationException("Time entry was not expected.");
        return Task.FromResult(OnSubmit(draft));
    }

    public void NotifyEnrollmentChanged() => EnrollmentChanged?.Invoke(this, EventArgs.Empty);

    public void NotifyUsageChanged() => UsageChanged?.Invoke(this, EventArgs.Empty);

    public void NotifyHealthChanged() => HealthChanged?.Invoke(this, EventArgs.Empty);

    public void NotifyScreenChanged() => ScreenShareChanged?.Invoke(this, EventArgs.Empty);

    public Task<ScreenCommandResult> AcceptScreenShareAsync(CancellationToken cancellationToken = default)
    {
        AcceptScreenCalls++;
        return Task.FromResult(ScreenCommandResult.Ok(PresentationText.ScreenShareAccepted));
    }

    public Task<ScreenCommandResult> StopScreenShareAsync(CancellationToken cancellationToken = default)
    {
        StopScreenCalls++;
        return Task.FromResult(ScreenCommandResult.Ok(PresentationText.ScreenShareStoppedByEmployee));
    }

    public Task<ScreenCommandResult> DecideScreenControlAsync(string action, CancellationToken cancellationToken = default)
    {
        ControlCalls++;
        LastControlAction = action;
        return Task.FromResult(OnControl?.Invoke(action) ?? ScreenCommandResult.Ok(PresentationText.ScreenControlDecided));
    }

    public Task<UsageCommandResult> SetUsagePausedAsync(bool paused, CancellationToken cancellationToken = default)
    {
        PauseCalls++;
        LastPaused = paused;
        if (OnPause is null) throw new InvalidOperationException("Usage pause was not expected.");
        var result = OnPause(paused);
        UsageChanged?.Invoke(this, EventArgs.Empty);
        return Task.FromResult(result);
    }

    public Task<DeviceCommandResult> EnrollDeviceAsync(string deviceName, CancellationToken cancellationToken = default)
    {
        EnrollCalls++;
        LastDeviceName = deviceName;
        if (OnEnroll is null) throw new InvalidOperationException("Enrollment was not expected.");
        var result = OnEnroll(deviceName);
        Enrollment = result.Snapshot;
        EnrollmentChanged?.Invoke(this, EventArgs.Empty);
        return Task.FromResult(result);
    }

    public Task<DeviceCommandResult> UnregisterDeviceAsync(CancellationToken cancellationToken = default)
    {
        UnregisterCalls++;
        if (OnUnregister is null) throw new InvalidOperationException("Unregister was not expected.");
        var result = OnUnregister();
        Enrollment = result.Snapshot;
        EnrollmentChanged?.Invoke(this, EventArgs.Empty);
        return Task.FromResult(result);
    }

    public Task SaveSettingsAsync(AgentSettings settings, CancellationToken cancellationToken = default)
    {
        SaveCalls++;
        var origin = TrilezApiClient.NormalizeBase(settings.ApiBaseUrl).GetLeftPart(UriPartial.Authority);
        CurrentSettings = new AgentSettings
        {
            ApiBaseUrl = origin,
            LastSuccessfulSyncUtc = settings.LastSuccessfulSyncUtc,
            StartWithWindows = settings.StartWithWindows,
        };
        LastSuccessfulSyncUtc = settings.LastSuccessfulSyncUtc;
        return Task.CompletedTask;
    }
}
