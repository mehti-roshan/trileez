using System.Globalization;
using System.Text.RegularExpressions;

namespace Trilez.Agent.Presentation;

public static partial class PresentationText
{
    public const string InvalidUrl = "نشانی API معتبر نیست. مبدأ http یا https را بدون نام کاربری و رمز در نشانی وارد کنید.";
    public const string MissingCredentials = "نشانی API، ایمیل و رمز عبور را وارد کنید.";
    public const string SignedInMessage = "ورود انجام شد.";
    public const string RefreshedMessage = "اطلاعات به‌روز شد.";
    public const string SettingsSaved = "تنظیمات ذخیره شد.";
    public const string AlreadyRunning = "تری‌لیز در حال اجراست.";
    public const string UrlAppliesNextSignIn = "نشانی جدید از ورود بعدی استفاده می‌شود.";
    public const string TaskNotAuthorized = "این وظیفه در فهرست وظیفه‌های شما نیست.";
    public const string HoursInvalid = "ساعت باید عددی بین 0.01 و 24 باشد.";
    public const string DateInvalid = "تاریخ را به صورت میلادی yyyy-MM-dd وارد کنید.";
    public const string NoTaskSelected = "یک وظیفه از فهرست خود را انتخاب کنید.";
    public const string TaskHasNoProject = "این وظیفه پروژه معتبری ندارد.";
    public const string TimeRequiresActiveEmployee = "ثبت ساعت فقط برای پرونده کارمند فعال ممکن است.";
    public const string NoTasksForTime = "وظیفه‌ای برای ثبت ساعت در دسترس نیست.";
    public const string UnknownProject = "پروژه نامشخص";
    public const string UnknownTask = "وظیفه نامشخص";
    public const string NoSuccessfulSync = "هنوز همگام‌سازی موفقی ثبت نشده است.";
    public const string LoadingMessage = "در حال دریافت اطلاعات...";
    public const string GenericFailure = "خطای داخلی رخ داد. دوباره تلاش کنید.";
    public const string SignedOutConnection = "وارد نشده";
    public const string EmptyTasks = "وظیفه‌ای به این حساب اختصاص ندارد.";
    public const string EmptyProjects = "پروژه مرتبطی برای این حساب پیدا نشد.";
    public const string EmptyMeetings = "جلسه پیش‌رویی برای این حساب پیدا نشد.";
    public const string EmptyNotifications = "اعلانی برای این حساب نیست.";
    public const string PasswordChangeMessage = "قبل از ادامه باید رمز عبور را تغییر دهید.";
    public const string PasswordChangeHelp = "تغییر رمز در این نسخه از میز کار انجام نمی‌شود. از پنل تری‌لیز رمز را تغییر دهید و دوباره وارد شوید.";
    public const string TelemetryOff = "عنوان پنجره، کلیدها، کلیپ‌بورد و محتوای اسناد جمع نمی‌شود.";
    public const string ScreenSharingOff = "اشتراک صفحه فقط پس از پذیرش شما در جلسه کمک پشتیبانی انجام می‌شود.";
    public const string ScreenShareUnavailable = "اشتراک صفحه روی این نسخه فعال نیست.";
    public const string ScreenShareAccepted = "اشتراک صفحه آغاز شد. تصویر ذخیره نمی‌شود.";
    public const string ScreenShareStoppedByEmployee = "اشتراک صفحه متوقف شد.";
    public const string ScreenShareNotRequested = "درخواست فعالی برای پذیرش نیست.";
    public const string ScreenControlUnavailable = "کنترل ورودی در این نسخه اعمال نمی‌شود.";
    public const string ScreenControlDecided = "وضعیت کنترل ورودی به‌روز شد.";
    public const string PasswordNotStored = "رمز عبور و نشست روی دیسک ذخیره نمی‌شوند.";
    public const string DiagnosticsFootnote = "این گزارش رمز عبور و نشست را شامل نمی‌شود.";
    public const string SectionErrors = "برخی بخش‌ها دریافت نشد. پیام همان بخش را ببینید.";
    public const string WorkSessionRecorded = "بازه کاری امروز ثبت شده است.";
    public const string HostMissing = "تنظیم نشده";
    public const string DeviceNameRequired = "نام نمایشی دستگاه را وارد کنید.";
    public const string DeviceNotEnrolled = "دستگاه ثبت نشده است.";
    public const string DeviceUnregistered = "ثبت دستگاه لغو شد.";
    public const string CapabilitiesLimited = "پایش عنوان پنجره، کلیدها و اشتراک صفحه خاموش است.";
    public const string LinuxCapabilities = "پایش برنامهٔ پیش‌زمینه و اشتراک صفحه روی لینوکس در این نسخه پشتیبانی نمی‌شود. سلامت دستگاه از خود سامانه خوانده می‌شود و ساخته نمی‌شود.";
    public const string LinuxStartupCheckbox = "با روشن شدن رایانه، تری‌لیز باز شود. این گزینه در شروع خودکار کاربر دیده می‌شود.";
    public const string WindowsStartupCheckbox = "با روشن شدن ویندوز، تری‌لیز باز شود. این گزینه در برنامه‌های شروع ویندوز دیده می‌شود.";
    public const string UsagePaused = "جمع‌آوری استفاده متوقف شد.";
    public const string UsageResumed = "جمع‌آوری استفاده ادامه پیدا کرد.";
    public const string UsageUnavailable = "جمع‌آوری استفاده روی این نسخه فعال نیست.";
    public const string HealthUnavailable = "گزارش سلامت روی این نسخه فعال نیست.";
    public const string DeviceCredentialSeparate = "اعتبار دستگاه در فایل تنظیمات ذخیره نمی‌شود.";

