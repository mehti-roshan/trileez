using System.Runtime.InteropServices;

namespace Trilez.Agent.Presentation;

public sealed partial class TrilezEmployeeWorkspace
{
    public async Task<DeviceCommandResult> EnrollDeviceAsync(string deviceName, CancellationToken cancellationToken = default)
    {
        if (_client is null || string.IsNullOrWhiteSpace(_session?.AccessToken))
            return DeviceCommandResult.Expired(UserMessages.For(401, "SESSION_REVOKED"));
        var name = (deviceName ?? "").Trim();
        if (name.Length is < 1 or > 80)
            return DeviceCommandResult.Fail(PresentationText.DeviceNameRequired, Enrollment);

        var local = _devices.Load();
        var installationId = local?.InstallationId;
        var secret = local?.Secret;
        string attemptedId;
        if (string.IsNullOrWhiteSpace(installationId) || local?.Status == "revoked")
        {
            attemptedId = Guid.NewGuid().ToString("D");
            secret = null;
        }
        else
        {
            attemptedId = installationId;
        }

        try
        {
            AgentDeviceEnrollment registered;
            try
            {
                registered = await RegisterAsync(attemptedId, name, secret, cancellationToken);
            }
            catch (TrilezApiException error) when (error.Code == "DEVICE_INSTALLATION_CONFLICT")
            {
                attemptedId = Guid.NewGuid().ToString("D");
                secret = null;
                registered = await RegisterAsync(attemptedId, name, null, cancellationToken);
            }

            return AcceptRegistration(registered, attemptedId, secret);
        }
        catch (TrilezApiException error) when (error.Code == "DEVICE_REVOKED")
        {
            StopHeartbeat();
            StopUsage("stop");
            StopScreenLocal();
            StopHealth("revoked");
            _devices.Save(new StoredDeviceCredential
            {
                InstallationId = attemptedId,
                EnrollmentId = local?.EnrollmentId,
                Secret = secret,
                DeviceName = name,
                Status = "revoked",
            });
            SetEnrollment(new DeviceEnrollmentSnapshot
            {
                Phase = "revoked",
                ConnectionStatus = "offline",
                EnrollmentId = local?.EnrollmentId,
                InstallationId = attemptedId,
                DeviceName = name,
                Message = error.Message,
            });
            _log?.Write("enrollment", "revoked status=" + error.Status + " code=DEVICE_REVOKED");
            return DeviceCommandResult.Fail(error.Message, Enrollment);
        }
        catch (TrilezApiException error) when (error.Status == 401 || error.Code == "SESSION_REVOKED")
        {
            LoseSession(error);
            return DeviceCommandResult.Expired(error.Message);
        }
        catch (TrilezApiException error)
        {
            return DeviceCommandResult.Fail(error.Message, Enrollment);
        }
    }

    public async Task<DeviceCommandResult> UnregisterDeviceAsync(CancellationToken cancellationToken = default)
    {
        if (_client is null || string.IsNullOrWhiteSpace(_session?.AccessToken))
            return DeviceCommandResult.Expired(UserMessages.For(401, "SESSION_REVOKED"));
        var local = _devices.Load();
        if (string.IsNullOrWhiteSpace(local?.EnrollmentId) || string.IsNullOrWhiteSpace(local.Secret))
            return DeviceCommandResult.Fail(PresentationText.DeviceNotEnrolled, Enrollment);

        try
        {
            await FinishUsageAsync("stop", cancellationToken);
            await StopScreenAsync("shutdown", cancellationToken);
            StopHealth("stopped");
            var row = await _client.UnregisterAgentDeviceAsync(local.EnrollmentId, local.Secret, cancellationToken);
            if (!string.Equals(row.Status, "revoked", StringComparison.Ordinal) || string.IsNullOrWhiteSpace(row.Id))
            {
                if (local.Status is null or "active")
                {
                    StartUsage();
                    StartHealth();
                    StartScreen();
                }
                return DeviceCommandResult.Fail(PresentationText.GenericFailure, SnapshotOf(row, PresentationText.GenericFailure));
            }
            StopHeartbeat();
            StopUsage("stop");
            StopScreenLocal();
            StopHealth("revoked");
            _devices.Clear();
            var snapshot = DeviceEnrollmentSnapshot.Unenrolled();
            SetEnrollment(snapshot);
            return DeviceCommandResult.Ok(snapshot, PresentationText.DeviceUnregistered);
        }
        catch (TrilezApiException error) when (error.Code == "DEVICE_REVOKED")
        {
            StopHeartbeat();
            StopUsage("stop");
            StopScreenLocal();
            StopHealth("revoked");
            _devices.Clear();
            var snapshot = new DeviceEnrollmentSnapshot
            {
                Phase = "revoked",
                ConnectionStatus = "offline",
                Message = error.Message,
            };
            SetEnrollment(snapshot);
            return DeviceCommandResult.Fail(error.Message, snapshot);
        }
        catch (TrilezApiException error) when (error.Status == 401 || error.Code == "SESSION_REVOKED")
        {
            LoseSession(error);
            return DeviceCommandResult.Expired(error.Message);
        }
        catch (TrilezApiException error)
        {
            if (local.Status is null or "active")
            {
                StartUsage();
                StartHealth();
                StartScreen();
            }
            return DeviceCommandResult.Fail(error.Message, Enrollment);
        }
    }

