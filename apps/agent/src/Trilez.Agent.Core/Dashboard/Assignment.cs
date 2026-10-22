namespace Trilez.Agent;

public static class Assignment
{
    public static bool IsAssignedTo(WorkTask task, string userId) =>
        IsAssignedTo(task, string.IsNullOrWhiteSpace(userId) ? [] : [userId]);

    public static bool IsAssignedTo(WorkTask task, IEnumerable<string> aliases)
    {
        var ids = Ids(aliases);
        if (ids.Count == 0) return false;
        if (task.AssigneeId is not null && ids.Contains(task.AssigneeId)) return true;
        return task.AssigneeIds?.Any(ids.Contains) == true;
    }

    public static bool IsInMeeting(MeetingSummary meeting, string userId) =>
        IsInMeeting(meeting, string.IsNullOrWhiteSpace(userId) ? [] : [userId]);

    public static bool IsInMeeting(MeetingSummary meeting, IEnumerable<string> aliases)
    {
        var ids = Ids(aliases);
        if (ids.Count == 0) return false;
        if (meeting.OrganizerId is not null && ids.Contains(meeting.OrganizerId)) return true;
        if (meeting.ParticipantIds?.Any(ids.Contains) == true) return true;
        return meeting.EmployeeIds?.Any(ids.Contains) == true;
    }

    private static HashSet<string> Ids(IEnumerable<string> aliases) =>
        aliases.Where(id => !string.IsNullOrWhiteSpace(id)).ToHashSet(StringComparer.Ordinal);
}
