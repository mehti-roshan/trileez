namespace Trilez.Agent;

public sealed class TrilezApiException : Exception
{
    public int Status { get; }
    public string? Code { get; }
    public string? ServerError { get; }
    public IReadOnlyList<ApiIssue> Issues { get; }

    public TrilezApiException(int status, string? code, string? serverError, IReadOnlyList<ApiIssue>? issues = null)
        : base(UserMessages.For(status, code))
    {
        Status = status;
        Code = code;
        ServerError = Sanitize(serverError);
        Issues = issues ?? [];
    }

    public static string? Sanitize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 300) return null;
        if (value.Contains("Bearer ", StringComparison.OrdinalIgnoreCase)) return null;
        if (value.Contains("eyJ", StringComparison.Ordinal)) return null;
        if (value.Contains("password", StringComparison.OrdinalIgnoreCase)) return null;
        if (value.Contains("token", StringComparison.OrdinalIgnoreCase)) return null;
        if (value.Contains("credential", StringComparison.OrdinalIgnoreCase)) return null;
        if (System.Text.RegularExpressions.Regex.IsMatch(value, "^[A-Za-z0-9_-]{32,}$")) return null;
        return value;
    }
}

public static class UserMessages
{
    public static string For(int status, string? code)
    {
        if (code == "PASSWORD_CHANGE_REQUIRED") return "قبل از ادامه باید رمز عبور را تغییر دهید.";
        if (code == "DEVICE_REVOKED") return "ثبت این دستگاه لغو شده است.";
        if (code == "DEVICE_DISABLED") return "این دستگاه غیرفعال شده است.";
        if (code == "DEVICE_CREDENTIAL_REJECTED") return "اعتبار دستگاه پذیرفته نشد. دوباره دستگاه را ثبت کنید.";
        if (code == "DEVICE_INSTALLATION_CONFLICT") return "این نصب برای حساب دیگری ثبت شده است.";
        if (code == "USAGE_DISABLED") return "جمع‌آوری استفاده برای این سازمان خاموش است.";
        if (code == "USAGE_PAUSED") return "جمع‌آوری استفاده متوقف شده است.";
        if (code == "USAGE_CAPABILITY") return "این دستگاه اجازه گزارش استفاده را ندارد.";
        if (code == "USAGE_RETENTION") return "نمونه قدیمی‌تر از مدت نگهداری است.";
        if (code == "USAGE_DURATION") return "مدت استفاده‌ی این بازه بیش از حد مجاز است.";
        if (code == "USAGE_PAUSE_NOT_ALLOWED") return "توقف جمع‌آوری برای این حساب مجاز نیست.";
        if (code == "USAGE_INTERVAL_CONFLICT") return "شناسه بازه با برنامه دیگری ثبت شده است.";
        if (code == "HEALTH_CAPABILITY") return "این دستگاه اجازه گزارش سلامت را ندارد.";
        if (code == "HEALTH_RETENTION") return "نمونه سلامت قدیمی‌تر از مدت نگهداری است.";
        if (code == "HEALTH_SAMPLE_CONFLICT") return "شناسه نمونه سلامت با محتوای دیگری ثبت شده است.";
        if (code == "PAYLOAD_TOO_LARGE") return "حجم گزارش سلامت بیش از حد مجاز است.";
        if (code == "SCREEN_CAPABILITY") return "این دستگاه اجازه اشتراک صفحه را ندارد.";
        if (code == "SCREEN_NOT_ACTIVE") return "اشتراک صفحه هنوز آغاز نشده است.";
        if (code == "SCREEN_SESSION_ENDED") return "جلسه اشتراک صفحه پایان یافته است.";
        if (code == "SCREEN_SESSION_ACTIVE") return "برای این دستگاه یک جلسه اشتراک صفحه باز است.";
        if (code == "SCREEN_VIEW_FORBIDDEN") return "اجازه دیدن این جلسه اشتراک صفحه را ندارید.";
        if (code == "SCREEN_FRAME_TOO_LARGE") return "تصویر صفحه بزرگ‌تر از حد مجاز است.";
        if (code == "SCREEN_FRAME_INVALID") return "تصویر صفحه قابل پذیرش نیست.";
        if (code == "REMOTE_CONTROL_CAPABILITY") return "این دستگاه اجازه کنترل از راه دور را ندارد.";
        if (code == "REMOTE_CONTROL_REQUIRED") return "کنترل از راه دور مجاز نیست.";
        if (code == "REMOTE_CONTROL_GRANTED") return "کنترل از راه دور از قبل مجاز شده است.";
        if (code == "REMOTE_CONTROL_EXPIRED") return "مهلت کنترل از راه دور تمام شده است.";
        if (code == "REMOTE_CONTROL_REVOKED") return "کنترل از راه دور لغو شده است.";
        if (code == "REMOTE_GRANT_INVALID") return "مجوز کنترل دیگر معتبر نیست.";
        if (code == "REMOTE_INPUT_UNAVAILABLE") return "اعمال ورودی از راه دور در این نسخه انجام نمی‌شود.";
        if (code is "SESSION_REVOKED" or "OFFLINE") return status == 0
            ? "ارتباط با تری‌لیز برقرار نشد."
            : "نشست لغو یا منقضی شده است. دوباره وارد شوید.";
        if (status == 0) return "ارتباط با تری‌لیز برقرار نشد.";
        if (status == 401) return "برای ادامه باید دوباره وارد تری‌لیز شوید.";
        if (status == 403) return "اجازه این کار را ندارید.";
        if (status == 404) return "مورد درخواستی پیدا نشد.";
        if (status >= 500) return "خطای داخلی سرور رخ داد. دوباره تلاش کنید.";
        return "درخواست نامعتبر است.";
    }
}
