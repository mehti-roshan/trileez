using System.Net;
using System.Text;
using Trilez.Agent;
using Xunit;

namespace Trilez.Agent.Core.Tests;

public sealed class AgentTests
{
    [Fact]
    public void BaseUrlRejectsCredentialsAndNonHttpSchemes()
    {
        Assert.Equal("https://trileez.example/", TrilezApiClient.NormalizeBase("https://trileez.example/api").AbsoluteUri);
        Assert.Throws<ArgumentException>(() => TrilezApiClient.NormalizeBase("http://user:secret@trileez.example"));
        Assert.Throws<ArgumentException>(() => TrilezApiClient.NormalizeBase("file:///tmp/trileez"));
    }

    [Fact]
    public async Task LoginStoresTheServerTokenAndDoesNotSendABearerHeader()
    {
        var session = new SessionState();
        string? authorization = "unset";
        string? body = null;
        var api = Client(session, request =>
        {
            authorization = request.Headers.Authorization?.ToString();
            body = request.Content is null ? null : request.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            return Json(HttpStatusCode.OK, """{"token":"access-token","user":{"id":"user-7","name":"مریم","email":"member@example.com","role":"member","isActive":true}}""");
        });

        var profile = await api.LoginAsync("member@example.com", "SecretValue123!");

        Assert.Equal("user-7", profile.Id);
        Assert.Equal("access-token", session.AccessToken);
        Assert.Null(authorization);
        Assert.DoesNotContain("SecretValue123!", api.ToString());
        Assert.Contains("\"email\":\"member@example.com\"", body);
        Assert.DoesNotContain("status", body);
    }

    [Fact]
    public async Task ExpiredAccessTokenIsRenewedOnceFromTheRefreshCookie()
    {
        var session = new SessionState { AccessToken = "expired-token" };
        var calls = new List<string>();
        var api = Client(session, request =>
        {
            calls.Add($"{request.Method} {request.RequestUri!.AbsolutePath} {request.Headers.Authorization?.Parameter}");
            if (request.RequestUri.AbsolutePath == "/api/auth/refresh")
                return Json(HttpStatusCode.OK, """{"token":"renewed-token","user":{"id":"user-7","name":"مریم","email":"member@example.com","role":"member","isActive":true}}""");
            if (request.Headers.Authorization?.Parameter == "renewed-token")
                return Json(HttpStatusCode.OK, """{"user":{"id":"user-7","name":"مریم","email":"member@example.com","role":"member","isActive":true}}""");
            return Json(HttpStatusCode.Unauthorized, """{"error":"Invalid or expired token"}""");
        });

        var profile = await api.GetMeAsync();

        Assert.Equal("user-7", profile.Id);
        Assert.Equal("renewed-token", session.AccessToken);
        Assert.Equal(3, calls.Count);
        Assert.Contains("POST /api/auth/refresh ", calls[1]);
    }

    [Fact]
    public async Task RevokedRefreshClearsTheSessionAndDoesNotExposeTheToken()
    {
        var session = new SessionState { AccessToken = "expired-token" };
        var api = Client(session, request =>
        {
            if (request.RequestUri!.AbsolutePath == "/api/auth/refresh")
                return Json(HttpStatusCode.Unauthorized, """{"error":"Bearer eyJhbGciOiJIUzI1NiJ9.secret","code":"SESSION_REVOKED"}""");
            return Json(HttpStatusCode.Unauthorized, """{"error":"Invalid or expired token"}""");
        });

        var error = await Assert.ThrowsAsync<TrilezApiException>(() => api.GetMeAsync());

        Assert.Equal(401, error.Status);
        Assert.Equal("SESSION_REVOKED", error.Code);
        Assert.Null(session.AccessToken);
        Assert.Equal("نشست لغو یا منقضی شده است. دوباره وارد شوید.", error.Message);
        Assert.DoesNotContain("eyJ", error.Message);
        Assert.Null(error.ServerError);
    }