    private static readonly TimeSpan TehranOffset = TimeSpan.FromHours(3.5);

    public static string TimeSaved(string id) => $"ساعت ثبت شد. شناسه {id}";

    public static string DeviceEnrolled(string id) => $"دستگاه ثبت شد. شناسه {id}";

    /// <summary>Display suggestion only. The installation id is a generated identifier, not this name.</summary>
    public static string SuggestedDeviceName()
    {
        var machine = Environment.MachineName?.Trim();
        if (string.IsNullOrWhiteSpace(machine)) return "دستگاه کارمند";
        return machine.Length <= 80 ? machine : machine[..80];
    }

    public static string EnrollmentPhase(string? phase) => phase switch
    {
        "active" => "ثبت‌شده",
        "disabled" => "غیرفعال",
        "revoked" => "لغو‌شده",
        _ => "ثبت‌نشده",
    };

    public static string DeviceConnection(string? status) => status == "online" ? "آنلاین" : "آفلاین";

    public static string StartupLine(bool enabled) =>
        OperatingSystem.IsLinux()
            ? (enabled ? "شروع همراه رایانه: روشن" : "شروع همراه رایانه: خاموش")
            : (enabled ? "شروع همراه ویندوز: روشن" : "شروع همراه ویندوز: خاموش");

    public static string StartupCheckbox =>
        OperatingSystem.IsLinux() ? LinuxStartupCheckbox : WindowsStartupCheckbox;

    public static string StartupCheckboxName =>
        OperatingSystem.IsLinux() ? "شروع همراه رایانه" : "شروع همراه ویندوز";

    public static string UsagePhase(string? phase) => phase switch
    {
        "running" => "در حال جمع‌آوری",
        "offline" => "آفلاین، نمونه‌ها ذخیره شده‌اند",
        "paused" => "متوقف‌شده",
        "disabled" => "سیاست جمع‌آوری خاموش است",
        _ => "جمع‌آوری متوقف است",
    };

    public static string SyncPhase(string? phase) => phase switch
    {
        "idle" => "همگام‌سازی آماده است",
        "pending" => "نمونه‌ها منتظر ارسال هستند",
        "retrying" => "ارسال دوباره زمان‌بندی شده است",
        "offline" => "ارتباط قطع است و نمونه‌ها ذخیره شده‌اند",
        "revoked" => "ارسال به دلیل لغو دستگاه متوقف است",
        _ => "ارسال متوقف است",
    };

    public static string CollectorPhase(string? phase) => phase switch
    {
        "running" => "جمع‌آوری استفاده فعال است",
        "offline" => "جمع‌آوری استفاده آفلاین است",
        "paused" => "جمع‌آوری استفاده متوقف شده است",
        "disabled" => "جمع‌آوری استفاده خاموش است",
        _ => "جمع‌آوری استفاده متوقف است",
    };

