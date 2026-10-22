namespace Trilez.Agent;

public enum ConnectionState
{
    Connected,
    Offline,
    SessionExpired,
    Unauthorized,
    Failed,
}

public sealed class SyncError
{
    public required string Source { get; init; }
    public required int Status { get; init; }
    public string? Code { get; init; }
    public required string Message { get; init; }
    public IReadOnlyList<ApiIssue> Issues { get; init; } = [];
}

public sealed class EmployeeSync
{
    public required ConnectionState Connection { get; init; }
    public EmployeeDashboard? Dashboard { get; init; }
    public SyncError? Error { get; init; }
}

public sealed class TodayAttendance
{
    public required string Date { get; init; }
    public AttendanceRecord? Record { get; init; }
    public bool ClocksRecorded { get; init; }
}