    [Fact]
    public async Task TimeEntryIsReportedOnlyAfterTheServerCreatesIt()
    {
        var session = new SessionState { AccessToken = "access-token" };
        string? body = null;
        string? path = null;
        var api = Client(session, request =>
        {
            path = request.RequestUri!.AbsolutePath;
            body = request.Content!.ReadAsStringAsync().GetAwaiter().GetResult();
            return Json(HttpStatusCode.BadRequest, """{"error":"Validation failed","code":"VALIDATION_ERROR","issues":[{"path":"body.employeeId","code":"invalid_relationship","message":"Task time must belong to an employee record"}]}""");
        });
        var draft = new TimeEntryDraft { ProjectId = "project-1", TaskId = "task-1", Date = "2026-10-16", Hours = 1.5m, Description = "پیاده‌سازی" };

        var error = await Assert.ThrowsAsync<TrilezApiException>(() => api.CreateTimeEntryAsync(draft));

        Assert.Equal(400, error.Status);
        Assert.Equal("درخواست نامعتبر است.", error.Message);
        Assert.Contains("body.employeeId", error.Issues[0].Path);
        Assert.Equal("/api/me/timesheets", path);
        Assert.DoesNotContain("employeeId", body);
        Assert.DoesNotContain("\"status\"", body);
        Assert.DoesNotContain("hourlyRate", body);
        Assert.Contains("\"hours\":1.5", body);

        var created = Client(session, _ => Json(HttpStatusCode.Created, """{"data":{"id":"time-9","employeeId":"employee-1","projectId":"project-1","taskId":"task-1","date":"2026-10-16","hours":1.5,"status":"pending_review"}}"""));
        var record = await created.CreateTimeEntryAsync(draft);
        Assert.Equal("time-9", record.Id);
        Assert.Equal("pending_review", record.Status);
    }