    public static string ScreenSharePhase(string? phase) => phase switch
    {
        "requested" => "پشتیبانی درخواست مشاهده صفحه داده است",
        "active" => "اشتراک صفحه فعال است",
        "ended" => "اشتراک صفحه پایان یافت",
        "offline" => "ارتباط قطع شد و تصویر گرفته نمی‌شود",
        "stopped" => "اشتراک صفحه متوقف است",
        "unavailable" => "اشتراک صفحه روی این نسخه فعال نیست",
        _ => "درخواست فعالی نیست",
    };

    public static string ScreenShareMode(ScreenShareSnapshot snapshot)
    {
        if (snapshot.Phase is not ("requested" or "active" or "offline" or "ended")) return "";
        if (string.IsNullOrWhiteSpace(snapshot.RequestedMode)) return "";
        if (snapshot.FellBack) return "کیفیت پایین؛ بازگشت از کیفیت بالا";
        return snapshot.EffectiveMode == "high" ? "کیفیت بالا" : "کیفیت پایین";
    }

    public static string ScreenShareDetail(ScreenShareSnapshot snapshot)
    {
        var lines = new List<string> { ScreenSharePhase(snapshot.Phase) };
        var mode = ScreenShareMode(snapshot);
        if (!string.IsNullOrWhiteSpace(mode)) lines.Add(mode);
        if (snapshot.TargetFps > 0) lines.Add("سقف تنظیم‌شده: " + snapshot.TargetFps.ToString(CultureInfo.InvariantCulture) + " فریم در ثانیه");
        if (snapshot.EffectiveFps > 0) lines.Add("محدوده‌ی فعال: " + snapshot.EffectiveFps.ToString(CultureInfo.InvariantCulture) + " فریم در ثانیه");
        if (snapshot.EffectiveEdge > 0) lines.Add("وضوح فعال: " + snapshot.EffectiveEdge.ToString(CultureInfo.InvariantCulture));
        if (snapshot.ActualFps is double fps) lines.Add("نرخ واقعی: " + fps.ToString("0.0", CultureInfo.InvariantCulture) + " فریم در ثانیه");
        if (snapshot.LatencyMs is int latency) lines.Add("تأخیر ارسال: " + latency.ToString(CultureInfo.InvariantCulture) + " میلی‌ثانیه");
        if (snapshot.BandwidthBytesPerSecond is int bandwidth) lines.Add("پهنای باند: " + bandwidth.ToString(CultureInfo.InvariantCulture) + " بایت در ثانیه");
        if (snapshot.CaptureFailures > 0) lines.Add("گرفتن تصویر ناموفق: " + snapshot.CaptureFailures.ToString(CultureInfo.InvariantCulture));
        if (snapshot.DroppedFrames > 0) lines.Add("فریم حذف‌شده: " + snapshot.DroppedFrames.ToString(CultureInfo.InvariantCulture));
        if (snapshot.MonitorCount > 0) lines.Add("نمایشگرها: " + snapshot.MonitorCount.ToString(CultureInfo.InvariantCulture));
        var control = ScreenControlStatus(snapshot);
        if (!string.IsNullOrWhiteSpace(control)) lines.Add(control);
        var support = TrilezApiException.Sanitize(snapshot.SupportName);
        if (!string.IsNullOrWhiteSpace(support)) lines.Add("پشتیبان: " + support);
        if (snapshot.StartedAt is DateTimeOffset started) lines.Add("شروع: " + When(started.ToString("O", CultureInfo.InvariantCulture)));
        if (snapshot.EndedAt is DateTimeOffset ended) lines.Add("پایان: " + When(ended.ToString("O", CultureInfo.InvariantCulture)));
        lines.Add("تصویر صفحه ذخیره نمی‌شود.");
        var message = TrilezApiException.Sanitize(snapshot.Message);
        if (!string.IsNullOrWhiteSpace(message)) lines.Add(message);
        return string.Join('\n', lines);
    }

    public static string ScreenControlStatus(ScreenShareSnapshot snapshot) => snapshot.ControlState switch
    {
        "requested" => "پشتیبانی کنترل ورودی خواسته است. تا پذیرش شما ورودی اعمال نمی‌شود.",
        "granted" => "کنترل مجاز است، اما این نسخه ورودی را به سیستم‌عامل نمی‌فرستد.",
        "denied" => "کنترل ورودی رد شد.",
        "revoked" => "کنترل ورودی لغو شد.",
        "expired" => "مهلت کنترل ورودی تمام شد.",
        _ => "",
    };

