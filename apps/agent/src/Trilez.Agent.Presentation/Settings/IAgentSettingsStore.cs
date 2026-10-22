namespace Trilez.Agent.Presentation;

public interface IAgentSettingsStore
{
    AgentSettings Load();
    Task SaveAsync(AgentSettings settings, CancellationToken cancellationToken = default);
}