    [Fact]
    public async Task DashboardKeepsOnlyTheAuthenticatedEmployeesRecords()
    {
        var session = new SessionState { AccessToken = "access-token" };
        var requested = new List<string>();
        var api = Client(session, request =>
        {
            requested.Add(request.RequestUri!.PathAndQuery);
            var path = request.RequestUri.AbsolutePath;
            if (path == "/api/health/live") return Json(HttpStatusCode.OK, """{"ok":true}""");
            if (path == "/api/auth/me") return Json(HttpStatusCode.OK, """{"user":{"id":"user-7","name":"مریم حسینی","email":"member@example.com","role":"member","title":"کارشناس","isActive":true,"organizationId":"org-1"},"employee":{"state":"active","employeeId":"employee-7","employmentStatus":"active"}}""");
            if (path == "/api/me/tasks") return Json(HttpStatusCode.OK, """{"data":[{"id":"task-mine","title":"کار من","status":"in_progress","assigneeId":"user-7","projectId":"project-1","dueDate":"2026-03-21"},{"id":"task-shared","title":"کار مشترک","status":"todo","assigneeId":"user-2","assigneeIds":["user-2","user-7"],"projectId":"project-2","dueDate":"2026-04-01"},{"id":"task-other","title":"کار دیگری","status":"todo","assigneeId":"user-2","projectId":"project-9","dueDate":"2026-04-02"},{"id":"task-follow","title":"فقط دنبال‌شده","status":"todo","assigneeId":"user-2","followerIds":["user-7"],"projectId":"project-8","dueDate":"2026-04-03"}],"page":{"hasMore":false}}""");
            if (path == "/api/data/project-members") return Json(HttpStatusCode.OK, """{"data":[{"id":"member-1","projectId":"project-3","personId":"user-7","status":"active"},{"id":"member-2","projectId":"project-4","personId":"user-7","status":"inactive"},{"id":"member-3","projectId":"project-5","personId":"user-2","status":"active"}],"page":{"hasMore":false}}""");
            if (path == "/api/projects") return Json(HttpStatusCode.OK, """{"data":[{"id":"project-1","name":"فروش","code":"P1"},{"id":"project-2","name":"پشتیبانی","code":"P2"},{"id":"project-3","name":"داخلی","code":"P3"},{"id":"project-9","name":"نامرتبط","code":"P9"}],"page":{"hasMore":false}}""");
            if (path == "/api/me/meetings") return Json(HttpStatusCode.OK, """{"data":[{"id":"meeting-1","title":"جلسه من","startAt":"2026-10-16T09:00:00.000Z","organizerId":"user-2","participantIds":["user-2","user-7"]},{"id":"meeting-2","title":"جلسه دیگران","startAt":"2026-10-16T11:00:00.000Z","organizerId":"user-2","participantIds":["user-2"]}],"page":{"hasMore":false}}""");
            if (path == "/api/me/notifications") return Json(HttpStatusCode.OK, """{"data":[{"id":"note-1","title":"پیام من","read":false,"recipientId":"user-7"},{"id":"note-2","title":"پیام دیگری","read":false,"recipientId":"user-2"}],"page":{"hasMore":false}}""");
            if (path == "/api/me/attendance") return Json(HttpStatusCode.OK, """{"data":[{"id":"att-1","employeeId":"employee-7","date":"2026-10-16","status":"present","clockIn":"2026-10-16T08:00:00+03:30","clockOut":"2026-10-16T16:00:00+03:30","approvalStatus":"pending","workedMinutes":480,"source":"manual"}],"page":{"limit":200,"hasMore":false},"employee":{"state":"active","employeeId":"employee-7","employmentStatus":"active"}}""");
            if (path == "/api/me/timesheets") return Json(HttpStatusCode.OK, """{"data":[{"id":"time-1","employeeId":"employee-7","projectId":"project-1","taskId":"task-mine","date":"2026-10-16","hours":1.5,"status":"pending_review"}],"page":{"hasMore":false}}""");
            if (path == "/api/me/agent-devices") return Json(HttpStatusCode.OK, """{"data":[{"id":"device-1","installationId":"11111111-1111-1111-1111-111111111111","deviceName":"لپ‌تاپ آزمون","status":"active","connectionStatus":"online","agentVersion":"0.2.0"}],"page":{"hasMore":false}}""");
            return Json(HttpStatusCode.NotFound, """{"error":"Route not found"}""");
        });

        var dashboard = await new EmployeeDashboardService(api, () => new DateOnly(2026, 10, 16)).LoadAsync();
        var text = DashboardText.Format(dashboard);

        Assert.Equal(["task-mine", "task-shared"], dashboard.Tasks.Select(task => task.Id).ToArray());
        Assert.Equal(["project-1", "project-2", "project-3"], dashboard.Projects.Select(project => project.Id).ToArray());
        Assert.Equal(["meeting-1"], dashboard.Meetings.Select(meeting => meeting.Id).ToArray());
        Assert.Equal(["note-1"], dashboard.Notifications.Select(item => item.Id).ToArray());
        Assert.Equal("employee-7", dashboard.Profile.EmployeeId);
        Assert.Equal(SectionState.Ready, dashboard.Attendance.State);
        Assert.Equal(SectionState.Ready, dashboard.WorkTime.State);
        Assert.Equal(["att-1"], dashboard.AttendanceRecords.Select(row => row.Id).ToArray());
        Assert.Equal(["time-1"], dashboard.Timesheets.Select(row => row.Id).ToArray());
        var traffic = "\n" + string.Join('\n', requested);
        Assert.Contains("\n/api/me/tasks?", traffic);
        Assert.Contains("\n/api/me/attendance?limit=200&from=2026-10-16&to=2026-10-16", traffic);
        Assert.Contains("\n/api/me/timesheets?", traffic);
        Assert.DoesNotContain("employeeId=", traffic);
        Assert.Equal("2026-10-16", dashboard.Today.Date);
        Assert.True(dashboard.Today.ClocksRecorded);
        Assert.Equal("08:00", TehranCalendar.Clock(dashboard.Today.Record!.ClockIn));
        Assert.Equal("16:00", TehranCalendar.Clock(dashboard.Today.Record.ClockOut));
        Assert.DoesNotContain("\n/api/tasks", traffic);
        Assert.DoesNotContain("\n/api/meetings", traffic);
        Assert.DoesNotContain("\n/api/data/attendance", traffic);
        Assert.DoesNotContain("\n/api/data/timesheets", traffic);
        Assert.DoesNotContain("\n/api/data/devices", traffic);
        Assert.Contains("\n/api/me/agent-devices?", traffic);
        Assert.Equal(SectionState.Ready, dashboard.Device.State);
        Assert.Contains("لپ‌تاپ آزمون", dashboard.Device.Message);
        Assert.Contains("متصل به تری‌لیز", text);
        Assert.Contains("مریم حسینی", text);
        Assert.Contains("1405/01/01", text);
        Assert.Contains("حاضر", text);
        Assert.Contains("ورود 08:00", text);
        Assert.Contains("خروج 16:00", text);
        Assert.Contains("1.5 ساعت", text);
        Assert.Contains("فقط پس از پذیرش شما", text);
        Assert.DoesNotContain("کار دیگری", text);
        Assert.DoesNotContain("نامرتبط", text);
    }