    public static string ScreenControlLabel(ScreenShareSnapshot snapshot) => snapshot.ControlState switch
    {
        "requested" => "درخواست کنترل ورودی",
        "granted" => "کنترل مجاز است؛ ورودی اعمال نمی‌شود",
        "denied" => "کنترل ورودی رد شد",
        "revoked" => "کنترل ورودی لغو شد",
        "expired" => "مهلت کنترل ورودی تمام شد",
        _ => "",
    };

    public static string HealthDetail(HealthSnapshot snapshot)
    {
        var lines = new List<string>
        {
            "نسخه عامل: " + (string.IsNullOrWhiteSpace(snapshot.AgentVersion) ? AgentInfo.Version : snapshot.AgentVersion),
            "سیستم: " + Display(snapshot.OsName) + " " + Display(snapshot.OsVersion),
            "معماری: " + Display(snapshot.Architecture),
            "وضعیت اتصال: " + (snapshot.Online ? "آنلاین" : "آفلاین"),
            "جمع‌آوری: " + CollectorPhase(snapshot.CollectorPhase),
            "همگام‌سازی: " + SyncPhase(snapshot.SyncPhase),
            "بازه نمونه‌برداری: " + Math.Max(snapshot.SampleIntervalSeconds, 0).ToString(CultureInfo.InvariantCulture) + " ثانیه",
            "نمونه‌های منتظر: " + snapshot.PendingCount.ToString(CultureInfo.InvariantCulture),
        };
        if (snapshot.CpuPercent is double cpu)
            lines.Add("پردازنده: " + cpu.ToString("0.##", CultureInfo.InvariantCulture) + "٪");
        if (snapshot.MemoryUsedBytes is long used && snapshot.MemoryTotalBytes is long total)
            lines.Add("حافظه: " + used.ToString(CultureInfo.InvariantCulture) + " / " + total.ToString(CultureInfo.InvariantCulture));
        if (snapshot.DiskFreeBytes is long free)
            lines.Add("فضای آزاد دیسک: " + free.ToString(CultureInfo.InvariantCulture));
        lines.Add(snapshot.LastHeartbeatAt is DateTimeOffset seen
            ? "آخرین ضربان موفق: " + When(seen.ToString("O", CultureInfo.InvariantCulture))
            : "آخرین ضربان موفق: ثبت نشده");
        if (snapshot.LastSuccessfulUploadAt is DateTimeOffset upload)
            lines.Add("آخرین ارسال موفق: " + When(upload.ToString("O", CultureInfo.InvariantCulture)));
        if (snapshot.NextRetryAt is DateTimeOffset retry)
            lines.Add("تلاش بعدی: " + When(retry.ToString("O", CultureInfo.InvariantCulture)));
        var message = TrilezApiException.Sanitize(snapshot.Message);
        if (!string.IsNullOrWhiteSpace(message)) lines.Add(message);
        return string.Join('\n', lines);
    }

    public static string UsageDetail(UsageSnapshot snapshot)
    {
        var lines = new List<string>();
        if (snapshot.SessionStartedAt is DateTimeOffset started) lines.Add("شروع نشست: " + When(started.ToString("O", CultureInfo.InvariantCulture)));
        if (snapshot.SessionEndedAt is DateTimeOffset ended) lines.Add("پایان نشست: " + When(ended.ToString("O", CultureInfo.InvariantCulture)));
        if (snapshot.LastSampleAt is DateTimeOffset sample) lines.Add("آخرین نمونه: " + When(sample.ToString("O", CultureInfo.InvariantCulture)));
        if (snapshot.LastSuccessfulUploadAt is DateTimeOffset upload) lines.Add("آخرین ارسال موفق: " + When(upload.ToString("O", CultureInfo.InvariantCulture)));
        lines.Add("نمونه‌های منتظر ارسال: " + snapshot.PendingIntervals.ToString(CultureInfo.InvariantCulture));
        if (!string.IsNullOrWhiteSpace(snapshot.Message)) lines.Add(snapshot.Message);
        return string.Join('\n', lines);
    }

    public static string EnrollmentDetail(DeviceEnrollmentSnapshot snapshot)
    {
        var lines = new List<string>();
        if (!string.IsNullOrWhiteSpace(snapshot.AgentVersion)) lines.Add($"نسخه عامل: {snapshot.AgentVersion}");
        if (snapshot.LastSeenAt is DateTimeOffset seen)
            lines.Add("آخرین دیده‌شدن: " + When(seen.ToString("O", CultureInfo.InvariantCulture)));
        if (!string.IsNullOrWhiteSpace(snapshot.EnrollmentId)) lines.Add($"شناسه دستگاه: {snapshot.EnrollmentId}");
        lines.Add(CapabilitiesLimited);
        if (!string.IsNullOrWhiteSpace(snapshot.Message)) lines.Add(snapshot.Message);
        return string.Join('\n', lines);
    }

