namespace Trilez.Agent.Presentation;

public enum AppPage
{
    Overview,
    Tasks,
    Projects,
    Attendance,
    WorkLogs,
    Meetings,
    Notifications,
    Settings,
    Help,
}

public sealed class NavItem
{
    public required AppPage Page { get; init; }
    public required string Title { get; init; }
}

public sealed class TaskRow
{
    public required string Id { get; init; }
    public required string Title { get; init; }
    public required string ProjectName { get; init; }
    public required string StatusLabel { get; init; }
    public required string DueLabel { get; init; }
    public string? ProjectId { get; init; }
}

public sealed class ProjectRow
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required string Code { get; init; }
    public required string StatusLabel { get; init; }
    public required string Dates { get; init; }
}

public sealed class WorkLogRow
{
    public required string Id { get; init; }
    public required string TaskTitle { get; init; }
    public required string ProjectName { get; init; }
    public required string DateLabel { get; init; }
    public required string HoursLabel { get; init; }
    public required string StatusLabel { get; init; }
    public string? Description { get; init; }
}

public sealed class MeetingRow
{
    public required string Id { get; init; }
    public required string Title { get; init; }
    public required string WhenLabel { get; init; }
    public required string StatusLabel { get; init; }
    public required string ProjectName { get; init; }
    public required string DurationLabel { get; init; }
}

public sealed class NotificationRow
{
    public required string Id { get; init; }
    public required string Title { get; init; }
    public string? Body { get; init; }
    public required string WhenLabel { get; init; }
    public required bool Read { get; init; }
    public required string ReadLabel { get; init; }
}

public sealed class AttendanceRow
{
    public required string DateLabel { get; init; }
    public required string StatusLabel { get; init; }
    public required string ClockLabel { get; init; }
    public required string WorkedLabel { get; init; }
}

public sealed class DashboardSnapshot
{
    public required string Welcome { get; init; }
    public required string Identity { get; init; }
    public required string EmployeeStateLabel { get; init; }
    public required string TodaySummary { get; init; }
    public required string AttendanceMessage { get; init; }
    public required string WorkTimeMessage { get; init; }
    public required string WorkSessionLabel { get; init; }
    public required string TasksMessage { get; init; }
    public required string ProjectsMessage { get; init; }
    public required string MeetingsMessage { get; init; }
    public required string NotificationsMessage { get; init; }
    public string? WarningMessage { get; init; }
    public required string DeviceNote { get; init; }
    public required string ScreenSharingNote { get; init; }
    public required bool PasswordChangeRequired { get; init; }
    public required string EmployeeState { get; init; }
    public required IReadOnlyList<TaskRow> Tasks { get; init; }
    public required IReadOnlyList<ProjectRow> Projects { get; init; }
    public required IReadOnlyList<WorkLogRow> WorkLogs { get; init; }
    public required IReadOnlyList<MeetingRow> Meetings { get; init; }
    public required IReadOnlyList<NotificationRow> Notifications { get; init; }
    public required IReadOnlyList<AttendanceRow> Attendance { get; init; }
}