    [Fact]
    public async Task PasswordChangeBlocksTheDashboardBeforeOtherRecordsAreLoaded()
    {
        var session = new SessionState { AccessToken = "access-token" };
        var requested = new List<string>();
        var api = Client(session, request =>
        {
            requested.Add(request.RequestUri!.PathAndQuery);
            var path = request.RequestUri.AbsolutePath;
            if (path == "/api/health/live") return Json(HttpStatusCode.OK, """{"ok":true}""");
            if (path == "/api/auth/me") return Json(HttpStatusCode.OK, """{"user":{"id":"user-7","name":"مریم","email":"member@example.com","role":"member","isActive":true,"mustChangePassword":true}}""");
            return Json(HttpStatusCode.OK, """{"data":[{"id":"should-not-load","title":"نباید دیده شود","assigneeId":"user-7"}],"page":{"hasMore":false}}""");
        });

        var dashboard = await new EmployeeDashboardService(api).LoadAsync();

        Assert.True(dashboard.PasswordChangeRequired);
        Assert.Empty(dashboard.Tasks);
        var blockedTraffic = "\n" + string.Join('\n', requested);
        Assert.DoesNotContain("\n/api/tasks", blockedTraffic);
        Assert.DoesNotContain("\n/api/me/tasks", blockedTraffic);
        Assert.Contains("رمز عبور", DashboardText.Format(dashboard));
    }

    [Fact]
    public async Task MissingEmployeeIsAClearEmptyState()
    {
        var session = new SessionState { AccessToken = "access-token" };
        var requested = new List<string>();
        var api = Client(session, request =>
        {
            requested.Add(request.RequestUri!.PathAndQuery);
            var path = request.RequestUri.AbsolutePath;
            if (path == "/api/health/live") return Json(HttpStatusCode.OK, """{"ok":true}""");
            if (path == "/api/auth/me") return Json(HttpStatusCode.OK, """{"user":{"id":"user-8","name":"کاربر بدون پرونده","email":"plain@example.com","role":"member","isActive":true},"employee":{"state":"none","employeeId":null,"employmentStatus":null}}""");
            return Json(HttpStatusCode.OK, """{"data":[],"page":{"hasMore":false}}""");
        });

        var dashboard = await new EmployeeDashboardService(api).LoadAsync();

        Assert.Equal("none", dashboard.Profile.EmployeeState);
        Assert.Null(dashboard.Profile.EmployeeId);
        Assert.Equal(SectionState.Empty, dashboard.Attendance.State);
        Assert.Equal(SectionState.Empty, dashboard.WorkTime.State);
        Assert.Equal(SectionState.Empty, dashboard.Device.State);
        Assert.Empty(dashboard.AttendanceRecords);
        Assert.Empty(dashboard.Timesheets);
        var plainTraffic = "\n" + string.Join('\n', requested);
        Assert.DoesNotContain("\n/api/me/attendance", plainTraffic);
        Assert.DoesNotContain("\n/api/me/timesheets", plainTraffic);
        Assert.Contains("پرونده کارمند فعالی ثبت نشده است", DashboardText.Format(dashboard));
    }

    [Fact]
    public async Task TaskPagesFollowTheCursorAndReportATruncatedList()
    {
        var session = new SessionState { AccessToken = "access-token" };
        var cursors = new List<string?>();
        var api = Client(session, request =>
        {
            var query = request.RequestUri!.Query;
            cursors.Add(query);
            if (!query.Contains("cursor=", StringComparison.Ordinal))
                return Json(HttpStatusCode.OK, """{"data":[{"id":"task-1","title":"اول","assigneeId":"user-7"}],"page":{"hasMore":true,"nextCursor":"cursor-page-2"}}""");
            return Json(HttpStatusCode.OK, """{"data":[{"id":"task-2","title":"دوم","assigneeId":"user-7"}],"page":{"hasMore":false}}""");
        });

        var page = await api.ListTasksAsync();

        Assert.Equal(["task-1", "task-2"], page.Items.Select(task => task.Id).ToArray());
        Assert.False(page.Truncated);
        Assert.Contains("cursor=cursor-page-2", cursors[1]);
    }