    public static string TaskStatus(string? status) => status switch
    {
        "todo" => "انجام‌نشده",
        "in_progress" => "در حال انجام",
        "review" => "بازبینی",
        "done" => "انجام‌شده",
        null or "" => "بدون وضعیت",
        _ => "نامشخص",
    };

    public static string TimeStatus(string? status) => status switch
    {
        "pending_review" => "در انتظار بررسی",
        "approved" => "تأییدشده",
        "review_again" => "بررسی دوباره",
        "suspended" => "معلق",
        "rejected" => "رد شده",
        null or "" => "بدون وضعیت",
        _ => "نامشخص",
    };

    public static string MeetingStatus(string? status) => status switch
    {
        "scheduled" => "برنامه‌ریزی‌شده",
        "completed" => "برگزار شده",
        "cancelled" => "لغو شده",
        null or "" => "بدون وضعیت",
        _ => "نامشخص",
    };

    public static string AttendanceStatus(string? status) => status switch
    {
        "present" => "حاضر",
        "absent" => "غایب",
        "late" => "تأخیر",
        "leave" => "مرخصی",
        "mission" => "مأموریت",
        "remote" => "دورکار",
        null or "" => "بدون وضعیت",
        _ => "نامشخص",
    };

    public static string ProjectStatus(string? status) => status switch
    {
        "active" => "فعال",
        "on_hold" => "متوقف",
        "paused" => "متوقف",
        "completed" => "تمام‌شده",
        "cancelled" => "لغو شده",
        "planned" => "برنامه‌ریزی‌شده",
        "archived" => "بایگانی",
        null or "" => "بدون وضعیت",
        _ => "نامشخص",
    };

    public static string EmployeeState(string? state) => state switch
    {
        "active" => "پرونده کارمند فعال است",
        "inactive" => "پرونده کارمند فعال نیست",
        _ => "برای این حساب پرونده کارمندی ثبت نشده است",
    };

    public static string Connection(ConnectionState state) => state switch
    {
        ConnectionState.Connected => "متصل",
        ConnectionState.Offline => "آفلاین",
        ConnectionState.SessionExpired => "نشست منقضی شده",
        ConnectionState.Unauthorized => "اجازه دسترسی نیست",
        _ => "خطا",
    };

    public static string Role(string? role) => role switch
    {
        "admin" => "مدیر",
        "manager" => "مدیر پروژه",
        "member" => "عضو",
        "customer" => "مشتری",
        _ => "نقش نامشخص",
    };

    public static string Hours(double hours) =>
        hours.ToString("0.##", CultureInfo.InvariantCulture) + " ساعت";

    public static string Duration(int? minutes) =>
        minutes is null or < 0 ? "مدت نامشخص" : minutes.Value.ToString(CultureInfo.InvariantCulture) + " دقیقه";

    public static string Identity(EmployeeProfile profile)
    {
        var name = string.IsNullOrWhiteSpace(profile.Name) ? "کاربر" : profile.Name.Trim();
        var role = Role(profile.Role);
        var line = string.IsNullOrWhiteSpace(profile.Email) ? $"{name} — {role}" : $"{name} — {profile.Email.Trim()} — {role}";
        if (!string.IsNullOrWhiteSpace(profile.Title)) line += " — " + profile.Title.Trim();
        return line;
    }

    public static string Welcome(EmployeeProfile profile)
    {
        var name = string.IsNullOrWhiteSpace(profile.Name) ? "کاربر" : profile.Name.Trim();
        return $"سلام، {name}";
    }

    public static string ProjectName(IReadOnlyList<ProjectSummary> projects, string? projectId)
    {
        if (string.IsNullOrWhiteSpace(projectId)) return UnknownProject;
        foreach (var project in projects)
        {
            if (project.Id == projectId && !string.IsNullOrWhiteSpace(project.Name))
                return project.Name;
        }
        return UnknownProject;
    }

