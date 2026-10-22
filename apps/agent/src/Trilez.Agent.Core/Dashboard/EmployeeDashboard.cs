namespace Trilez.Agent;

public enum SectionState
{
    Ready,
    Empty,
    Unavailable,
    Blocked,
}

public sealed class SectionNote
{
    public required SectionState State { get; init; }
    public required string Message { get; init; }
}

public sealed class EmployeeDashboard
{
    public required EmployeeProfile Profile { get; init; }
    public required bool Connected { get; init; }
    public required bool PasswordChangeRequired { get; init; }
    public required IReadOnlyList<WorkTask> Tasks { get; init; }
    public required IReadOnlyList<ProjectSummary> Projects { get; init; }
    public required IReadOnlyList<MeetingSummary> Meetings { get; init; }
    public required IReadOnlyList<NotificationSummary> Notifications { get; init; }
    public required IReadOnlyList<AttendanceRecord> AttendanceRecords { get; init; }
    public required IReadOnlyList<TimesheetRecord> Timesheets { get; init; }
    public required SectionNote Attendance { get; init; }
    public required SectionNote WorkTime { get; init; }
    public required SectionNote Device { get; init; }
    public required SectionNote ScreenSharing { get; init; }
    public required TodayAttendance Today { get; init; }
    public bool TasksTruncated { get; init; }
    public string? Warning { get; init; }
    public IReadOnlyList<SyncError> Errors { get; init; } = [];

    public static EmployeeDashboard Blocked(EmployeeProfile profile, string message) => new()
    {
        Profile = profile,
        Connected = true,
        PasswordChangeRequired = true,
        Tasks = [],
        Projects = [],
        Meetings = [],
        Notifications = [],
        AttendanceRecords = [],
        Timesheets = [],
        Attendance = new SectionNote { State = SectionState.Blocked, Message = message },
        WorkTime = new SectionNote { State = SectionState.Blocked, Message = message },
        Device = new SectionNote { State = SectionState.Blocked, Message = message },
        ScreenSharing = new SectionNote { State = SectionState.Unavailable, Message = "اشتراک صفحه فقط پس از پذیرش شما در جلسه کمک پشتیبانی انجام می‌شود." },
        Today = new TodayAttendance { Date = "", ClocksRecorded = false },
    };
}
