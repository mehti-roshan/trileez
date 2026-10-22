using System.Globalization;

namespace Trilez.Agent;

public static class TehranCalendar
{
    private static readonly TimeSpan Offset = TimeSpan.FromHours(3.5);

    public static DateOnly Today(DateTimeOffset? now = null)
    {
        var instant = now ?? DateTimeOffset.UtcNow;
        return DateOnly.FromDateTime(instant.ToOffset(Offset).DateTime);
    }

    public static bool IsSameDay(string? value, DateOnly day)
    {
        if (string.IsNullOrWhiteSpace(value)) return false;
        if (value.Length == 10 && DateOnly.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dateOnly))
            return dateOnly == day;
        if (DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var timestamp))
            return DateOnly.FromDateTime(timestamp.ToOffset(Offset).DateTime) == day;
        return false;
    }

    public static string? Clock(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var timestamp))
            return null;
        return timestamp.ToOffset(Offset).ToString("HH:mm", CultureInfo.InvariantCulture);
    }
}