    private async Task AttachStoredEnrollmentAsync(CancellationToken cancellationToken)
    {
        var local = _devices.Load();
        if (_client is null || local is null || string.IsNullOrWhiteSpace(local.EnrollmentId) || string.IsNullOrWhiteSpace(local.Secret))
        {
            StopHeartbeat();
            StopUsage("stop");
            StopScreenLocal();
            StopHealth("stopped");
            SetEnrollment(DeviceEnrollmentSnapshot.Unenrolled());
            return;
        }

        try
        {
            var row = await _client.GetAgentDeviceAsync(local.EnrollmentId, cancellationToken);
            RememberServerEnrollment(local.InstallationId, local.Secret, row, null);
        }
        catch (TrilezApiException error) when (error.Status == 404)
        {
            StopHeartbeat();
            StopUsage("stop");
            StopScreenLocal();
            StopHealth("stopped");
            SetEnrollment(DeviceEnrollmentSnapshot.Unenrolled());
        }
        catch (TrilezApiException error) when (error.Status == 401 || error.Code == "SESSION_REVOKED")
        {
            LoseSession(error);
        }
        catch (TrilezApiException error)
        {
            StopHeartbeat();
            StopUsage("stop");
            StopScreenLocal();
            StopHealth("stopped");
            SetEnrollment(new DeviceEnrollmentSnapshot
            {
                Phase = string.IsNullOrWhiteSpace(local.Status) ? "unenrolled" : local.Status!,
                ConnectionStatus = "offline",
                EnrollmentId = local.EnrollmentId,
                InstallationId = local.InstallationId,
                DeviceName = local.DeviceName ?? "",
                Message = error.Message,
                CanUnregister = local.Status is "active" or "disabled",
            });
        }
    }

    private DeviceCommandResult AcceptRegistration(AgentDeviceEnrollment registered, string installationId, string? previousSecret)
    {
        var row = registered.Data;
        if (row is null || string.IsNullOrWhiteSpace(row.Id))
            return DeviceCommandResult.Fail(UserMessages.For(500, null), Enrollment);
        var secret = string.IsNullOrWhiteSpace(registered.Credential) ? previousSecret : registered.Credential;
        if (row.Status == "active" && string.IsNullOrWhiteSpace(secret))
            return DeviceCommandResult.Fail(UserMessages.For(500, null), SnapshotOf(row, UserMessages.For(500, null)));
        _devices.Save(new StoredDeviceCredential
        {
            InstallationId = string.IsNullOrWhiteSpace(row.InstallationId) ? installationId : row.InstallationId,
            EnrollmentId = row.Id,
            Secret = secret,
            DeviceName = string.IsNullOrWhiteSpace(row.DeviceName) ? null : row.DeviceName,
            Status = row.Status,
        });
        var snapshot = SnapshotOf(row, null);
        SetEnrollment(snapshot);
        if (row.Status == "active")
        {
            StartHeartbeat();
            StartUsage();
            StartHealth();
            StartScreen();
        }
        else
        {
            StopHeartbeat();
            StopUsage(row.Status == "disabled" ? "disabled" : "stop");
            StopScreenLocal();
            StopHealth(row.Status == "revoked" ? "revoked" : "stopped");
        }
        if (row.Status == "disabled") return DeviceCommandResult.Fail(UserMessages.For(403, "DEVICE_DISABLED"), snapshot);
        if (row.Status == "revoked") return DeviceCommandResult.Fail(UserMessages.For(403, "DEVICE_REVOKED"), snapshot);
        return DeviceCommandResult.Ok(snapshot, PresentationText.DeviceEnrolled(row.Id));
    }

