namespace Trilez.Agent;

public sealed class SessionState
{
    public string? AccessToken { get; set; }

    public void Clear() => AccessToken = null;
}

public sealed class ApiIssue
{
    public string? Location { get; set; }
    public string? Path { get; set; }
    public string? Code { get; set; }
    public string? Message { get; set; }
}

public sealed class RecordQuery
{
    public string? ProjectId { get; init; }
    public string? TaskId { get; init; }
    public string? Status { get; init; }
    public string? Priority { get; init; }
    public string? DueFrom { get; init; }
    public string? DueTo { get; init; }
    public string? From { get; init; }
    public string? To { get; init; }
    public string? ApprovalStatus { get; init; }
}

public sealed class EmployeeProfile
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string Role { get; set; } = "";
    public string? Title { get; set; }
    public bool IsActive { get; set; }
    public bool MustChangePassword { get; set; }
    public string? OrganizationId { get; set; }
    public string? EmployeeId { get; set; }
    public string? EmployeeState { get; set; }
    public string? EmploymentStatus { get; set; }
}

public sealed class EmployeeLink
{
    public string State { get; set; } = "";
    public string? EmployeeId { get; set; }
    public string? EmploymentStatus { get; set; }
}

public sealed class WorkTask
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string? Status { get; set; }
    public string? Priority { get; set; }
    public string? AssigneeId { get; set; }
    public List<string>? AssigneeIds { get; set; }
    public List<string>? FollowerIds { get; set; }
    public List<string>? AssigneeMemberIds { get; set; }
    public string? ProjectId { get; set; }
    public string? DueDate { get; set; }
    public string? StartDate { get; set; }
    public double? EstimatedHours { get; set; }
    public double? LoggedHours { get; set; }
}

public sealed class ProjectSummary
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Code { get; set; }
    public string? Status { get; set; }
    public string? StartDate { get; set; }
    public string? EndDate { get; set; }
    public List<string>? Members { get; set; }
}

public sealed class ProjectMembership
{
    public string Id { get; set; } = "";
    public string? ProjectId { get; set; }
    public string? PersonId { get; set; }
    public string? Status { get; set; }
    public string? Role { get; set; }
    public List<string>? RoleIds { get; set; }
    public string? JoinedAt { get; set; }
    public string? LeftAt { get; set; }
}

public sealed class MeetingSummary
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string? StartAt { get; set; }
    public string? Status { get; set; }
    public string? OrganizerId { get; set; }
    public List<string>? ParticipantIds { get; set; }
    public List<string>? EmployeeIds { get; set; }
    public int? DurationMinutes { get; set; }
    public string? ProjectId { get; set; }
}

public sealed class NotificationSummary
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string? Body { get; set; }
    public string? CreatedAt { get; set; }
    public bool Read { get; set; }
    public string? RecipientId { get; set; }
    public string? Type { get; set; }
}

public sealed class TimesheetRecord
{
    public string Id { get; set; } = "";
    public string? EmployeeId { get; set; }
    public string? ProjectId { get; set; }
    public string? TaskId { get; set; }
    public string? Date { get; set; }
    public double Hours { get; set; }
    public string? Status { get; set; }
    public string? Description { get; set; }
    public bool? Billable { get; set; }
    public double? HourlyRate { get; set; }
    public double? CalculatedCost { get; set; }
    public string? CreatedAt { get; set; }
}

public sealed class AttendanceRecord
{
    public string Id { get; set; } = "";
    public string? EmployeeId { get; set; }
    public string? Date { get; set; }
    public string? ClockIn { get; set; }
    public string? ClockOut { get; set; }
    public string? Status { get; set; }
    public string? ApprovalStatus { get; set; }
    public string? Source { get; set; }
    public double? WorkedMinutes { get; set; }
    public double? ExpectedMinutes { get; set; }
}

public static class AgentDeviceCapabilities
{
    public const string DeviceHealth = "device-health";
    public const string ScreenShare = "screen-share";
    public const string RemoteControl = "remote-control";
    public static readonly string[] Supported = ["employee-dashboard", "time-entry", "attendance-read", "application-usage", DeviceHealth, ScreenShare];
}

public sealed class ScreenSession
{
    public string? Id { get; set; }
    public string? DeviceId { get; set; }
    public string? State { get; set; }
    public string? SupportUserId { get; set; }
    public string? SupportName { get; set; }
    public string? EmployeeUserId { get; set; }
    public string? EmployeeId { get; set; }
    public DateTimeOffset? RequestedAt { get; set; }
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }
    public string? EndReason { get; set; }
    public DateTimeOffset? ExpiresAt { get; set; }
    public DateTimeOffset? LastAgentAt { get; set; }
    public string? RequestNote { get; set; }
    public int FrameCount { get; set; }
    public string? QualityMode { get; set; }
    public int? MaxFps { get; set; }
    public int? MaxEdge { get; set; }
    public int? JpegQuality { get; set; }
    public string? ControlState { get; set; }
    public string? ControlGrantId { get; set; }
    public DateTimeOffset? ControlExpiresAt { get; set; }
    public string? InputPlane { get; set; }
    public string[]? PermittedCapabilities { get; set; }
}

public sealed class ScreenFrameResult
{
    public bool Accepted { get; set; }
    public int FrameCount { get; set; }
    public DateTimeOffset? ReceivedAt { get; set; }
    public int Bytes { get; set; }
    public int RetainedFrames { get; set; }
    public double? ActualFps { get; set; }
}

