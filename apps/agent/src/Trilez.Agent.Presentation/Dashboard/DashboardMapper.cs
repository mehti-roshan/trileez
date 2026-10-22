using System.Globalization;
using System.Text;

namespace Trilez.Agent.Presentation;

public static class DashboardMapper
{
    public static DashboardSnapshot From(EmployeeDashboard dashboard, DateTimeOffset now)
    {
        var projects = dashboard.Projects;
        var tasks = dashboard.Tasks;
        var upcoming = new List<MeetingRow>();
        foreach (var meeting in dashboard.Meetings)
        {
            if (!PresentationText.IsUpcoming(meeting, now)) continue;
            upcoming.Add(new MeetingRow
            {
                Id = meeting.Id,
                Title = string.IsNullOrWhiteSpace(meeting.Title) ? "جلسه" : meeting.Title,
                WhenLabel = PresentationText.When(meeting.StartAt),
                StatusLabel = PresentationText.MeetingStatus(meeting.Status),
                ProjectName = PresentationText.ProjectName(projects, meeting.ProjectId),
                DurationLabel = PresentationText.Duration(meeting.DurationMinutes),
            });
        }

        var taskRows = tasks.Select(task => new TaskRow
        {
            Id = task.Id,
            Title = string.IsNullOrWhiteSpace(task.Title) ? PresentationText.UnknownTask : task.Title,
            ProjectId = task.ProjectId,
            ProjectName = PresentationText.ProjectName(projects, task.ProjectId),
            StatusLabel = PresentationText.TaskStatus(task.Status),
            DueLabel = "موعد " + PresentationText.When(task.DueDate),
        }).ToList();

        var projectRows = projects.Select(project => new ProjectRow
        {
            Id = project.Id,
            Name = string.IsNullOrWhiteSpace(project.Name) ? PresentationText.UnknownProject : project.Name,
            Code = string.IsNullOrWhiteSpace(project.Code) ? project.Id : project.Code,
            StatusLabel = PresentationText.ProjectStatus(project.Status),
            Dates = PresentationText.When(project.StartDate) + " تا " + PresentationText.When(project.EndDate),
        }).ToList();

        var logs = dashboard.Timesheets.Select(entry => new WorkLogRow
        {
            Id = entry.Id,
            TaskTitle = PresentationText.TaskTitle(tasks, entry.TaskId),
            ProjectName = PresentationText.ProjectName(projects, entry.ProjectId),
            DateLabel = PresentationText.When(entry.Date),
            HoursLabel = PresentationText.Hours(entry.Hours),
            StatusLabel = PresentationText.TimeStatus(entry.Status),
            Description = string.IsNullOrWhiteSpace(entry.Description) ? null : entry.Description,
        }).ToList();

        var notes = dashboard.Notifications.Select(item => new NotificationRow
        {
            Id = item.Id,
            Title = string.IsNullOrWhiteSpace(item.Title) ? "اعلان" : item.Title,
            Body = item.Body,
            WhenLabel = PresentationText.When(item.CreatedAt),
            Read = item.Read,
            ReadLabel = item.Read ? "خوانده‌شده" : "خوانده‌نشده",
        }).ToList();

        var attendance = dashboard.AttendanceRecords.Select(row =>
        {
            var start = TehranCalendar.Clock(row.ClockIn);
            var end = TehranCalendar.Clock(row.ClockOut);
            var clocks = start is not null && end is not null ? $"{start} تا {end}" : "بازه ورود و خروج کامل نیست";
            var worked = row.WorkedMinutes is null
                ? "کارکرد نامشخص"
                : row.WorkedMinutes.Value.ToString("0.##", CultureInfo.InvariantCulture) + " دقیقه";
            return new AttendanceRow
            {
                DateLabel = PresentationText.When(row.Date),
                StatusLabel = PresentationText.AttendanceStatus(row.Status),
                ClockLabel = clocks,
                WorkedLabel = worked,
            };
        }).ToList();

        var unread = notes.Count(item => !item.Read);
        var summary = new StringBuilder();
        if (!string.IsNullOrWhiteSpace(dashboard.Today.Date))
            summary.Append("امروز ").AppendLine(PresentationText.When(dashboard.Today.Date));
        summary.AppendLine(dashboard.Attendance.Message);
        summary.AppendLine(dashboard.WorkTime.Message);
        if (!dashboard.PasswordChangeRequired)
        {
            summary.Append(tasks.Count.ToString(CultureInfo.InvariantCulture)).AppendLine(" وظیفه");
            summary.Append(unread.ToString(CultureInfo.InvariantCulture)).Append(" اعلان خوانده‌نشده");
        }

        string? warning = dashboard.Warning;
        if (dashboard.Errors.Count > 0)
            warning = string.IsNullOrWhiteSpace(warning) ? PresentationText.SectionErrors : warning + "\n" + PresentationText.SectionErrors;

        return new DashboardSnapshot
        {
            Welcome = PresentationText.Welcome(dashboard.Profile),
            Identity = PresentationText.Identity(dashboard.Profile),
            EmployeeStateLabel = PresentationText.EmployeeState(dashboard.Profile.EmployeeState),
            EmployeeState = dashboard.Profile.EmployeeState ?? "none",
            TodaySummary = summary.ToString().Trim(),
            AttendanceMessage = dashboard.Attendance.Message,
            WorkTimeMessage = dashboard.WorkTime.Message,
            WorkSessionLabel = dashboard.Today.ClocksRecorded ? PresentationText.WorkSessionRecorded : dashboard.Attendance.Message,
            TasksMessage = SectionOrBlocked(dashboard, "tasks", tasks.Count == 0, PresentationText.EmptyTasks),
            ProjectsMessage = SectionOrBlocked(dashboard, "projects", projects.Count == 0, PresentationText.EmptyProjects),
            MeetingsMessage = SectionOrBlocked(dashboard, "meetings", upcoming.Count == 0, PresentationText.EmptyMeetings),
            NotificationsMessage = SectionOrBlocked(dashboard, "notifications", notes.Count == 0, PresentationText.EmptyNotifications),
            WarningMessage = warning,
            DeviceNote = dashboard.Device.Message,
            ScreenSharingNote = dashboard.ScreenSharing.Message,
            PasswordChangeRequired = dashboard.PasswordChangeRequired,
            Tasks = taskRows,
            Projects = projectRows,
            WorkLogs = logs,
            Meetings = upcoming,
            Notifications = notes,
            Attendance = attendance,
        };
    }

    private static string SectionOrBlocked(EmployeeDashboard dashboard, string source, bool empty, string emptyText) =>
        dashboard.PasswordChangeRequired
            ? PresentationText.PasswordChangeMessage
            : PresentationText.SectionMessage(dashboard, source, empty, emptyText);

    public static WorkLogRow FromTimeEntry(TimesheetRecord record, IReadOnlyList<WorkTask> tasks, IReadOnlyList<ProjectSummary> projects) =>
        new()
        {
            Id = record.Id,
            TaskTitle = PresentationText.TaskTitle(tasks, record.TaskId),
            ProjectName = PresentationText.ProjectName(projects, record.ProjectId),
            DateLabel = PresentationText.When(record.Date),
            HoursLabel = PresentationText.Hours(record.Hours),
            StatusLabel = PresentationText.TimeStatus(record.Status),
            Description = string.IsNullOrWhiteSpace(record.Description) ? null : record.Description,
        };
}