    private void RememberServerEnrollment(string installationId, string secret, AgentDeviceRecord row, string? message)
    {
        _devices.Save(new StoredDeviceCredential
        {
            InstallationId = string.IsNullOrWhiteSpace(row.InstallationId) ? installationId : row.InstallationId!,
            EnrollmentId = row.Id,
            Secret = secret,
            DeviceName = row.DeviceName,
            Status = row.Status,
        });
        SetEnrollment(SnapshotOf(row, message));
        if (row.Status == "active")
        {
            StartHeartbeat();
            StartUsage();
            StartHealth();
            StartScreen();
        }
        else
        {
            StopHeartbeat();
            StopUsage(row.Status == "disabled" ? "disabled" : "stop");
            StopScreenLocal();
            StopHealth(row.Status == "revoked" ? "revoked" : "stopped");
        }
    }

    private async Task<AgentDeviceEnrollment> RegisterAsync(string installationId, string deviceName, string? currentCredential, CancellationToken cancellationToken)
    {
        var description = RuntimeInformation.OSDescription.Trim();
        if (description.Length > 160) description = description[..160];
        return await _client!.RegisterAgentDeviceAsync(new AgentDeviceRegistration
        {
            InstallationId = installationId,
            DeviceName = deviceName,
            AgentVersion = AgentInfo.Version,
            Capabilities = AgentDeviceCapabilities.Supported,
            Platform = Environment.OSVersion.Platform.ToString(),
            OsDescription = description,
        }, currentCredential, cancellationToken);
    }

    private async Task BeatAsync(CancellationToken cancellationToken)
    {
        var local = _devices.Load();
        if (_client is null || string.IsNullOrWhiteSpace(local?.EnrollmentId) || string.IsNullOrWhiteSpace(local.Secret))
        {
            StopHeartbeat();
            return;
        }

        try
        {
            var row = await _client.HeartbeatAgentDeviceAsync(local.EnrollmentId, local.Secret, AgentInfo.Version, AgentDeviceCapabilities.Supported, cancellationToken);
            if (_beatOffline)
            {
                _beatOffline = false;
                _log?.Write("connection", "heartbeat recovered");
            }
            RememberServerEnrollment(local.InstallationId, local.Secret, row, null);
        }
        catch (TrilezApiException error) when (error.Code == "DEVICE_REVOKED")
        {
            _log?.Write("enrollment", "revoked status=" + error.Status + " code=DEVICE_REVOKED");
            StopHeartbeat();
            StopUsage("stop");
            StopScreenLocal();
            StopHealth("revoked");
            _devices.Save(local with { Status = "revoked" });
            SetEnrollment(new DeviceEnrollmentSnapshot
            {
                Phase = "revoked",
                ConnectionStatus = "offline",
                EnrollmentId = local.EnrollmentId,
                InstallationId = local.InstallationId,
                DeviceName = local.DeviceName ?? "",
                Message = error.Message,
            });
        }
        catch (TrilezApiException error) when (error.Code == "DEVICE_DISABLED")
        {
            _log?.Write("enrollment", "disabled status=" + error.Status + " code=DEVICE_DISABLED");
            StopHeartbeat();
            StopUsage("disabled");
            StopScreenLocal();
            StopHealth("stopped");
            _devices.Save(local with { Status = "disabled" });
            SetEnrollment(new DeviceEnrollmentSnapshot
            {
                Phase = "disabled",
                ConnectionStatus = "offline",
                EnrollmentId = local.EnrollmentId,
                InstallationId = local.InstallationId,
                DeviceName = local.DeviceName ?? "",
                Message = error.Message,
                CanUnregister = true,
            });
        }
        catch (TrilezApiException error) when (error.Code == "DEVICE_CREDENTIAL_REJECTED")
        {
            _log?.Write("enrollment", "credential rejected status=" + error.Status + " code=DEVICE_CREDENTIAL_REJECTED");
            StopHeartbeat();
            StopUsage("stop");
            StopScreenLocal();
            StopHealth("stopped");
            SetEnrollment(new DeviceEnrollmentSnapshot
            {
                Phase = string.IsNullOrWhiteSpace(local.Status) ? "active" : local.Status!,
                ConnectionStatus = "offline",
                EnrollmentId = local.EnrollmentId,
                InstallationId = local.InstallationId,
                DeviceName = local.DeviceName ?? "",
                Message = error.Message,
                CanUnregister = false,
            });
        }
        catch (TrilezApiException error) when (error.Status == 401 || error.Code == "SESSION_REVOKED")
        {
            LoseSession(error);
        }
        catch (TrilezApiException error)
        {
            if (!_beatOffline)
            {
                _beatOffline = true;
                _log?.Write("connection", "heartbeat offline status=" + error.Status + " code=" + (error.Code ?? "") + " retry=true");
            }
            SetEnrollment(new DeviceEnrollmentSnapshot
            {
                Phase = string.IsNullOrWhiteSpace(local.Status) ? "active" : local.Status!,
                ConnectionStatus = "offline",
                EnrollmentId = local.EnrollmentId,
                InstallationId = local.InstallationId,
                DeviceName = local.DeviceName ?? "",
                AgentVersion = Enrollment.AgentVersion,
                LastSeenAt = Enrollment.LastSeenAt,
                Message = error.Message,
                CanUnregister = local.Status is null or "active" or "disabled",
            });
        }
    }