    [Fact]
    public async Task ClientReadsTheEmployeeApiShapesAndKeepsAliasAssignments()
    {
        var session = new SessionState { AccessToken = "access-token" };
        string? attendanceQuery = null;
        var api = Client(session, request =>
        {
            var path = request.RequestUri!.AbsolutePath;
            if (path == "/api/health/live") return Json(HttpStatusCode.OK, """{"ok":true}""");
            if (path == "/api/auth/me") return Json(HttpStatusCode.OK, """{"user":{"id":"user-7","name":"مریم حسینی","email":"member@example.com","role":"member","title":"کارشناس","isActive":true,"mustChangePassword":false,"organizationId":"org-1","status":"online","permissions":["project:view","task:view"],"employeeId":"employee-7"},"employee":{"state":"active","employeeId":"employee-7","employmentStatus":"active"}}""");
            if (path == "/api/me/tasks") return Json(HttpStatusCode.OK, """{"data":[{"id":"task-1","title":"تحویل","status":"todo","priority":"high","assigneeId":"employee-7","assigneeIds":["employee-7"],"assigneeMemberIds":["member-1"],"projectId":"project-1","startDate":"2026-10-01","dueDate":"2026-10-20","loggedHours":1.5},{"id":"task-2","title":"کار دیگران","assigneeId":"user-2","projectId":"project-9","dueDate":"2026-10-21"}],"page":{"limit":200,"hasMore":false}}""");
            if (path == "/api/projects") return Json(HttpStatusCode.OK, """{"data":[{"id":"project-1","name":"فروش","code":"P1","status":"active","startDate":"2026-09-01","endDate":"2026-12-31","members":["user-7"]},{"id":"project-9","name":"نامرتبط","code":"P9"}],"page":{"limit":200,"hasMore":false}}""");
            if (path == "/api/data/project-members") return Json(HttpStatusCode.OK, """{"data":[{"id":"member-1","projectId":"project-1","personId":"employee-7","status":"active","role":"عضو","roleIds":[],"joinedAt":"2026-09-01"},{"id":"member-2","projectId":"project-9","personId":"user-2","status":"active"}],"page":{"limit":200,"hasMore":false}}""");
            if (path == "/api/me/meetings") return Json(HttpStatusCode.OK, """{"data":[{"id":"meeting-1","title":"جلسه پرونده","startAt":"2026-10-16T09:00:00.000Z","durationMinutes":30,"status":"scheduled","organizerId":"user-2","participantIds":["user-2"],"employeeIds":["employee-7"]},{"id":"meeting-2","title":"جلسه دیگران","startAt":"2026-10-16T11:00:00.000Z","durationMinutes":15,"organizerId":"user-2","participantIds":["user-2"],"employeeIds":["employee-2"]}],"page":{"limit":200,"hasMore":false}}""");
            if (path == "/api/me/notifications") return Json(HttpStatusCode.OK, """{"data":[{"id":"note-1","title":"وظیفه نزدیک به موعد","body":"متن اعلان","read":false,"recipientId":"user-7","type":"task_assigned","createdAt":"2026-10-16T06:00:00.000Z"}],"page":{"limit":200,"hasMore":false}}""");
            if (path == "/api/me/attendance")
            {
                attendanceQuery = request.RequestUri.Query;
                return Json(HttpStatusCode.OK, """{"data":[{"id":"att-1","employeeId":"employee-7","date":"2026-10-16","clockIn":"2026-10-16T08:00:00+03:30","clockOut":"2026-10-16T16:00:00+03:30","status":"present","approvalStatus":"pending","source":"manual","workedMinutes":480,"expectedMinutes":0}],"page":{"limit":200,"hasMore":false},"employee":{"state":"active","employeeId":"employee-7","employmentStatus":"active"}}""");
            }
            if (path == "/api/me/timesheets") return Json(HttpStatusCode.OK, """{"data":[{"id":"time-1","employeeId":"employee-7","projectId":"project-1","taskId":"task-1","date":"2026-10-16","hours":1.5,"description":"پیاده‌سازی","billable":true,"hourlyRate":0,"calculatedCost":0,"status":"pending_review","createdAt":"2026-10-16T08:10:00.000Z"}],"page":{"limit":200,"hasMore":false},"employee":{"state":"active","employeeId":"employee-7","employmentStatus":"active"}}""");
            if (path == "/api/me/agent-devices") return Json(HttpStatusCode.OK, """{"data":[],"page":{"limit":200,"hasMore":false}}""");
            return Json(HttpStatusCode.NotFound, """{"error":"Route not found","code":"ROUTE_NOT_FOUND"}""");
        });

        var profile = await api.GetMeAsync();
        var tasks = await api.ListTasksAsync();
        var projects = await api.ListProjectsAsync();
        var members = await api.ListProjectMembersAsync();
        var meetings = await api.ListMeetingsAsync();
        var notes = await api.ListNotificationsAsync();
        var attendance = await api.ListAttendanceAsync(new RecordQuery { From = "2026-10-16", To = "2026-10-16" });
        var times = await api.ListTimesheetsAsync(new RecordQuery { From = "2026-10-16", To = "2026-10-16" });
        var dashboard = await new EmployeeDashboardService(api, () => new DateOnly(2026, 10, 16)).LoadAsync();

        Assert.Equal("active", profile.EmployeeState);
        Assert.Equal("employee-7", profile.EmployeeId);
        Assert.Equal("active", profile.EmploymentStatus);
        Assert.False(profile.MustChangePassword);
        Assert.Equal(1.5, tasks.Items[0].LoggedHours);
        Assert.Equal("2026-10-20", tasks.Items[0].DueDate);
        Assert.Equal("2026-09-01", projects.Items[0].StartDate);
        Assert.Equal("2026-09-01", members.Items[0].JoinedAt);
        Assert.Equal(30, meetings.Items[0].DurationMinutes);
        Assert.Equal("task_assigned", notes.Items[0].Type);
        Assert.Equal("employee-7", attendance.Employee!.EmployeeId);
        Assert.Equal(480d, attendance.Items[0].WorkedMinutes);
        Assert.Equal("pending", attendance.Items[0].ApprovalStatus);
        Assert.True(times.Items[0].Billable);
        Assert.Equal(0d, times.Items[0].HourlyRate);
        Assert.Equal("pending_review", times.Items[0].Status);
        Assert.Contains("from=2026-10-16", attendanceQuery);
        Assert.Contains("to=2026-10-16", attendanceQuery);
        Assert.DoesNotContain("employeeId", attendanceQuery);
        Assert.Equal(["task-1"], dashboard.Tasks.Select(task => task.Id).ToArray());
        Assert.Equal(["project-1"], dashboard.Projects.Select(project => project.Id).ToArray());
        Assert.Equal(["meeting-1"], dashboard.Meetings.Select(meeting => meeting.Id).ToArray());
        Assert.True(dashboard.Today.ClocksRecorded);
        Assert.Contains("ورود 08:00", DashboardText.Format(dashboard));
    }

