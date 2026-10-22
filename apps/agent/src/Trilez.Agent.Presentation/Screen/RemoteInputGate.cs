namespace Trilez.Agent.Presentation;

/// <summary>
/// Decides whether remote input may be applied. The answer is always no.
/// A valid grant still does not inject keyboard or mouse input: this agent has no
/// separate input channel, and raw input would be able to open a shell.
/// Windows SendInput is intentionally not implemented.
/// </summary>
public readonly record struct RemoteInputDecision(bool Allowed, string Reason);

public static class RemoteInputGate
{
    public static RemoteInputDecision Evaluate(
        bool deviceAllowsControl,
        string? sessionState,
        string? controlState,
        string? grantId,
        string? presentedGrantId,
        DateTimeOffset? expiresAt,
        DateTimeOffset now)
    {
        if (!deviceAllowsControl) return new RemoteInputDecision(false, "capability");
        if (!string.Equals(sessionState, "active", StringComparison.Ordinal)) return new RemoteInputDecision(false, "session");
        if (!string.Equals(controlState, "granted", StringComparison.Ordinal)) return new RemoteInputDecision(false, "not_granted");
        if (string.IsNullOrWhiteSpace(grantId) || !string.Equals(grantId, presentedGrantId, StringComparison.Ordinal))
            return new RemoteInputDecision(false, "grant");
        if (expiresAt is null || now >= expiresAt.Value) return new RemoteInputDecision(false, "expired");
        return new RemoteInputDecision(false, "input_plane_unavailable");
    }
}
