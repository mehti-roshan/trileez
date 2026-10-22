namespace Trilez.Agent.Presentation;

public sealed class AgentSettings
{
    public string ApiBaseUrl { get; set; } = "";
    public DateTimeOffset? LastSuccessfulSyncUtc { get; set; }

    /// <summary>Visible per-user startup. Default is off. This is not a service or a scheduled task.</summary>
    public bool StartWithWindows { get; set; }

    public AgentSettings WithConnection(string apiBaseUrl, DateTimeOffset? lastSuccessfulSyncUtc) => new()
    {
        ApiBaseUrl = apiBaseUrl,
        LastSuccessfulSyncUtc = lastSuccessfulSyncUtc,
        StartWithWindows = StartWithWindows,
    };
}
