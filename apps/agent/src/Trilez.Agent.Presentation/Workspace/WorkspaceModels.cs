namespace Trilez.Agent.Presentation;

public sealed class DeviceEnrollmentSnapshot
{
    public string Phase { get; init; } = "unenrolled";
    public string ConnectionStatus { get; init; } = "offline";
    public string? EnrollmentId { get; init; }
    public string? InstallationId { get; init; }
    public string DeviceName { get; init; } = "";
    public string? AgentVersion { get; init; }
    public DateTimeOffset? LastSeenAt { get; init; }
    public string? Message { get; init; }
    public bool CanUnregister { get; init; }

    public static DeviceEnrollmentSnapshot Unenrolled(string? message = null) => new()
    {
        Phase = "unenrolled",
        Message = message,
    };
}

public sealed class HealthSnapshot
{
    public string SyncPhase { get; init; } = "stopped";
    public string CollectorPhase { get; init; } = "stopped";
    public string? AgentVersion { get; init; }
    public string? OsName { get; init; }
    public string? OsVersion { get; init; }
    public string? Architecture { get; init; }
    public double? CpuPercent { get; init; }
    public long? MemoryUsedBytes { get; init; }
    public long? MemoryTotalBytes { get; init; }
    public long? DiskFreeBytes { get; init; }
    public long? DiskTotalBytes { get; init; }
    public bool Online { get; init; }
    public DateTimeOffset? LastHeartbeatAt { get; init; }
    public DateTimeOffset? LastSampleAt { get; init; }
    public DateTimeOffset? LastSuccessfulUploadAt { get; init; }
    public DateTimeOffset? NextRetryAt { get; init; }
    public int PendingCount { get; init; }
    public long PendingBytes { get; init; }
    public int SampleIntervalSeconds { get; init; }
    public string? Message { get; init; }

    public static HealthSnapshot Stopped(string? message = null) => new() { SyncPhase = "stopped", CollectorPhase = "stopped", Message = message };
}

public sealed class ScreenShareSnapshot
{
    public string Phase { get; init; } = "idle";
    public string? SessionId { get; init; }
    public string? SupportName { get; init; }
    public DateTimeOffset? RequestedAt { get; init; }
    public DateTimeOffset? StartedAt { get; init; }
    public DateTimeOffset? EndedAt { get; init; }
    public string? EndReason { get; init; }
    public string? Message { get; init; }
    public bool CanAccept { get; init; }
    public bool CanStop { get; init; }
    public string? RequestedMode { get; init; }
    public string? EffectiveMode { get; init; }
    public bool FellBack { get; init; }
    public int TargetFps { get; init; }
    public int EffectiveFps { get; init; }
    public int EffectiveEdge { get; init; }
    public int EffectiveQuality { get; init; }
    public double? ActualFps { get; init; }
    public int? LatencyMs { get; init; }
    public int? BandwidthBytesPerSecond { get; init; }
    public int CaptureFailures { get; init; }
    public int DroppedFrames { get; init; }
    public int MonitorCount { get; init; }
    public string? ControlState { get; init; }
    public string? ControlGrantId { get; init; }
    public DateTimeOffset? ControlExpiresAt { get; init; }
    public string? InputPlane { get; init; }
    public string? InputBlockedReason { get; init; }
    public IReadOnlyList<string> PermittedCapabilities { get; init; } = [];
    public bool CanGrantControl { get; init; }
    public bool CanDenyControl { get; init; }
    public bool CanRevokeControl { get; init; }

    public static ScreenShareSnapshot Unavailable(string? message = null) => new()
    {
        Phase = "unavailable",
        Message = message ?? PresentationText.ScreenShareUnavailable,
    };

    public static ScreenShareSnapshot Idle() => new()
    {
        Phase = "idle",
        Message = "درخواست فعالی برای اشتراک صفحه نیست.",
    };

    public static ScreenShareSnapshot Stopped(string? message = null) => new()
    {
        Phase = "stopped",
        Message = message,
    };
}

public sealed class ScreenCommandResult
{
    public bool Succeeded { get; init; }
    public bool SessionExpired { get; init; }
    public string? Message { get; init; }

    public static ScreenCommandResult Ok(string message) => new() { Succeeded = true, Message = message };
    public static ScreenCommandResult Fail(string message) => new() { Message = message };
    public static ScreenCommandResult Expired(string message) => new() { SessionExpired = true, Message = message };
}

public sealed class UsageSnapshot
{
    public string Phase { get; init; } = "stopped";
    public string? SessionId { get; init; }
    public DateTimeOffset? SessionStartedAt { get; init; }
    public DateTimeOffset? SessionEndedAt { get; init; }
    public string? EndReason { get; init; }
    public DateTimeOffset? LastSampleAt { get; init; }
    public DateTimeOffset? LastSuccessfulUploadAt { get; init; }
    public int PendingIntervals { get; init; }
    public string? Message { get; init; }
    public bool CanPause { get; init; }
    public bool CanResume { get; init; }

    public static UsageSnapshot Stopped(string? message = null) => new() { Phase = "stopped", Message = message };
}

public sealed class UsageCommandResult
{
    public bool Succeeded { get; init; }
    public bool SessionExpired { get; init; }
    public string? Message { get; init; }

    public static UsageCommandResult Ok(string message) => new() { Succeeded = true, Message = message };
    public static UsageCommandResult Fail(string message) => new() { Message = message };
    public static UsageCommandResult Expired(string message) => new() { SessionExpired = true, Message = message };
}

public sealed class DeviceCommandResult
{
    public bool Succeeded { get; init; }
    public bool SessionExpired { get; init; }
    public string? Message { get; init; }
    public string? EnrollmentId { get; init; }
    public DeviceEnrollmentSnapshot Snapshot { get; init; } = DeviceEnrollmentSnapshot.Unenrolled();

    public static DeviceCommandResult Ok(DeviceEnrollmentSnapshot snapshot, string message) => new()
    {
        Succeeded = true,
        Message = message,
        EnrollmentId = snapshot.EnrollmentId,
        Snapshot = snapshot,
    };

    public static DeviceCommandResult Fail(string message, DeviceEnrollmentSnapshot? snapshot = null) => new()
    {
        Message = message,
        Snapshot = snapshot ?? DeviceEnrollmentSnapshot.Unenrolled(message),
    };

    public static DeviceCommandResult Expired(string message) => new()
    {
        SessionExpired = true,
        Message = message,
        Snapshot = DeviceEnrollmentSnapshot.Unenrolled(message),
    };
}

public sealed class SignInResult
{
    public bool Succeeded { get; init; }
    public EmployeeDashboard? Dashboard { get; init; }
    public string? Message { get; init; }

    public static SignInResult Ok(EmployeeDashboard dashboard) => new() { Succeeded = true, Dashboard = dashboard };
    public static SignInResult Fail(string message) => new() { Succeeded = false, Message = message };
}

public sealed class TimeEntrySubmission
{
    public bool Saved { get; init; }
    public TimesheetRecord? Record { get; init; }
    public string? Message { get; init; }
    public bool SessionExpired { get; init; }

    public static TimeEntrySubmission Ok(TimesheetRecord record) => new() { Saved = true, Record = record };
    public static TimeEntrySubmission Fail(string message) => new() { Saved = false, Message = message };
    public static TimeEntrySubmission Expired(string message) => new() { Saved = false, SessionExpired = true, Message = message };
}