    [Fact]
    public async Task EmptyListsStayEmptyAndAMissingEmployeeIsNotAnApiFailure()
    {
        var session = new SessionState { AccessToken = "access-token" };
        var api = Client(session, request =>
        {
            var path = request.RequestUri!.AbsolutePath;
            if (path == "/api/health/live") return Json(HttpStatusCode.OK, """{"ok":true}""");
            if (path == "/api/auth/me") return Json(HttpStatusCode.OK, """{"user":{"id":"user-8","name":"بدون پرونده","email":"plain@example.com","role":"member","isActive":true,"employeeId":null}}""");
            if (path == "/api/me/attendance") return Json(HttpStatusCode.OK, """{"data":[],"page":{"limit":200,"hasMore":false},"employee":{"state":"none","employeeId":null,"employmentStatus":null}}""");
            return Json(HttpStatusCode.OK, """{"data":null,"page":{"limit":200,"hasMore":false}}""");
        });

        var profile = await api.GetMeAsync();
        var tasks = await api.ListTasksAsync();
        var dashboard = await new EmployeeDashboardService(api, () => new DateOnly(2026, 10, 16)).LoadAsync();

        Assert.Equal("none", profile.EmployeeState);
        Assert.Null(profile.EmployeeId);
        Assert.Empty(tasks.Items);
        Assert.False(tasks.Truncated);
        Assert.Equal(SectionState.Empty, dashboard.Attendance.State);
        Assert.Equal(SectionState.Empty, dashboard.WorkTime.State);
        Assert.Equal(SectionState.Empty, dashboard.Device.State);
        Assert.Null(dashboard.Today.Record);
        Assert.False(dashboard.Today.ClocksRecorded);
        Assert.Empty(dashboard.Errors);
        Assert.DoesNotContain("خطای داخلی", DashboardText.Format(dashboard));
    }

