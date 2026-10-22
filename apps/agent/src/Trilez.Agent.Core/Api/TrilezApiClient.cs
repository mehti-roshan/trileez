using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Trilez.Agent;

public sealed class TrilezApiClient
{
    public const int PageLimit = 200;
    public const int MaxPages = 50;
    private static readonly Regex DeviceIdPattern = new("^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$", RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private readonly HttpClient _http;
    private readonly Uri _base;
    private readonly SessionState _session;

    public TrilezApiClient(HttpClient http, Uri baseAddress, SessionState session)
    {
        _http = http;
        _base = NormalizeBase(baseAddress.AbsoluteUri);
        _session = session;
    }

    public static Uri NormalizeBase(string value)
    {
        if (string.IsNullOrWhiteSpace(value) || !Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri))
            throw new ArgumentException("API base URL must be an absolute http or https URL.");
        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
            throw new ArgumentException("API base URL must use http or https.");
        if (!string.IsNullOrEmpty(uri.UserInfo))
            throw new ArgumentException("API base URL must not contain credentials.");
        return new Uri(uri.GetLeftPart(UriPartial.Authority) + "/");
    }

    public static TrilezApiClient Create(string baseAddress, SessionState session)
    {
        var handler = new HttpClientHandler { UseCookies = true, CookieContainer = new CookieContainer() };
        var http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(30) };
        return new TrilezApiClient(http, NormalizeBase(baseAddress), session);
    }

    public async Task<bool> IsAliveAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            using var response = await SendRawAsync(HttpMethod.Get, "/api/health/live", null, authorize: false, cancellationToken);
            if (!response.IsSuccessStatusCode) return false;
            var health = await ReadBodyAsync<HealthResponse>(response, cancellationToken);
            return health?.Ok == true;
        }
        catch (HttpRequestException)
        {
            return false;
        }
        catch (TrilezApiException error) when (error.Status == 0)
        {
            return false;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return false;
        }
    }

    public async Task<EmployeeProfile> LoginAsync(string email, string password, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrEmpty(password))
            throw new ArgumentException("Email and password are required.");
        var json = JsonSerializer.Serialize(new Dictionary<string, string> { ["email"] = email.Trim(), ["password"] = password }, AgentJson.Options);
        using var response = await SendRawAsync(HttpMethod.Post, "/api/auth/login", json, authorize: false, cancellationToken);
        var payload = await ReadSuccessAsync<AuthResponse>(response, cancellationToken);
        if (string.IsNullOrWhiteSpace(payload.Token) || payload.User is null || string.IsNullOrWhiteSpace(payload.User.Id))
            throw new TrilezApiException((int)response.StatusCode, "INVALID_LOGIN", "Login response did not include a session");
        _session.AccessToken = payload.Token;
        return payload.User;
    }

    public async Task LogoutAsync(CancellationToken cancellationToken = default)
    {
        using var response = await SendAsync(HttpMethod.Post, "/api/auth/logout", null, authorize: true, cancellationToken);
        _session.Clear();
        if (response.StatusCode == HttpStatusCode.NoContent || response.IsSuccessStatusCode) return;
        throw await ExceptionFromAsync(response, cancellationToken);
    }

    public async Task<EmployeeProfile> GetMeAsync(CancellationToken cancellationToken = default)
    {
        using var response = await SendAsync(HttpMethod.Get, "/api/auth/me", null, authorize: true, cancellationToken);
        var payload = await ReadSuccessAsync<MeResponse>(response, cancellationToken);
        if (payload.User is null || string.IsNullOrWhiteSpace(payload.User.Id))
            throw new TrilezApiException((int)response.StatusCode, "INVALID_PROFILE", "Profile has no id");
        var link = payload.Employee;
        if (link is null)
        {
            payload.User.EmployeeState = string.IsNullOrWhiteSpace(payload.User.EmployeeId) ? "none" : payload.User.EmployeeState;
            if (payload.User.EmployeeState == "none") payload.User.EmployeeId = null;
        }
        else
        {
            payload.User.EmployeeState = string.IsNullOrWhiteSpace(link.State) ? "none" : link.State;
            payload.User.EmployeeId = payload.User.EmployeeState == "active" && !string.IsNullOrWhiteSpace(link.EmployeeId) ? link.EmployeeId : null;
            payload.User.EmploymentStatus = string.IsNullOrWhiteSpace(link.EmploymentStatus) ? null : link.EmploymentStatus;
        }
        return payload.User;
    }

    public Task<ListResult<WorkTask>> ListTasksAsync(CancellationToken cancellationToken = default) =>
        ListTasksAsync(null, cancellationToken);

    public Task<ListResult<WorkTask>> ListTasksAsync(RecordQuery? query, CancellationToken cancellationToken = default) =>
        ListAsync<WorkTask>("/api/me/tasks", Filters(query, "projectId", "status", "priority", "dueFrom", "dueTo"), cancellationToken);

    public Task<ListResult<ProjectSummary>> ListProjectsAsync(CancellationToken cancellationToken = default) =>
        ListAsync<ProjectSummary>("/api/projects", [], cancellationToken);

    public Task<ListResult<ProjectMembership>> ListProjectMembersAsync(CancellationToken cancellationToken = default) =>
        ListProjectMembersAsync(null, cancellationToken);

    public Task<ListResult<ProjectMembership>> ListProjectMembersAsync(RecordQuery? query, CancellationToken cancellationToken = default) =>
        ListAsync<ProjectMembership>("/api/data/project-members", Filters(query, "projectId", "status"), cancellationToken);

    public Task<ListResult<MeetingSummary>> ListMeetingsAsync(CancellationToken cancellationToken = default) =>
        ListMeetingsAsync(null, cancellationToken);

    public Task<ListResult<MeetingSummary>> ListMeetingsAsync(RecordQuery? query, CancellationToken cancellationToken = default) =>
        ListAsync<MeetingSummary>("/api/me/meetings", Filters(query, "projectId", "status", "from", "to"), cancellationToken);

    public Task<ListResult<NotificationSummary>> ListNotificationsAsync(CancellationToken cancellationToken = default) =>
        ListAsync<NotificationSummary>("/api/me/notifications", [], cancellationToken);

    public Task<ListResult<AttendanceRecord>> ListAttendanceAsync(CancellationToken cancellationToken = default) =>
        ListAttendanceAsync(null, cancellationToken);

    public Task<ListResult<AttendanceRecord>> ListAttendanceAsync(RecordQuery? query, CancellationToken cancellationToken = default) =>
        ListAsync<AttendanceRecord>("/api/me/attendance", Filters(query, "status", "approvalStatus", "from", "to"), cancellationToken);

    public Task<ListResult<TimesheetRecord>> ListTimesheetsAsync(CancellationToken cancellationToken = default) =>
        ListTimesheetsAsync(null, cancellationToken);

    public Task<ListResult<TimesheetRecord>> ListTimesheetsAsync(RecordQuery? query, CancellationToken cancellationToken = default) =>
        ListAsync<TimesheetRecord>("/api/me/timesheets", Filters(query, "projectId", "taskId", "status", "from", "to"), cancellationToken);

    public async Task<TimesheetRecord> CreateTimeEntryAsync(TimeEntryDraft draft, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(draft.ProjectId) || string.IsNullOrWhiteSpace(draft.TaskId) || string.IsNullOrWhiteSpace(draft.Date))
            throw new ArgumentException("A time entry needs a project, task, and date confirmed by Trilez.");
        if (draft.Hours < 0.01m || draft.Hours > 24m)
            throw new ArgumentException("Hours must be between 0.01 and 24.");
        var payload = new Dictionary<string, object?>
        {
            ["projectId"] = draft.ProjectId,
            ["taskId"] = draft.TaskId,
            ["date"] = draft.Date,
            ["hours"] = draft.Hours,
        };
        if (!string.IsNullOrWhiteSpace(draft.Description)) payload["description"] = draft.Description;
        if (draft.Billable is not null) payload["billable"] = draft.Billable;
        var json = JsonSerializer.Serialize(payload, AgentJson.Options);
        using var response = await SendAsync(HttpMethod.Post, "/api/me/timesheets", json, authorize: true, cancellationToken);
        if (response.StatusCode != HttpStatusCode.Created)
            throw await ExceptionFromAsync(response, cancellationToken);
        var envelope = await ReadBodyAsync<Envelope<TimesheetRecord>>(response, cancellationToken);
        if (envelope?.Data is null || string.IsNullOrWhiteSpace(envelope.Data.Id))
            throw new TrilezApiException((int)response.StatusCode, "INVALID_RESPONSE", "Time entry response did not include a record");
        return envelope.Data;
    }

    public async Task<AgentDeviceEnrollment> RegisterAgentDeviceAsync(AgentDeviceRegistration registration, string? currentCredential = null, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(registration.InstallationId) || string.IsNullOrWhiteSpace(registration.DeviceName) || string.IsNullOrWhiteSpace(registration.AgentVersion))
            throw new ArgumentException("A device registration needs an installation id, display name, and agent version.");
        var description = string.IsNullOrWhiteSpace(registration.OsDescription) ? null : registration.OsDescription.Trim();
        if (description is { Length: > 160 }) description = description[..160];
        var payload = new Dictionary<string, object?>
        {
            ["installationId"] = registration.InstallationId.Trim(),
            ["deviceName"] = registration.DeviceName.Trim(),
            ["agentVersion"] = registration.AgentVersion.Trim(),
            ["capabilities"] = registration.Capabilities ?? AgentDeviceCapabilities.Supported,
        };
        if (!string.IsNullOrWhiteSpace(registration.Platform)) payload["platform"] = registration.Platform.Trim();
        if (description is not null) payload["osDescription"] = description;
        var json = JsonSerializer.Serialize(payload, AgentJson.Options);
        using var response = await SendAsync(HttpMethod.Post, "/api/me/agent-devices", json, authorize: true, cancellationToken, currentCredential);
        if (response.StatusCode is not (HttpStatusCode.OK or HttpStatusCode.Created))
            throw await ExceptionFromAsync(response, cancellationToken);
        var body = await ReadBodyAsync<AgentDeviceEnrollment>(response, cancellationToken);
        if (body?.Data is null || string.IsNullOrWhiteSpace(body.Data.Id))
            throw new TrilezApiException((int)response.StatusCode, "INVALID_RESPONSE", "Device enrollment response did not include a record");
        return body;
    }

    public Task<ListResult<AgentDeviceRecord>> ListAgentDevicesAsync(CancellationToken cancellationToken = default) =>
        ListAsync<AgentDeviceRecord>("/api/me/agent-devices", [], cancellationToken);

    public async Task<AgentDeviceRecord> GetAgentDeviceAsync(string id, CancellationToken cancellationToken = default)
    {
        using var response = await SendAsync(HttpMethod.Get, "/api/me/agent-devices/" + RequireDeviceId(id), null, authorize: true, cancellationToken);
        var envelope = await ReadSuccessAsync<Envelope<AgentDeviceRecord>>(response, cancellationToken);
        if (envelope.Data is null || string.IsNullOrWhiteSpace(envelope.Data.Id))
            throw new TrilezApiException((int)response.StatusCode, "INVALID_RESPONSE", "Device response did not include a record");
        return envelope.Data;
    }

    public async Task<AgentDeviceRecord> HeartbeatAgentDeviceAsync(string id, string deviceCredential, string? agentVersion = null, IReadOnlyList<string>? capabilities = null, CancellationToken cancellationToken = default)
    {
        var payload = new Dictionary<string, object?>();
        if (!string.IsNullOrWhiteSpace(agentVersion)) payload["agentVersion"] = agentVersion.Trim();
        if (capabilities is not null) payload["capabilities"] = capabilities;
        var json = JsonSerializer.Serialize(payload, AgentJson.Options);
        using var response = await SendAsync(HttpMethod.Post, "/api/me/agent-devices/" + RequireDeviceId(id) + "/heartbeat", json, authorize: true, cancellationToken, RequireDeviceCredential(deviceCredential));
        var envelope = await ReadSuccessAsync<Envelope<AgentDeviceRecord>>(response, cancellationToken);
        if (envelope.Data is null || string.IsNullOrWhiteSpace(envelope.Data.Id))
            throw new TrilezApiException((int)response.StatusCode, "INVALID_RESPONSE", "Heartbeat response did not include a record");
        return envelope.Data;
    }

    public async Task<AgentDeviceRecord> DisconnectAgentDeviceAsync(string id, string deviceCredential, CancellationToken cancellationToken = default)
    {
        using var response = await SendAsync(HttpMethod.Post, "/api/me/agent-devices/" + RequireDeviceId(id) + "/disconnect", "{}", authorize: true, cancellationToken, RequireDeviceCredential(deviceCredential));
        var envelope = await ReadSuccessAsync<Envelope<AgentDeviceRecord>>(response, cancellationToken);
        if (envelope.Data is null || string.IsNullOrWhiteSpace(envelope.Data.Id))
            throw new TrilezApiException((int)response.StatusCode, "INVALID_RESPONSE", "Disconnect response did not include a record");
        return envelope.Data;
    }

    public async Task<AgentDeviceRecord> UnregisterAgentDeviceAsync(string id, string deviceCredential, CancellationToken cancellationToken = default)
    {
        using var response = await SendAsync(HttpMethod.Post, "/api/me/agent-devices/" + RequireDeviceId(id) + "/unregister", "{}", authorize: true, cancellationToken, RequireDeviceCredential(deviceCredential));
        var envelope = await ReadSuccessAsync<Envelope<AgentDeviceRecord>>(response, cancellationToken);
        if (envelope.Data is null || string.IsNullOrWhiteSpace(envelope.Data.Id))
            throw new TrilezApiException((int)response.StatusCode, "INVALID_RESPONSE", "Unregister response did not include a record");
        return envelope.Data;
    }

    public async Task<UsagePolicyDocument> GetUsagePolicyAsync(string id, string deviceCredential, CancellationToken cancellationToken = default)
    {
        using var response = await SendAsync(HttpMethod.Get, "/api/me/agent-devices/" + RequireDeviceId(id) + "/usage-policy", null, authorize: true, cancellationToken, RequireDeviceCredential(deviceCredential));
        var envelope = await ReadSuccessAsync<Envelope<UsagePolicyDocument>>(response, cancellationToken);
        return envelope.Data ?? throw new TrilezApiException((int)response.StatusCode, "INVALID_RESPONSE", "Usage policy response did not include a policy");
    }

    public async Task SetUsagePausedAsync(string id, string deviceCredential, bool paused, CancellationToken cancellationToken = default)
    {
        var json = JsonSerializer.Serialize(new Dictionary<string, bool> { ["paused"] = paused }, AgentJson.Options);
        using var response = await SendAsync(HttpMethod.Post, "/api/me/agent-devices/" + RequireDeviceId(id) + "/usage-preference", json, authorize: true, cancellationToken, RequireDeviceCredential(deviceCredential));
        await ReadSuccessAsync<Envelope<UsagePauseBody>>(response, cancellationToken);
    }

    public async Task<UsageBatchResult> UploadUsageBatchAsync(string id, string deviceCredential, UsageBatchRequest batch, CancellationToken cancellationToken = default)
    {
        var intervals = new List<Dictionary<string, object?>>(batch.Intervals.Count);
        foreach (var interval in batch.Intervals)
        {
            if (!UsageAggregator.TryProcess(interval.ProcessName, out var process) || interval.DurationMs < 1) continue;
            var item = new Dictionary<string, object?>
            {
                ["clientIntervalId"] = interval.ClientIntervalId,
                ["processName"] = process,
                ["startedAt"] = interval.StartedAt.ToUniversalTime().ToString("O"),
                ["durationMs"] = Math.Min(interval.DurationMs, UsageAggregator.MaxDurationMs),
            };
            var display = UsageAggregator.Display(interval.DisplayName);
            if (display is not null) item["displayName"] = display;
            intervals.Add(item);
        }
        var session = new Dictionary<string, object?>
        {
            ["clientSessionId"] = batch.Session.ClientSessionId,
            ["startedAt"] = batch.Session.StartedAt.ToUniversalTime().ToString("O"),
        };
        if (batch.Session.EndedAt is DateTimeOffset ended) session["endedAt"] = ended.ToUniversalTime().ToString("O");
        if (!string.IsNullOrWhiteSpace(batch.Session.EndReason)) session["endReason"] = batch.Session.EndReason;
        var json = JsonSerializer.Serialize(new Dictionary<string, object?>
        {
            ["session"] = session,
            ["intervals"] = intervals,
        }, AgentJson.Options);
        using var response = await SendAsync(HttpMethod.Post, "/api/me/agent-devices/" + RequireDeviceId(id) + "/usage-batches", json, authorize: true, cancellationToken, RequireDeviceCredential(deviceCredential));
        var envelope = await ReadSuccessAsync<Envelope<UsageBatchResult>>(response, cancellationToken);
        return envelope.Data ?? throw new TrilezApiException((int)response.StatusCode, "INVALID_RESPONSE", "Usage batch response did not include a result");
    }

    public async Task<HealthBatchResult> UploadHealthBatchAsync(string id, string deviceCredential, IReadOnlyList<string> samplePayloads, CancellationToken cancellationToken = default)
    {
        var kept = new List<string>();
        foreach (var payload in samplePayloads)
        {
            if (string.IsNullOrWhiteSpace(payload) || TelemetrySync.ContainsSecret(payload) || !IsJsonObject(payload)) continue;
            kept.Add(payload);
            if (kept.Count == TelemetrySync.MaxBatchRecords) break;
        }
        while (kept.Count > 0 && Encoding.UTF8.GetByteCount(HealthBody(kept)) > TelemetrySync.MaxBatchBytes)
            kept.RemoveAt(kept.Count - 1);
        if (kept.Count == 0) throw new ArgumentException("Health batch is empty.");
        var json = HealthBody(kept);
        using var response = await SendAsync(HttpMethod.Post, "/api/me/agent-devices/" + RequireDeviceId(id) + "/health-batches", json, authorize: true, cancellationToken, RequireDeviceCredential(deviceCredential));
        var envelope = await ReadSuccessAsync<Envelope<HealthBatchResult>>(response, cancellationToken);
        return envelope.Data ?? throw new TrilezApiException((int)response.StatusCode, "INVALID_RESPONSE", "Health batch response did not include a result");
    }

    public async Task<ScreenSession?> GetScreenSessionAsync(string id, string deviceCredential, CancellationToken cancellationToken = default)
    {
        using var response = await SendAsync(HttpMethod.Get, "/api/me/agent-devices/" + RequireDeviceId(id) + "/screen-session", null, authorize: true, cancellationToken, RequireDeviceCredential(deviceCredential));
        var envelope = await ReadSuccessAsync<Envelope<ScreenSession>>(response, cancellationToken);
        if (envelope.Data is null || string.IsNullOrWhiteSpace(envelope.Data.Id)) return null;
        return envelope.Data;
    }

    public async Task<ScreenSession> AcceptScreenSessionAsync(string id, string sessionId, string deviceCredential, CancellationToken cancellationToken = default)
    {
        using var response = await SendAsync(HttpMethod.Post, ScreenPath(id, sessionId, "accept"), "{}", authorize: true, cancellationToken, RequireDeviceCredential(deviceCredential));
        var envelope = await ReadSuccessAsync<Envelope<ScreenSession>>(response, cancellationToken);
        if (envelope.Data is null || string.IsNullOrWhiteSpace(envelope.Data.Id))
            throw new TrilezApiException((int)response.StatusCode, "INVALID_RESPONSE", "Screen session response did not include a record");
        return envelope.Data;
    }

    public async Task<ScreenSession> EndScreenSessionAsync(string id, string sessionId, string deviceCredential, string reason, CancellationToken cancellationToken = default)
    {
        if (reason is not ("employee_stop" or "rejected" or "shutdown" or "agent_lost"))
            throw new ArgumentException("Screen session end reason is invalid.");
        var json = JsonSerializer.Serialize(new Dictionary<string, string> { ["reason"] = reason }, AgentJson.Options);
        using var response = await SendAsync(HttpMethod.Post, ScreenPath(id, sessionId, "end"), json, authorize: true, cancellationToken, RequireDeviceCredential(deviceCredential));
        var envelope = await ReadSuccessAsync<Envelope<ScreenSession>>(response, cancellationToken);
        if (envelope.Data is null || string.IsNullOrWhiteSpace(envelope.Data.Id))
            throw new TrilezApiException((int)response.StatusCode, "INVALID_RESPONSE", "Screen session response did not include a record");
        return envelope.Data;
    }

    public async Task<ScreenSession> DecideScreenControlAsync(string id, string sessionId, string deviceCredential, string action, string grantId, CancellationToken cancellationToken = default)
    {
        if (action is not ("grant" or "deny" or "revoke"))
            throw new ArgumentException("Screen control action is invalid.");
        if (string.IsNullOrWhiteSpace(grantId))
            throw new ArgumentException("Screen control grant is invalid.");
        var json = JsonSerializer.Serialize(new Dictionary<string, string> { ["action"] = action, ["grantId"] = grantId }, AgentJson.Options);
        using var response = await SendAsync(HttpMethod.Post, ScreenPath(id, sessionId, "control"), json, authorize: true, cancellationToken, RequireDeviceCredential(deviceCredential));
        var envelope = await ReadSuccessAsync<Envelope<ScreenSession>>(response, cancellationToken);
        if (envelope.Data is null || string.IsNullOrWhiteSpace(envelope.Data.Id))
            throw new TrilezApiException((int)response.StatusCode, "INVALID_RESPONSE", "Screen session response did not include a record");
        return envelope.Data;
    }

    public async Task<ScreenFrameResult> UploadScreenFrameAsync(string id, string sessionId, string deviceCredential, byte[] frame, CancellationToken cancellationToken = default)
    {
        if (frame is null || frame.Length < 4 || frame.Length > 400_000 || frame[0] != 0xFF || frame[1] != 0xD8)
            throw new ArgumentException("Screen frame is invalid.");
        using var response = await SendBytesAsync(ScreenPath(id, sessionId, "frames"), frame, "image/jpeg", cancellationToken, RequireDeviceCredential(deviceCredential));
        var envelope = await ReadSuccessAsync<Envelope<ScreenFrameResult>>(response, cancellationToken);
        return envelope.Data ?? throw new TrilezApiException((int)response.StatusCode, "INVALID_RESPONSE", "Screen frame response did not include a result");
    }

    private static string ScreenPath(string id, string sessionId, string action) =>
        "/api/me/agent-devices/" + RequireDeviceId(id) + "/screen-sessions/" + RequireDeviceId(sessionId) + "/" + action;

    private static string HealthBody(IReadOnlyList<string> payloads) => "{\"samples\":[" + string.Join(',', payloads) + "]}";

    private static bool IsJsonObject(string payload)
    {
        try
        {
            using var document = JsonDocument.Parse(payload);
            return document.RootElement.ValueKind == JsonValueKind.Object;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private sealed class UsagePauseBody
    {
        public bool Paused { get; set; }
    }

    private static string RequireDeviceId(string id)
    {
        if (string.IsNullOrWhiteSpace(id) || !DeviceIdPattern.IsMatch(id))
            throw new ArgumentException("Device id is invalid.");
        return id;
    }

    private static string RequireDeviceCredential(string deviceCredential)
    {
        if (string.IsNullOrWhiteSpace(deviceCredential) || deviceCredential.Length > 128 || deviceCredential.Any(char.IsWhiteSpace))
            throw new ArgumentException("Device credential is invalid.");
        return deviceCredential;
    }

    private async Task<ListResult<T>> ListAsync<T>(string path, IReadOnlyList<KeyValuePair<string, string>> filters, CancellationToken cancellationToken)
    {
        var items = new List<T>();
        string? cursor = null;
        EmployeeLink? employee = null;
        var seenCursors = new HashSet<string>(StringComparer.Ordinal);
        for (var page = 0; page < MaxPages; page++)
        {
            if (cursor is not null && !seenCursors.Add(cursor))
                return new ListResult<T> { Items = items, Truncated = true, Employee = employee };
            using var response = await SendAsync(HttpMethod.Get, BuildListPath(path, filters, cursor), null, authorize: true, cancellationToken);
            var envelope = await ReadSuccessAsync<Envelope<List<T>>>(response, cancellationToken);
            employee ??= envelope.Employee;
            if (envelope.Data is not null) items.AddRange(envelope.Data);
            if (envelope.Page?.HasMore != true || string.IsNullOrWhiteSpace(envelope.Page.NextCursor))
                return new ListResult<T> { Items = items, Truncated = false, Employee = employee };
            cursor = envelope.Page.NextCursor;
        }
        return new ListResult<T> { Items = items, Truncated = true, Employee = employee };
    }

    private static List<KeyValuePair<string, string>> Filters(RecordQuery? query, params string[] allowed)
    {
        if (query is null) return [];
        var values = new Dictionary<string, string?>(StringComparer.Ordinal)
        {
            ["projectId"] = query.ProjectId,
            ["taskId"] = query.TaskId,
            ["status"] = query.Status,
            ["priority"] = query.Priority,
            ["dueFrom"] = query.DueFrom,
            ["dueTo"] = query.DueTo,
            ["from"] = query.From,
            ["to"] = query.To,
            ["approvalStatus"] = query.ApprovalStatus,
        };
        var filters = new List<KeyValuePair<string, string>>();
        foreach (var key in allowed)
        {
            if (values.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value))
                filters.Add(new KeyValuePair<string, string>(key, value));
        }
        return filters;
    }

    private static string BuildListPath(string path, IReadOnlyList<KeyValuePair<string, string>> filters, string? cursor)
    {
        var parts = new List<string> { $"limit={PageLimit}" };
        foreach (var filter in filters)
            parts.Add($"{filter.Key}={Uri.EscapeDataString(filter.Value)}");
        if (!string.IsNullOrWhiteSpace(cursor))
            parts.Add($"cursor={Uri.EscapeDataString(cursor)}");
        return $"{path}?{string.Join("&", parts)}";
    }

    private async Task<HttpResponseMessage> SendBytesAsync(string pathAndQuery, byte[] bytes, string contentType, CancellationToken cancellationToken, string deviceCredential)
    {
        var response = await SendRawBytesAsync(pathAndQuery, bytes, contentType, cancellationToken, deviceCredential);
        if (response.StatusCode != HttpStatusCode.Unauthorized)
            return response;
        var failure = await ExceptionFromAsync(response, cancellationToken);
        response.Dispose();
        if (failure.Code == "DEVICE_CREDENTIAL_REJECTED") throw failure;
        if (!await TryRefreshAsync(cancellationToken))
            throw new TrilezApiException(401, "SESSION_REVOKED", null);
        return await SendRawBytesAsync(pathAndQuery, bytes, contentType, cancellationToken, deviceCredential);
    }

    private async Task<HttpResponseMessage> SendRawBytesAsync(string pathAndQuery, byte[] bytes, string contentType, CancellationToken cancellationToken, string deviceCredential)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, Build(pathAndQuery));
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        request.Content = content;
        if (string.IsNullOrWhiteSpace(_session.AccessToken))
            throw new TrilezApiException(401, null, "Authentication required");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _session.AccessToken);
        if (deviceCredential.Any(char.IsWhiteSpace))
            throw new ArgumentException("Device credential is invalid.");
        request.Headers.TryAddWithoutValidation("X-Device-Credential", deviceCredential);
        try
        {
            return await _http.SendAsync(request, cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (OperationCanceledException)
        {
            throw new TrilezApiException(0, "OFFLINE", null);
        }
        catch (HttpRequestException)
        {
            throw new TrilezApiException(0, "OFFLINE", null);
        }
    }

    private async Task<HttpResponseMessage> SendAsync(HttpMethod method, string pathAndQuery, string? json, bool authorize, CancellationToken cancellationToken, string? deviceCredential = null)
    {
        var response = await SendRawAsync(method, pathAndQuery, json, authorize, cancellationToken, deviceCredential);
        if (!authorize || response.StatusCode != HttpStatusCode.Unauthorized || pathAndQuery.StartsWith("/api/auth/refresh", StringComparison.Ordinal))
            return response;
        var failure = await ExceptionFromAsync(response, cancellationToken);
        response.Dispose();
        if (failure.Code == "DEVICE_CREDENTIAL_REJECTED") throw failure;
        if (!await TryRefreshAsync(cancellationToken))
            throw new TrilezApiException(401, "SESSION_REVOKED", null);
        return await SendRawAsync(method, pathAndQuery, json, authorize, cancellationToken, deviceCredential);
    }

    private async Task<bool> TryRefreshAsync(CancellationToken cancellationToken)
    {
        using var response = await SendRawAsync(HttpMethod.Post, "/api/auth/refresh", null, authorize: false, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            _session.Clear();
            return false;
        }
        var payload = await ReadBodyAsync<AuthResponse>(response, cancellationToken);
        if (string.IsNullOrWhiteSpace(payload?.Token))
        {
            _session.Clear();
            return false;
        }
        _session.AccessToken = payload.Token;
        return true;
    }

    private async Task<HttpResponseMessage> SendRawAsync(HttpMethod method, string pathAndQuery, string? json, bool authorize, CancellationToken cancellationToken, string? deviceCredential = null)
    {
        using var request = new HttpRequestMessage(method, Build(pathAndQuery));
        if (json is not null)
            request.Content = new StringContent(json, Encoding.UTF8, "application/json");
        if (authorize)
        {
            if (string.IsNullOrWhiteSpace(_session.AccessToken))
                throw new TrilezApiException(401, null, "Authentication required");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _session.AccessToken);
        }
        if (!string.IsNullOrEmpty(deviceCredential))
        {
            if (deviceCredential.Any(char.IsWhiteSpace))
                throw new ArgumentException("Device credential is invalid.");
            request.Headers.TryAddWithoutValidation("X-Device-Credential", deviceCredential);
        }
        try
        {
            return await _http.SendAsync(request, cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (OperationCanceledException)
        {
            throw new TrilezApiException(0, "OFFLINE", null);
        }
        catch (HttpRequestException)
        {
            throw new TrilezApiException(0, "OFFLINE", null);
        }
    }

    private Uri Build(string pathAndQuery)
    {
        var relative = pathAndQuery.StartsWith('/') ? pathAndQuery : "/" + pathAndQuery;
        return new Uri(_base, relative);
    }

    private static async Task<T> ReadSuccessAsync<T>(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        if (!response.IsSuccessStatusCode) throw await ExceptionFromAsync(response, cancellationToken);
        var payload = await ReadBodyAsync<T>(response, cancellationToken);
        if (payload is null) throw new TrilezApiException((int)response.StatusCode, "INVALID_RESPONSE", "Response body was empty");
        return payload;
    }

    private static async Task<T?> ReadBodyAsync<T>(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(body)) return default;
        try
        {
            return JsonSerializer.Deserialize<T>(body, AgentJson.Options);
        }
        catch (JsonException)
        {
            throw new TrilezApiException((int)response.StatusCode, "INVALID_RESPONSE", "Response body was not valid JSON");
        }
    }

    private static async Task<TrilezApiException> ExceptionFromAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        ErrorResponse? payload = null;
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!string.IsNullOrWhiteSpace(body))
        {
            try { payload = JsonSerializer.Deserialize<ErrorResponse>(body, AgentJson.Options); }
            catch (JsonException) { payload = null; }
        }
        return new TrilezApiException((int)response.StatusCode, payload?.Code, payload?.Error, payload?.Issues);
    }
}
