namespace Trilez.Agent.Presentation;

public interface IClock
{
    DateTimeOffset UtcNow { get; }
    DateOnly Today { get; }
}

public sealed class TehranClock : IClock
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
    public DateOnly Today => TehranCalendar.Today();
}

public interface IEmployeeWorkspace
{
    AgentSettings CurrentSettings { get; }
    bool IsSignedIn { get; }
    DateTimeOffset? LastSuccessfulSyncUtc { get; }
    DeviceEnrollmentSnapshot Enrollment { get; }
    UsageSnapshot Usage { get; }
    HealthSnapshot Health { get; }
    ScreenShareSnapshot ScreenShare { get; }
    event EventHandler? EnrollmentChanged;
    event EventHandler? UsageChanged;
    event EventHandler? HealthChanged;
    event EventHandler? ScreenShareChanged;
    Task<SignInResult> SignInAsync(string apiBaseUrl, string email, string password, CancellationToken cancellationToken = default);
    Task SignOutAsync(CancellationToken cancellationToken = default);
    Task<EmployeeSync> RefreshAsync(CancellationToken cancellationToken = default);
    Task<TimeEntrySubmission> SubmitTimeEntryAsync(TimeEntryDraft draft, CancellationToken cancellationToken = default);
    Task SaveSettingsAsync(AgentSettings settings, CancellationToken cancellationToken = default);
    Task<DeviceCommandResult> EnrollDeviceAsync(string deviceName, CancellationToken cancellationToken = default);
    Task<DeviceCommandResult> UnregisterDeviceAsync(CancellationToken cancellationToken = default);
    Task<UsageCommandResult> SetUsagePausedAsync(bool paused, CancellationToken cancellationToken = default);
    Task<ScreenCommandResult> AcceptScreenShareAsync(CancellationToken cancellationToken = default);
    Task<ScreenCommandResult> StopScreenShareAsync(CancellationToken cancellationToken = default);
    Task<ScreenCommandResult> DecideScreenControlAsync(string action, CancellationToken cancellationToken = default);
}
