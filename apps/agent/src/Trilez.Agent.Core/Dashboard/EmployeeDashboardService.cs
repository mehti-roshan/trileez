using System.Globalization;

namespace Trilez.Agent;

public sealed class EmployeeDashboardService
{
    private readonly TrilezApiClient _api;
    private readonly Func<DateOnly> _today;

    public EmployeeDashboardService(TrilezApiClient api, Func<DateOnly>? today = null)
    {
        _api = api;
        _today = today ?? (() => TehranCalendar.Today());
    }

    public async Task<EmployeeSync> SyncAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            return new EmployeeSync { Connection = ConnectionState.Connected, Dashboard = await LoadAsync(cancellationToken) };
        }
        catch (TrilezApiException error)
        {
            return new EmployeeSync
            {
                Connection = Classify(error),
                Error = new SyncError { Source = "sync", Status = error.Status, Code = error.Code, Message = error.Message, Issues = error.Issues },
            };
        }
    }

    public async Task<EmployeeDashboard> LoadAsync(CancellationToken cancellationToken = default)
    {
        if (!await _api.IsAliveAsync(cancellationToken))
            throw new TrilezApiException(0, "OFFLINE", null);

        var profile = await _api.GetMeAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(profile.Id))
            throw new TrilezApiException(500, "INVALID_PROFILE", "Profile has no id");
        if (!profile.IsActive)
            throw new TrilezApiException(403, null, "User is inactive");
        if (profile.MustChangePassword)
            return EmployeeDashboard.Blocked(profile, "قبل از ادامه باید رمز عبور را تغییر دهید.");

        var aliases = Aliases(profile);
        var errors = new List<SyncError>();
        var day = _today();
        var dayText = day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

        var tasksPage = await ReadAsync("tasks", errors, token => _api.ListTasksAsync(token), cancellationToken);
        var tasks = tasksPage.Items.Where(task => Assignment.IsAssignedTo(task, aliases)).ToList();

        var membersPage = await ReadAsync("memberships", errors, token => _api.ListProjectMembersAsync(token), cancellationToken);
        var projectIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var member in membersPage.Items)
        {
            if (member.Status == "active" && Owns(aliases, member.PersonId) && !string.IsNullOrWhiteSpace(member.ProjectId))
                projectIds.Add(member.ProjectId);
        }
        foreach (var task in tasks)
        {
            if (!string.IsNullOrWhiteSpace(task.ProjectId)) projectIds.Add(task.ProjectId);
        }

        var projectsPage = await ReadAsync("projects", errors, token => _api.ListProjectsAsync(token), cancellationToken);
        var projects = projectsPage.Items.Where(project => projectIds.Contains(project.Id)).ToList();
        var meetingsPage = await ReadAsync("meetings", errors, token => _api.ListMeetingsAsync(token), cancellationToken);
        var meetings = meetingsPage.Items.Where(meeting => Assignment.IsInMeeting(meeting, aliases)).ToList();
        var notificationsPage = await ReadAsync("notifications", errors, token => _api.ListNotificationsAsync(token), cancellationToken);
        var notifications = notificationsPage.Items
            .Where(item => string.IsNullOrEmpty(item.RecipientId) || Owns(aliases, item.RecipientId))
            .ToList();

        var linked = profile.EmployeeState is "active" or "inactive";
        ListResult<AttendanceRecord> attendancePage;
        ListResult<TimesheetRecord> timesheetPage;
        if (!linked)
        {
            attendancePage = new ListResult<AttendanceRecord> { Items = [] };
            timesheetPage = new ListResult<TimesheetRecord> { Items = [] };
        }
        else
        {
            attendancePage = await ReadAsync("attendance", errors, token => _api.ListAttendanceAsync(new RecordQuery { From = dayText, To = dayText }, token), cancellationToken);
            timesheetPage = await ReadAsync("timesheets", errors, token => _api.ListTimesheetsAsync(token), cancellationToken);
        }

        var todayRecord = attendancePage.Items.FirstOrDefault(row => TehranCalendar.IsSameDay(row.Date, day));
        var attendance = NoteFor(errors, "attendance") ?? (linked
            ? DescribeAttendance(todayRecord, profile.EmployeeState, day)
            : new SectionNote { State = SectionState.Empty, Message = "برای این حساب پرونده کارمند فعالی ثبت نشده است." });
        var workTime = NoteFor(errors, "timesheets") ?? (linked
            ? DescribeWorkTime(timesheetPage, profile.EmployeeState, day)
            : new SectionNote { State = SectionState.Empty, Message = "ساعت کاری نمایش داده نمی‌شود چون پرونده کارمند فعالی به این حساب وصل نیست." });
        var devicesPage = await ReadAsync("devices", errors, token => _api.ListAgentDevicesAsync(token), cancellationToken);
        var device = NoteFor(errors, "devices") ?? DescribeDevices(devicesPage);

        var truncated = tasksPage.Truncated || membersPage.Truncated || projectsPage.Truncated || meetingsPage.Truncated || notificationsPage.Truncated || attendancePage.Truncated || timesheetPage.Truncated || devicesPage.Truncated;
        return new EmployeeDashboard
        {
            Profile = profile,
            Connected = true,
            PasswordChangeRequired = false,
            Tasks = tasks,
            Projects = projects,
            Meetings = meetings,
            Notifications = notifications,
            AttendanceRecords = todayRecord is null ? [] : [todayRecord],
            Timesheets = timesheetPage.Items,
            Attendance = attendance,
            WorkTime = workTime,
            Device = device,
            ScreenSharing = new SectionNote
            {
                State = SectionState.Unavailable,
                Message = "تصویر صفحه فقط پس از پذیرش شما در جلسه کمک پشتیبانی فرستاده می‌شود و ذخیره نمی‌شود.",
            },
            Today = new TodayAttendance
            {
                Date = dayText,
                Record = todayRecord,
                ClocksRecorded = !string.IsNullOrWhiteSpace(todayRecord?.ClockIn) && !string.IsNullOrWhiteSpace(todayRecord?.ClockOut),
            },
            TasksTruncated = tasksPage.Truncated,
            Warning = truncated ? "فهرست کامل دریافت نشد. نتیجه ممکن است ناقص باشد." : null,
            Errors = errors,
        };
    }

    private static async Task<ListResult<T>> ReadAsync<T>(string source, List<SyncError> errors, Func<CancellationToken, Task<ListResult<T>>> load, CancellationToken cancellationToken)
    {
        try
        {
            return await load(cancellationToken);
        }
        catch (TrilezApiException error) when (error.Status != 0 && error.Status != 401)
        {
            errors.Add(new SyncError { Source = source, Status = error.Status, Code = error.Code, Message = error.Message, Issues = error.Issues });
            return new ListResult<T> { Items = [] };
        }
    }

    private static List<string> Aliases(EmployeeProfile profile)
    {
        var aliases = new List<string>();
        if (!string.IsNullOrWhiteSpace(profile.Id)) aliases.Add(profile.Id);
        if (!string.IsNullOrWhiteSpace(profile.EmployeeId) && !aliases.Contains(profile.EmployeeId))
            aliases.Add(profile.EmployeeId);
        return aliases;
    }

    private static bool Owns(IReadOnlyList<string> aliases, string? value) =>
        value is not null && aliases.Contains(value);

    private static SectionNote? NoteFor(IReadOnlyList<SyncError> errors, string source)
    {
        var error = errors.FirstOrDefault(item => item.Source == source);
        return error is null ? null : new SectionNote { State = SectionState.Unavailable, Message = error.Message };
    }

    private static ConnectionState Classify(TrilezApiException error)
    {
        if (error.Status == 0 || error.Code == "OFFLINE") return ConnectionState.Offline;
        if (error.Status == 401 || error.Code == "SESSION_REVOKED") return ConnectionState.SessionExpired;
        if (error.Status == 403) return ConnectionState.Unauthorized;
        return ConnectionState.Failed;
    }

    private static SectionNote DescribeDevices(ListResult<AgentDeviceRecord> page)
    {
        var devices = page.Items.Where(row => !string.IsNullOrWhiteSpace(row.Id)).ToList();
        if (devices.Count == 0)
            return new SectionNote { State = SectionState.Empty, Message = "دستگاهی برای این حساب ثبت نشده است." };
        var online = devices.Count(row => row.Status == "active" && row.ConnectionStatus == "online");
        if (devices.Count == 1)
        {
            var row = devices[0];
            var name = string.IsNullOrWhiteSpace(row.DeviceName) ? "دستگاه" : row.DeviceName.Trim();
            var status = row.Status switch
            {
                "revoked" => "لغو‌شده",
                "disabled" => "غیرفعال",
                _ => "ثبت‌شده",
            };
            var connection = row.Status == "active" && row.ConnectionStatus == "online" ? "آنلاین" : "آفلاین";
            return new SectionNote { State = SectionState.Ready, Message = $"{name}: {status}، {connection}." };
        }
        return new SectionNote { State = SectionState.Ready, Message = $"{devices.Count} دستگاه ثبت شده، {online} آنلاین." };
    }

    private static SectionNote DescribeAttendance(AttendanceRecord? today, string? employeeState, DateOnly day)
    {
        var prefix = employeeState == "inactive" ? "پرونده کارمند فعال نیست. " : "";
        var label = DashboardText.FormatDate(day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
        if (today is null)
            return new SectionNote { State = SectionState.Empty, Message = prefix + $"برای امروز {label} حضور ثبت نشده است." };
        var status = today.Status switch
        {
            "present" => "حاضر",
            "absent" => "غایب",
            "late" => "تأخیر",
            "leave" => "مرخصی",
            "mission" => "مأموریت",
            "remote" => "دورکار",
            _ => "ثبت‌شده",
        };
        var start = TehranCalendar.Clock(today.ClockIn);
        var end = TehranCalendar.Clock(today.ClockOut);
        if (start is not null && end is not null)
            return new SectionNote { State = SectionState.Ready, Message = prefix + $"امروز {label}: {status}، ورود {start} و خروج {end}." };
        return new SectionNote { State = SectionState.Ready, Message = prefix + $"امروز {label}: {status}." };
    }

    private static SectionNote DescribeWorkTime(ListResult<TimesheetRecord> page, string? employeeState, DateOnly day)
    {
        var prefix = employeeState == "inactive" ? "پرونده کارمند فعال نیست. " : "";
        if (page.Items.Count == 0)
            return new SectionNote { State = SectionState.Empty, Message = prefix + "ساعت کاری ثبت نشده است. ثبت ساعت فقط پس از پاسخ موفق سرور انجام می‌شود." };
        var hours = page.Items.Sum(item => item.Hours).ToString(CultureInfo.InvariantCulture);
        var todayHours = page.Items.Where(item => TehranCalendar.IsSameDay(item.Date, day)).Sum(item => item.Hours).ToString(CultureInfo.InvariantCulture);
        return new SectionNote { State = SectionState.Ready, Message = prefix + $"{page.Items.Count} ثبت، {hours} ساعت. امروز {todayHours} ساعت." };
    }
}