    public static string TaskTitle(IReadOnlyList<WorkTask> tasks, string? taskId)
    {
        if (string.IsNullOrWhiteSpace(taskId)) return UnknownTask;
        foreach (var task in tasks)
        {
            if (task.Id == taskId && !string.IsNullOrWhiteSpace(task.Title))
                return task.Title;
        }
        return UnknownTask;
    }

    public static bool IsUpcoming(MeetingSummary meeting, DateTimeOffset now)
    {
        if (meeting.Status is "cancelled" or "completed") return false;
        if (string.IsNullOrWhiteSpace(meeting.StartAt)
            || !DateTimeOffset.TryParse(meeting.StartAt, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var start))
            return true;
        var end = start.AddMinutes(meeting.DurationMinutes ?? 0);
        return end >= now;
    }

    public static string When(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "بدون تاریخ";
        if (value.Length == 10 && DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
            return DashboardText.FormatDate(value);
        if (DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var timestamp))
        {
            var tehran = timestamp.ToOffset(TehranOffset);
            var day = DateOnly.FromDateTime(tehran.DateTime).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            return DashboardText.FormatDate(day) + " " + tehran.ToString("HH:mm", CultureInfo.InvariantCulture);
        }
        return DashboardText.FormatDate(value);
    }

    public static string HostOnly(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return HostMissing;
        if (!Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri) || string.IsNullOrEmpty(uri.Host))
            return HostMissing;
        return uri.IdnHost;
    }

    public static string Diagnostics(string version, string? apiBaseUrl, DateTimeOffset? lastSyncUtc, bool signedIn, ConnectionState connection, HealthSnapshot? health = null, ScreenShareSnapshot? screen = null)
    {
        var sync = lastSyncUtc is null
            ? NoSuccessfulSync
            : "آخرین همگام‌سازی موفق: " + When(lastSyncUtc.Value.ToString("O", CultureInfo.InvariantCulture));
        var connectionLabel = signedIn ? Connection(connection) : SignedOutConnection;
        var lines = new List<string>
        {
            $"نسخه عامل: {version}",
            sync,
            $"میزبان API: {HostOnly(apiBaseUrl)}",
            $"وضعیت اتصال: {connectionLabel}",
            TelemetryOff,
            ScreenSharingOff,
        };
        if (health is not null) lines.Add(HealthDetail(health));
        if (screen is not null) lines.Add(ScreenShareDetail(screen));
        lines.Add(DiagnosticsFootnote);
        return string.Join('\n', lines);
    }

    private static string Display(string? value)
    {
        var safe = TrilezApiException.Sanitize(value);
        return string.IsNullOrWhiteSpace(safe) ? "نامشخص" : safe;
    }

    public static bool TryParseHours(string? text, out decimal hours)
    {
        hours = 0;
        if (string.IsNullOrWhiteSpace(text)) return false;
        var normalized = NormalizeNumber(text);
        if (!decimal.TryParse(normalized, NumberStyles.Number, CultureInfo.InvariantCulture, out hours)) return false;
        return hours >= 0.01m && hours <= 24m;
    }

    public static bool TryParseDate(string? text, out string iso)
    {
        iso = "";
        if (string.IsNullOrWhiteSpace(text)) return false;
        var normalized = NormalizeDigits(text.Trim());
        if (!IsoDate().IsMatch(normalized)) return false;
        if (!DateOnly.TryParseExact(normalized, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
            return false;
        iso = normalized;
        return true;
    }

    public static string SectionMessage(EmployeeDashboard dashboard, string source, bool empty, string emptyText)
    {
        foreach (var error in dashboard.Errors)
        {
            if (error.Source == source) return error.Message;
        }
        return empty ? emptyText : "";
    }

    private static string NormalizeNumber(string text)
    {
        var chars = NormalizeDigits(text.Trim()).ToCharArray();
        for (var i = 0; i < chars.Length; i++)
        {
            if (chars[i] is ',' or '٫') chars[i] = '.';
        }
        return new string(chars);
    }

    private static string NormalizeDigits(string text)
    {
        var chars = text.ToCharArray();
        for (var i = 0; i < chars.Length; i++)
        {
            if (chars[i] is >= '۰' and <= '۹') chars[i] = (char)('0' + (chars[i] - '۰'));
            else if (chars[i] is >= '٠' and <= '٩') chars[i] = (char)('0' + (chars[i] - '٠'));
        }
        return new string(chars);
    }

    [GeneratedRegex("^\\d{4}-\\d{2}-\\d{2}$")]
    private static partial Regex IsoDate();
}