public sealed class AgentDeviceRegistration
{
    public required string InstallationId { get; init; }
    public required string DeviceName { get; init; }
    public required string AgentVersion { get; init; }
    public IReadOnlyList<string>? Capabilities { get; init; }
    public string? Platform { get; init; }
    public string? OsDescription { get; init; }
}

public sealed class AgentDeviceRecord
{
    public string? Id { get; set; }
    public string? InstallationId { get; set; }
    public string? DeviceName { get; set; }
    public string? AgentVersion { get; set; }
    public List<string>? Capabilities { get; set; }
    public string? Platform { get; set; }
    public string? OsDescription { get; set; }
    public string? Status { get; set; }
    public string? ConnectionStatus { get; set; }
    public DateTimeOffset? LastSeenAt { get; set; }
    public DateTimeOffset? EnrolledAt { get; set; }
    public string? EmployeeId { get; set; }
    public string? UserId { get; set; }
}

public sealed class AgentDeviceEnrollment
{
    public AgentDeviceRecord? Data { get; set; }
    public bool Created { get; set; }
    public string? Credential { get; set; }
}

public sealed class UsagePolicyDocument
{
    public bool Enabled { get; set; }
    public bool EmployeeMayPause { get; set; }
    public int IdleThresholdSeconds { get; set; } = 60;
    public int BucketSeconds { get; set; } = UsageAggregator.BucketSeconds;
    public int RetentionDays { get; set; } = 30;
    public bool CollectWindowTitles { get; set; }
    public bool Paused { get; set; }
    public DateTimeOffset? DisabledAt { get; set; }
    public DateTimeOffset? PausedAt { get; set; }
}

public sealed class UsageBatchInterval
{
    public required string ClientIntervalId { get; init; }
    public required string ProcessName { get; init; }
    public string? DisplayName { get; init; }
    public required DateTimeOffset StartedAt { get; init; }
    public required long DurationMs { get; init; }
}

public sealed class UsageBatchSession
{
    public required string ClientSessionId { get; init; }
    public required DateTimeOffset StartedAt { get; init; }
    public DateTimeOffset? EndedAt { get; init; }
    public string? EndReason { get; init; }
}

public sealed class UsageBatchRequest
{
    public required UsageBatchSession Session { get; init; }
    public required IReadOnlyList<UsageBatchInterval> Intervals { get; init; }
}

public sealed class UsageRejectedInterval
{
    public string? ClientIntervalId { get; set; }
    public string? Code { get; set; }
}

public sealed class UsageBatchResult
{
    public int Accepted { get; set; }
    public int Duplicate { get; set; }
    public int Updated { get; set; }
    public List<UsageRejectedInterval>? Rejected { get; set; }
    public DateTimeOffset? LastSuccessfulUploadAt { get; set; }
    public bool Enabled { get; set; }
    public bool Paused { get; set; }
}

public sealed class HealthSample
{
    public string ClientSampleId { get; set; } = "";
    public DateTimeOffset SampledAt { get; set; }
    public double? CpuPercent { get; set; }
    public long? MemoryUsedBytes { get; set; }
    public long? MemoryTotalBytes { get; set; }
    public long? DiskFreeBytes { get; set; }
    public long? DiskTotalBytes { get; set; }
    public string? OsName { get; set; }
    public string? OsVersion { get; set; }
    public string? Architecture { get; set; }
    public string AgentVersion { get; set; } = "";
    public bool Online { get; set; }
    public DateTimeOffset? LastHeartbeatAt { get; set; }
    public string CollectorPhase { get; set; } = "stopped";
    public string SyncPhase { get; set; } = "idle";
    public int QueueDepth { get; set; }
    public long PendingBytes { get; set; }
}

public sealed class HealthRejectedSample
{
    public string? ClientSampleId { get; set; }
    public string? Code { get; set; }
}

public sealed class HealthBatchResult
{
    public int Accepted { get; set; }
    public int Duplicate { get; set; }
    public List<string>? AcceptedIds { get; set; }
    public List<string>? DuplicateIds { get; set; }
    public List<HealthRejectedSample>? Rejected { get; set; }
    public DateTimeOffset? LastSuccessfulUploadAt { get; set; }
}

public sealed class TimeEntryDraft
{
    public required string ProjectId { get; init; }
    public required string TaskId { get; init; }
    public required string Date { get; init; }
    public required decimal Hours { get; init; }
    public string? Description { get; init; }
    public bool? Billable { get; init; }
}

public sealed class ListResult<T>
{
    public required IReadOnlyList<T> Items { get; init; }
    public bool Truncated { get; init; }
    public EmployeeLink? Employee { get; init; }
}

sealed class PageInfo
{
    public bool HasMore { get; set; }
    public string? NextCursor { get; set; }
}

sealed class Envelope<T>
{
    public T? Data { get; set; }
    public PageInfo? Page { get; set; }
    public EmployeeLink? Employee { get; set; }
}

sealed class MeResponse
{
    public EmployeeProfile? User { get; set; }
    public EmployeeLink? Employee { get; set; }
}

sealed class AuthResponse
{
    public string? Token { get; set; }
    public EmployeeProfile? User { get; set; }
}

sealed class HealthResponse
{
    public bool Ok { get; set; }
}

sealed class ErrorResponse
{
    public string? Error { get; set; }
    public string? Code { get; set; }
    public List<ApiIssue>? Issues { get; set; }
}
