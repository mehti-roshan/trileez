using System.Globalization;
using System.Text;

namespace Trilez.Agent;

public static class DashboardText
{
    public static string Format(EmployeeDashboard dashboard)
    {
        var text = new StringBuilder();
        text.AppendLine("تری‌لیز — داشبورد کارمند");
        text.AppendLine(dashboard.Connected ? "وضعیت اتصال: متصل به تری‌لیز" : "وضعیت اتصال: قطع");
        var account = dashboard.Profile.IsActive ? "فعال" : "غیرفعال";
        text.AppendLine($"حساب: {dashboard.Profile.Name} — {dashboard.Profile.Email} — {account}");
        if (!string.IsNullOrWhiteSpace(dashboard.Profile.Title))
            text.AppendLine($"سمت: {dashboard.Profile.Title}");
        if (dashboard.PasswordChangeRequired)
            text.AppendLine("قبل از ادامه باید رمز عبور را تغییر دهید.");
        if (!string.IsNullOrWhiteSpace(dashboard.Warning))
            text.AppendLine(dashboard.Warning);

        text.AppendLine();
        AppendList(text, "وظیفه‌ها", Error(dashboard, "tasks"), dashboard.Tasks.Count == 0, "وظیفه‌ای به این حساب اختصاص ندارد.");
        foreach (var task in dashboard.Tasks)
            text.AppendLine($"- {task.Title} — {task.Status ?? "بدون وضعیت"} — موعد {FormatDate(task.DueDate)}");

        text.AppendLine();
        AppendList(text, "پروژه‌ها", Error(dashboard, "projects"), dashboard.Projects.Count == 0, "پروژه مرتبطی برای این حساب پیدا نشد.");
        foreach (var project in dashboard.Projects)
            text.AppendLine($"- {project.Code ?? project.Id} — {project.Name}");

        text.AppendLine();
        AppendList(text, "جلسه‌ها", Error(dashboard, "meetings"), dashboard.Meetings.Count == 0, "جلسه پیش‌رویی برای این حساب پیدا نشد.");
        foreach (var meeting in dashboard.Meetings)
            text.AppendLine($"- {meeting.Title} — {FormatDate(meeting.StartAt)}");

        var unread = dashboard.Notifications.Where(item => !item.Read).ToList();
        text.AppendLine();
        AppendList(text, "اعلان‌ها", Error(dashboard, "notifications"), unread.Count == 0, "اعلان خوانده‌نشده‌ای نیست.");
        foreach (var notification in unread)
            text.AppendLine($"- {notification.Title}");

        text.AppendLine();
        text.AppendLine("حضور و غیاب: " + dashboard.Attendance.Message);
        text.AppendLine("ساعت کاری: " + dashboard.WorkTime.Message);
        text.AppendLine("دستگاه: " + dashboard.Device.Message);
        text.AppendLine("اشتراک صفحه: " + dashboard.ScreenSharing.Message);
        return text.ToString();
    }

    private static SyncError? Error(EmployeeDashboard dashboard, string source) =>
        dashboard.Errors.FirstOrDefault(error => error.Source == source);

    private static void AppendList(StringBuilder text, string title, SyncError? error, bool empty, string emptyText)
    {
        if (error is not null)
        {
            text.AppendLine($"{title}: {error.Message}");
            return;
        }
        text.AppendLine(empty ? $"{title}: {emptyText}" : $"{title}:");
    }

    public static string FormatDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length < 10 || !DateOnly.TryParse(value.AsSpan(0, 10), CultureInfo.InvariantCulture, out var day))
            return "بدون تاریخ";
        var date = day.ToDateTime(TimeOnly.MinValue);
        var calendar = new PersianCalendar();
        return $"{calendar.GetYear(date):0000}/{calendar.GetMonth(date):00}/{calendar.GetDayOfMonth(date):00}";
    }
}