    [Fact]
    public async Task ProfileFailureIsNotReportedAsAMissingEmployee()
    {
        var session = new SessionState { AccessToken = "access-token" };
        var api = Client(session, _ => Json(HttpStatusCode.InternalServerError, """{"error":"Internal server error","code":"INTERNAL_ERROR"}"""));

        var error = await Assert.ThrowsAsync<TrilezApiException>(() => api.GetMeAsync());

        Assert.Equal(500, error.Status);
        Assert.Equal("خطای داخلی سرور رخ داد. دوباره تلاش کنید.", error.Message);
    }

    [Fact]
    public async Task AuthorizationAndValidationFailuresStayVisible()
    {
        var session = new SessionState { AccessToken = "access-token" };
        var denied = Client(session, request =>
        {
            var path = request.RequestUri!.AbsolutePath;
            if (path == "/api/health/live") return Json(HttpStatusCode.OK, """{"ok":true}""");
            if (path == "/api/auth/me") return Json(HttpStatusCode.OK, """{"user":{"id":"user-7","name":"مریم","email":"member@example.com","role":"member","isActive":true},"employee":{"state":"active","employeeId":"employee-7","employmentStatus":"active"}}""");
            if (path == "/api/me/tasks") return Json(HttpStatusCode.Forbidden, """{"error":"Insufficient resource access","resource":"tasks","action":"read"}""");
            return Json(HttpStatusCode.OK, """{"data":[],"page":{"hasMore":false}}""");
        });

        var dashboard = await new EmployeeDashboardService(denied, () => new DateOnly(2026, 10, 16)).LoadAsync();
        var text = DashboardText.Format(dashboard);

        Assert.Empty(dashboard.Tasks);
        Assert.Equal("tasks", dashboard.Errors[0].Source);
        Assert.Equal(403, dashboard.Errors[0].Status);
        Assert.Contains("اجازه این کار را ندارید.", text);
        Assert.DoesNotContain("وظیفه‌ای به این حساب اختصاص ندارد", text);

        var draft = new TimeEntryDraft { ProjectId = "project-1", TaskId = "task-1", Date = "2026-10-16", Hours = 1 };
        var forbidden = Client(session, _ => Json(HttpStatusCode.Forbidden, """{"error":"Insufficient resource access","resource":"timesheets","action":"create"}"""));
        var forbiddenError = await Assert.ThrowsAsync<TrilezApiException>(() => forbidden.CreateTimeEntryAsync(draft));
        Assert.Equal(403, forbiddenError.Status);
        Assert.Equal("اجازه این کار را ندارید.", forbiddenError.Message);

        var invalid = Client(session, _ => Json(HttpStatusCode.BadRequest, """{"error":"Validation failed","code":"VALIDATION_ERROR","issues":[{"location":"body","path":"body.taskId","code":"invalid_relationship","message":"Time entry task must belong to the selected project"}]}"""));
        var invalidError = await Assert.ThrowsAsync<TrilezApiException>(() => invalid.CreateTimeEntryAsync(draft));
        Assert.Equal("body", invalidError.Issues[0].Location);
        Assert.Equal("body.taskId", invalidError.Issues[0].Path);
        Assert.Equal("درخواست نامعتبر است.", invalidError.Message);
    }

