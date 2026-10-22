using Trilez.Agent.Presentation;
using Xunit;

namespace Trilez.Agent.Presentation.Tests;

public sealed class RemoteInputGateTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-10-16T08:00:00Z");
    private static readonly DateTimeOffset Later = Now.AddMinutes(10);
    private const string Grant = "cg-11111111-1111-4111-8111-111111111111";

    [Fact]
    public void AuthorizationFailuresAndACompleteGrantAllRefuseInput()
    {
        AssertClosed(RemoteInputGate.Evaluate(false, "active", "granted", Grant, Grant, Later, Now), "capability");
        AssertClosed(RemoteInputGate.Evaluate(true, "requested", "granted", Grant, Grant, Later, Now), "session");
        AssertClosed(RemoteInputGate.Evaluate(true, "ended", "granted", Grant, Grant, Later, Now), "session");
        AssertClosed(RemoteInputGate.Evaluate(true, "active", "requested", Grant, Grant, Later, Now), "not_granted");
        AssertClosed(RemoteInputGate.Evaluate(true, "active", "revoked", Grant, Grant, Later, Now), "not_granted");
        AssertClosed(RemoteInputGate.Evaluate(true, "active", "granted", Grant, "cg-00000000-0000-4000-8000-000000000000", Later, Now), "grant");
        AssertClosed(RemoteInputGate.Evaluate(true, "active", "granted", " ", Grant, Later, Now), "grant");
        AssertClosed(RemoteInputGate.Evaluate(true, "active", "granted", Grant, Grant, Now, Now), "expired");
        AssertClosed(RemoteInputGate.Evaluate(true, "active", "granted", Grant, Grant, null, Now), "expired");
        AssertClosed(RemoteInputGate.Evaluate(true, "active", "granted", Grant, Grant, Later, Now), "input_plane_unavailable");
    }

    private static void AssertClosed(RemoteInputDecision decision, string reason)
    {
        Assert.False(decision.Allowed);
        Assert.Equal(reason, decision.Reason);
    }
}
