namespace Trilez.Agent.Presentation;

public static class AgentDataPaths
{
    public const string LogDirectoryName = "logs";
    public const string UninstallScriptName = "Uninstall-TrilezAgent.ps1";

    public static readonly string[] KnownUserFiles =
    [
        "agent-settings.json",
        "agent-settings.json.tmp",
        "device-credential.json",
        "device-credential.json.tmp",
        "usage-queue.json",
        "usage-queue.json.tmp",
        "health-queue.json",
        "health-queue.json.tmp",
        "agent.lock",
        "install-flags.json",
    ];

    public static readonly string[] KnownLogFiles = ["agent.log", "agent.log.1"];
}