    [Fact]
    public async Task TimeEntryIsSavedOnlyWhenTheServerReturnsCreated()
    {
        var session = new SessionState { AccessToken = "access-token" };
        var draft = new TimeEntryDraft { ProjectId = "project-1", TaskId = "task-1", Date = "2026-10-16", Hours = 2, Billable = true };
        var accepted = Client(session, _ => Json(HttpStatusCode.OK, """{"data":{"id":"time-ok","status":"pending_review"}}"""));
        var failed = Client(session, _ => Json(HttpStatusCode.InternalServerError, """{"error":"Internal server error","code":"INTERNAL_ERROR"}"""));

        await Assert.ThrowsAsync<TrilezApiException>(() => accepted.CreateTimeEntryAsync(draft));
        var serverError = await Assert.ThrowsAsync<TrilezApiException>(() => failed.CreateTimeEntryAsync(draft));
        Assert.Equal("خطای داخلی سرور رخ داد. دوباره تلاش کنید.", serverError.Message);
    }

    [Fact]
    public async Task TimeoutsAndExpiredSessionsDoNotBecomeEmptyData()
    {
        var session = new SessionState { AccessToken = "expired-token" };
        var revoked = Client(session, request =>
        {
            var path = request.RequestUri!.AbsolutePath;
            if (path == "/api/health/live") return Json(HttpStatusCode.OK, """{"ok":true}""");
            if (path == "/api/auth/refresh")
                return Json(HttpStatusCode.Unauthorized, """{"error":"Session is revoked or expired","code":"SESSION_REVOKED"}""");
            return Json(HttpStatusCode.Unauthorized, """{"error":"Invalid or expired token"}""");
        });
        var sync = await new EmployeeDashboardService(revoked).SyncAsync();
        Assert.Equal(ConnectionState.SessionExpired, sync.Connection);
        Assert.Null(sync.Dashboard);
        Assert.Equal("نشست لغو یا منقضی شده است. دوباره وارد شوید.", sync.Error!.Message);
        Assert.Null(session.AccessToken);

        var offlineSession = new SessionState { AccessToken = "access-token" };
        var offline = Client(offlineSession, _ => throw new HttpRequestException("connection refused"));
        var offlineSync = await new EmployeeDashboardService(offline).SyncAsync();
        Assert.Equal(ConnectionState.Offline, offlineSync.Connection);
        Assert.Null(offlineSync.Dashboard);
        Assert.Equal("ارتباط با تری‌لیز برقرار نشد.", offlineSync.Error!.Message);

        var timedOut = Client(offlineSession, _ => throw new TaskCanceledException());
        var timeout = await Assert.ThrowsAsync<TrilezApiException>(() => timedOut.ListTasksAsync());
        Assert.Equal(0, timeout.Status);
        Assert.Equal("ارتباط با تری‌لیز برقرار نشد.", timeout.Message);
    }

    [Fact]
    public async Task RepeatedCursorStopsInsteadOfLooping()
    {
        var session = new SessionState { AccessToken = "access-token" };
        var calls = 0;
        var api = Client(session, _ =>
        {
            calls++;
            return Json(HttpStatusCode.OK, """{"data":[{"id":"task-1","title":"تکرار","assigneeId":"user-7"}],"page":{"hasMore":true,"nextCursor":"same-cursor"}}""");
        });

        var page = await api.ListTasksAsync();

        Assert.True(page.Truncated);
        Assert.Equal(2, calls);
        Assert.Equal(2, page.Items.Count);
    }

    [Fact]
    public async Task CancellationIsNotReportedAsAConnectionFailure()
    {
        var session = new SessionState { AccessToken = "access-token" };
        var api = Client(session, _ => Json(HttpStatusCode.OK, """{"ok":true}"""));
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => api.GetMeAsync(cancellation.Token));
    }

    private static TrilezApiClient Client(SessionState session, Func<HttpRequestMessage, HttpResponseMessage> handler)
    {
        var http = new HttpClient(new StubHandler(handler)) { Timeout = TimeSpan.FromSeconds(5) };
        return new TrilezApiClient(http, new Uri("https://trileez.example"), session);
    }

    private static HttpResponseMessage Json(HttpStatusCode status, string body) =>
        new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> handler) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(handler(request));
    }
}