    private static DeviceEnrollmentSnapshot SnapshotOf(AgentDeviceRecord row, string? message) => new()
    {
        Phase = string.IsNullOrWhiteSpace(row.Status) ? "unenrolled" : row.Status!,
        ConnectionStatus = row.ConnectionStatus == "online" ? "online" : "offline",
        EnrollmentId = row.Id,
        InstallationId = row.InstallationId,
        DeviceName = row.DeviceName ?? "",
        AgentVersion = row.AgentVersion,
        LastSeenAt = row.LastSeenAt,
        Message = message,
        CanUnregister = row.Status is "active" or "disabled",
    };

    private void RememberBlockedEnrollment()
    {
        StopHeartbeat();
        StopUsage("stop");
        StopScreenLocal();
        StopHealth("stopped");
        SetEnrollment(DeviceEnrollmentSnapshot.Unenrolled(PresentationText.PasswordChangeMessage));
    }

    private void HandleUsageAuthorization(TrilezApiException error)
    {
        if (error.Code == "DEVICE_CREDENTIAL_REJECTED")
        {
            StopScreenLocal();
            StopHealth("stopped");
            return;
        }
        if (error.Code == "DEVICE_REVOKED")
        {
            var local = _devices.Load();
            StopUsage("stop");
            StopScreenLocal();
            StopHealth("revoked");
            if (local is not null) _devices.Save(local with { Status = "revoked" });
            SetEnrollment(new DeviceEnrollmentSnapshot
            {
                Phase = "revoked",
                ConnectionStatus = "offline",
                EnrollmentId = local?.EnrollmentId,
                InstallationId = local?.InstallationId,
                DeviceName = local?.DeviceName ?? "",
                Message = error.Message,
            });
            return;
        }
        if (error.Status == 401 || error.Code == "SESSION_REVOKED") LoseSession(error);
    }

    private void StartHeartbeat() => _heartbeat.Start(PeriodicHeartbeatTicker.Interval, BeatAsync);

    private void StopHeartbeat() => _heartbeat.Stop();

    private void SetEnrollment(DeviceEnrollmentSnapshot snapshot)
    {
        Enrollment = snapshot;
        EnrollmentChanged?.Invoke(this, EventArgs.Empty);
    }
}
