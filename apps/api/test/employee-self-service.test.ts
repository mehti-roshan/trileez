import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { database, initializeDatabase } from '../src/db/database.js';

await initializeDatabase();
const app = createApp();
const password = 'StrongPassword123!';

function suffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function hasIssue(response: { body: { issues?: { path?: string }[] } }, path: string): boolean {
  return Array.isArray(response.body.issues) && response.body.issues.some((issue) => issue.path === path);
}

async function login(email: string): Promise<{ authorization: string; user: { id: string; organizationId: string; employeeId: string | null }; employee: { state: string; employeeId: string | null; employmentStatus: string | null } }> {
  const response = await request(app).post('/api/auth/login').send({ email, password: email === 'admin@trileez.ir' ? 'Admin123!' : password }).expect(200);
  const me = await request(app).get('/api/auth/me').set('authorization', `Bearer ${response.body.token}`).expect(200);
  return { authorization: `Bearer ${response.body.token}`, user: me.body.user, employee: me.body.employee };
}

async function createAccount(adminAuthorization: string, organizationId: string, role: 'manager' | 'member', label: string) {
  const tag = suffix();
  const email = `${label}.${tag}@example.com`;
  const created = await request(app).post('/api/users').set('authorization', adminAuthorization).send({
    name: `Actor ${label} ${tag}`, email, password, role, title: 'همکار',
  }).expect(201);
  await database.forOrganization(organizationId).update('User', created.body.data.id, { mustChangePassword: false });
  return { id: created.body.data.id as string, email };
}

async function createEmployee(authorization: string, input: Record<string, unknown>) {
  const response = await request(app).post('/api/employees').set('authorization', authorization).send({
    compensationType: 'hourly_task', employmentStatus: 'active', ...input,
  }).expect(201);
  return response.body.data as { id: string; userId?: string; employmentStatus?: string };
}

test('auth me reports an active employee id and a non-error empty state', async () => {
  const admin = await login('admin@trileez.ir');
  const tag = suffix();
  const activeAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'active');
  const plainAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'plain');
  const inactiveAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'inactive');
  const activeEmployee = await createEmployee(admin.authorization, { fullName: `Active ${tag}`, personnelCode: `ACT-${tag}`, userId: activeAccount.id });
  await createEmployee(admin.authorization, { fullName: `Ended ${tag}`, personnelCode: `END-${tag}`, userId: inactiveAccount.id, employmentStatus: 'terminated' });

  const active = await login(activeAccount.email);
  assert.equal(active.user.employeeId, activeEmployee.id);
  assert.equal(active.employee.state, 'active');
  assert.equal(active.employee.employeeId, activeEmployee.id);
  assert.equal(active.employee.employmentStatus, 'active');

  const plain = await login(plainAccount.email);
  assert.equal(plain.user.employeeId, null);
  assert.equal(plain.employee.state, 'none');
  assert.equal(plain.employee.employeeId, null);
  assert.equal(plain.employee.employmentStatus, null);
  const plainAttendance = await request(app).get('/api/me/attendance').set('authorization', plain.authorization).expect(200);
  assert.deepEqual(plainAttendance.body.data, []);
  assert.equal(plainAttendance.body.employee.state, 'none');

  const inactive = await login(inactiveAccount.email);
  assert.equal(inactive.user.employeeId, null);
  assert.equal(inactive.employee.state, 'inactive');
  assert.equal(inactive.employee.employeeId, null);
  assert.equal(inactive.employee.employmentStatus, 'terminated');
  const inactiveTime = await request(app).post('/api/me/timesheets').set('authorization', inactive.authorization).send({
    projectId: 'missing-project', taskId: 'missing-task', date: '2026-10-16', hours: 1,
  }).expect(400);
  assert.equal(hasIssue(inactiveTime, 'body.employeeId'), true);
});

test('an employee can read only assigned tasks, authorized meetings, and own notifications', async () => {
  const admin = await login('admin@trileez.ir');
  const tag = suffix();
  const managerAccount = await createAccount(admin.authorization, admin.user.organizationId, 'manager', 'reader');
  const firstAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'first');
  const secondAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'second');
  await createEmployee(admin.authorization, { fullName: `First ${tag}`, personnelCode: `FST-${tag}`, userId: firstAccount.id });
  await createEmployee(admin.authorization, { fullName: `Second ${tag}`, personnelCode: `SND-${tag}`, userId: secondAccount.id });
  const manager = await login(managerAccount.email);
  const first = await login(firstAccount.email);
  const second = await login(secondAccount.email);
  const project = await request(app).post('/api/projects').set('authorization', admin.authorization).send({
    name: `Scoped ${tag}`, code: `SCP-${tag}`, startDate: '2026-09-01', endDate: '2026-12-31',
    initialMembers: [first.employee.employeeId, second.employee.employeeId],
  }).expect(201);
  const projectId = project.body.data.id as string;
  const mine = await request(app).post('/api/tasks').set('authorization', admin.authorization).send({
    title: `Mine ${tag}`, projectId, assigneeId: first.user.id, status: 'todo',
  }).expect(201);
  const shared = await request(app).post('/api/tasks').set('authorization', admin.authorization).send({
    title: `Shared ${tag}`, projectId, assigneeIds: [first.user.id, second.user.id], status: 'todo',
  }).expect(201);
  const other = await request(app).post('/api/tasks').set('authorization', admin.authorization).send({
    title: `Other ${tag}`, projectId, assigneeId: second.user.id, status: 'todo',
  }).expect(201);
  const followed = await request(app).post('/api/tasks').set('authorization', admin.authorization).send({
    title: `Followed ${tag}`, projectId, assigneeId: second.user.id, followerIds: [first.user.id], status: 'todo',
  }).expect(201);

  const myTasks = await request(app).get('/api/me/tasks').query({ limit: 100 }).set('authorization', first.authorization).expect(200);
  const myTaskIds = myTasks.body.data.map((task: { id: string }) => task.id);
  assert.equal(myTaskIds.includes(mine.body.data.id), true);
  assert.equal(myTaskIds.includes(shared.body.data.id), true);
  assert.equal(myTaskIds.includes(other.body.data.id), false);
  assert.equal(myTaskIds.includes(followed.body.data.id), false);
  await request(app).get(`/api/me/tasks/${mine.body.data.id}`).set('authorization', first.authorization).expect(200);
  await request(app).get(`/api/me/tasks/${other.body.data.id}`).set('authorization', first.authorization).expect(404);
  const widened = await request(app).get('/api/me/tasks').query({ assigneeId: second.user.id, limit: 100 }).set('authorization', first.authorization).expect(400);
  assert.equal(hasIssue(widened, 'query.assigneeId'), true);
  assert.equal(JSON.stringify(widened.body).includes(other.body.data.id), false);
  const managementTasks = await request(app).get('/api/tasks').query({ assigneeId: second.user.id, limit: 100 }).set('authorization', manager.authorization).expect(200);
  const managementIds = managementTasks.body.data.map((task: { id: string }) => task.id);
  assert.equal(managementIds.includes(other.body.data.id), true);
  assert.equal(managementIds.includes(followed.body.data.id), true);

  const visibleMeeting = await request(app).post('/api/meetings').set('authorization', admin.authorization).send({
    title: `Visible ${tag}`, startAt: '2026-10-16T09:00:00.000Z', durationMinutes: 30, organizerId: second.user.id, participantIds: [first.user.id, second.user.id],
  }).expect(201);
  const hiddenMeeting = await request(app).post('/api/meetings').set('authorization', admin.authorization).send({
    title: `Hidden ${tag}`, startAt: '2026-10-16T11:00:00.000Z', durationMinutes: 30, organizerId: second.user.id, participantIds: [second.user.id],
  }).expect(201);
  const myMeetings = await request(app).get('/api/me/meetings').query({ limit: 100 }).set('authorization', first.authorization).expect(200);
  const myMeetingIds = myMeetings.body.data.map((meeting: { id: string }) => meeting.id);
  assert.deepEqual(myMeetingIds, [visibleMeeting.body.data.id]);
  const memberMeetings = await request(app).get('/api/meetings').query({ limit: 100 }).set('authorization', first.authorization).expect(200);
  const memberMeetingIds = memberMeetings.body.data.map((meeting: { id: string }) => meeting.id);
  assert.equal(memberMeetingIds.includes(visibleMeeting.body.data.id), true);
  assert.equal(memberMeetingIds.includes(hiddenMeeting.body.data.id), false);
  await request(app).get(`/api/me/meetings/${hiddenMeeting.body.data.id}`).set('authorization', first.authorization).expect(404);
  await request(app).get(`/api/meetings/${hiddenMeeting.body.data.id}`).set('authorization', first.authorization).expect(404);
  await request(app).get(`/api/meetings/${hiddenMeeting.body.data.id}`).set('authorization', manager.authorization).expect(200);
  const meetingQuery = await request(app).get('/api/me/meetings').query({ organizerId: second.user.id }).set('authorization', first.authorization).expect(400);
  assert.equal(JSON.stringify(meetingQuery.body).includes(hiddenMeeting.body.data.id), false);

  const ownNote = await request(app).post('/api/data/notifications').set('authorization', admin.authorization).send({
    title: `Note ${tag} first`, recipientId: first.user.id, read: false,
  }).expect(201);
  const otherNote = await request(app).post('/api/data/notifications').set('authorization', admin.authorization).send({
    title: `Note ${tag} second`, recipientId: second.user.id, read: false,
  }).expect(201);
  const notes = await request(app).get('/api/me/notifications').query({ limit: 100 }).set('authorization', first.authorization).expect(200);
  const noteIds = notes.body.data.map((item: { id: string }) => item.id);
  assert.equal(noteIds.includes(ownNote.body.data.id), true);
  assert.equal(noteIds.includes(otherNote.body.data.id), false);
  const legacyNotes = await request(app).get('/api/data/notifications').query({ limit: 100 }).set('authorization', first.authorization).expect(200);
  const legacyIds = legacyNotes.body.data.map((item: { id: string }) => item.id);
  assert.equal(legacyIds.includes(otherNote.body.data.id), false);
  await request(app).get(`/api/me/notifications/${otherNote.body.data.id}`).set('authorization', first.authorization).expect(404);
  await request(app).get(`/api/data/notifications/${otherNote.body.data.id}`).set('authorization', first.authorization).expect(404);
  const noteQuery = await request(app).get('/api/me/notifications').query({ recipientId: second.user.id }).set('authorization', first.authorization).expect(400);
  assert.equal(JSON.stringify(noteQuery.body).includes(otherNote.body.data.id), false);
});

test('attendance and timesheets stay on the caller and time entry rejects another employee', async () => {
  const admin = await login('admin@trileez.ir');
  const tag = suffix();
  const managerAccount = await createAccount(admin.authorization, admin.user.organizationId, 'manager', 'payroll');
  const firstAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'worker');
  const secondAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'peer');
  const plainAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'unlinked');
  const firstEmployee = await createEmployee(admin.authorization, {
    fullName: `Worker ${tag}`, personnelCode: `WRK-${tag}`, userId: firstAccount.id,
    employmentType: 'full_time', compensationType: 'full_time_attendance', hourlyRate: 0,
  });
  const secondEmployee = await createEmployee(admin.authorization, {
    fullName: `Peer ${tag}`, personnelCode: `PER-${tag}`, userId: secondAccount.id,
    employmentType: 'full_time', compensationType: 'full_time_attendance', hourlyRate: 0,
  });
  const manager = await login(managerAccount.email);
  const first = await login(firstAccount.email);
  const second = await login(secondAccount.email);
  const plain = await login(plainAccount.email);
  const project = await request(app).post('/api/projects').set('authorization', admin.authorization).send({
    name: `Time ${tag}`, code: `TIM-${tag}`, startDate: '2026-09-01', endDate: '2026-12-31',
    initialMembers: [firstEmployee.id, secondEmployee.id],
  }).expect(201);
  const projectId = project.body.data.id as string;
  const ownTask = await request(app).post('/api/tasks').set('authorization', admin.authorization).send({
    title: `Own task ${tag}`, projectId, assigneeId: first.user.id, status: 'todo',
  }).expect(201);
  const peerTask = await request(app).post('/api/tasks').set('authorization', admin.authorization).send({
    title: `Peer task ${tag}`, projectId, assigneeId: second.user.id, status: 'todo',
  }).expect(201);
  const outsiderProject = await request(app).post('/api/projects').set('authorization', admin.authorization).send({
    name: `Outside ${tag}`, code: `OUT-${tag}`, startDate: '2026-09-01', endDate: '2026-12-31', initialMembers: [secondEmployee.id],
  }).expect(201);
  const outsideTask = await request(app).post('/api/tasks').set('authorization', admin.authorization).send({
    title: `Outside task ${tag}`, projectId: outsiderProject.body.data.id, assigneeId: second.user.id, status: 'todo',
  }).expect(201);

  const schedule = {
    timezone: 'Asia/Tehran', weeklyExpectedMinutes: 2_400,
    days: [6, 0, 1, 2, 3].map((weekday) => ({ weekday, expectedMinutes: 480 })),
  };
  await request(app).post('/api/data/compensations').set('authorization', admin.authorization).send({
    employeeId: firstEmployee.id, paymentMethod: 'full_time_attendance', effectiveFrom: '2026-09-01',
    monthlySalary: 90_000_000, overtimeEnabled: true, overtimeRateMultiplier: 1.4, expectedSchedule: schedule,
  }).expect(201);
  await request(app).post('/api/data/compensations').set('authorization', admin.authorization).send({
    employeeId: secondEmployee.id, paymentMethod: 'full_time_attendance', effectiveFrom: '2026-09-01',
    monthlySalary: 90_000_000, overtimeEnabled: true, overtimeRateMultiplier: 1.4, expectedSchedule: schedule,
  }).expect(201);
  const ownAttendance = await request(app).post('/api/data/attendance').set('authorization', admin.authorization).send({
    employeeId: firstEmployee.id, date: '2026-10-16', status: 'present',
    clockIn: '2026-10-16T08:00:00+03:30', clockOut: '2026-10-16T16:00:00+03:30',
  }).expect(201);
  const peerAttendance = await request(app).post('/api/data/attendance').set('authorization', admin.authorization).send({
    employeeId: secondEmployee.id, date: '2026-10-16', status: 'remote',
    clockIn: '2026-10-16T09:00:00+03:30', clockOut: '2026-10-16T17:00:00+03:30',
  }).expect(201);
  const attendance = await request(app).get('/api/me/attendance').query({ limit: 100 }).set('authorization', first.authorization).expect(200);
  assert.deepEqual(attendance.body.data.map((row: { id: string }) => row.id), [ownAttendance.body.data.id]);
  assert.equal(attendance.body.employee.employeeId, firstEmployee.id);
  await request(app).get(`/api/me/attendance/${peerAttendance.body.data.id}`).set('authorization', first.authorization).expect(404);
  const attendanceQuery = await request(app).get('/api/me/attendance').query({ employeeId: secondEmployee.id }).set('authorization', first.authorization).expect(400);
  assert.equal(hasIssue(attendanceQuery, 'query.employeeId'), true);
  assert.equal(JSON.stringify(attendanceQuery.body).includes(peerAttendance.body.data.id), false);
  const attendanceDenied = await request(app).get('/api/data/attendance').set('authorization', first.authorization).expect(403);
  assert.equal(attendanceDenied.body.resource, 'attendance');
  const managerAttendance = await request(app).get('/api/data/attendance').query({ employeeId: secondEmployee.id, limit: 100 }).set('authorization', manager.authorization).expect(200);
  assert.equal(managerAttendance.body.data.some((row: { id: string }) => row.id === peerAttendance.body.data.id), true);

  const created = await request(app).post('/api/me/timesheets').set('authorization', first.authorization).send({
    projectId, taskId: ownTask.body.data.id, date: '2026-10-16', hours: 1.5, description: 'پیاده‌سازی', status: 'approved', hourlyRate: 1,
  }).expect(201);
  assert.equal(created.body.data.employeeId, firstEmployee.id);
  assert.equal(created.body.data.hours, 1.5);
  assert.equal(created.body.data.status, 'pending_review');
  assert.equal(created.body.data.hourlyRate === 1, false);
  const peerEntry = await request(app).post('/api/me/timesheets').set('authorization', second.authorization).send({
    projectId, taskId: peerTask.body.data.id, date: '2026-10-16', hours: 2,
  }).expect(201);
  const myTimes = await request(app).get('/api/me/timesheets').query({ limit: 100 }).set('authorization', first.authorization).expect(200);
  assert.deepEqual(myTimes.body.data.map((row: { id: string }) => row.id), [created.body.data.id]);
  await request(app).get(`/api/me/timesheets/${peerEntry.body.data.id}`).set('authorization', first.authorization).expect(404);
  await request(app).get(`/api/data/timesheets/${peerEntry.body.data.id}`).set('authorization', first.authorization).expect(404);
  const timesQuery = await request(app).get('/api/data/timesheets').query({ employeeId: secondEmployee.id, limit: 100 }).set('authorization', first.authorization).expect(200);
  assert.equal(timesQuery.body.data.some((row: { id: string }) => row.id === peerEntry.body.data.id), false);
  await request(app).get(`/api/data/timesheets/${peerEntry.body.data.id}`).set('authorization', manager.authorization).expect(200);
  const managerTimes = await request(app).get('/api/data/timesheets').query({ employeeId: secondEmployee.id, limit: 100 }).set('authorization', admin.authorization).expect(200);
  assert.equal(managerTimes.body.data.some((row: { id: string }) => row.id === peerEntry.body.data.id), true);

  const stolen = await request(app).post('/api/data/timesheets').set('authorization', first.authorization).send({
    id: `stolen-${tag}`, employeeId: secondEmployee.id, projectId, taskId: ownTask.body.data.id, date: '2026-10-17', hours: 1,
  }).expect(400);
  assert.equal(hasIssue(stolen, 'body.employeeId'), true);
  await request(app).get(`/api/data/timesheets/stolen-${tag}`).set('authorization', admin.authorization).expect(404);
  const foreignSelf = await request(app).post('/api/me/timesheets').set('authorization', first.authorization).send({
    employeeId: secondEmployee.id, projectId, taskId: ownTask.body.data.id, date: '2026-10-17', hours: 1,
  }).expect(400);
  assert.equal(hasIssue(foreignSelf, 'body.employeeId'), true);
  const unassigned = await request(app).post('/api/me/timesheets').set('authorization', first.authorization).send({
    projectId, taskId: peerTask.body.data.id, date: '2026-10-17', hours: 1,
  }).expect(400);
  assert.equal(hasIssue(unassigned, 'body.employeeId'), true);
  const outside = await request(app).post('/api/me/timesheets').set('authorization', first.authorization).send({
    projectId: outsiderProject.body.data.id, taskId: outsideTask.body.data.id, date: '2026-10-17', hours: 1,
  }).expect(400);
  assert.equal(hasIssue(outside, 'body.employeeId'), true);
  const unlinked = await request(app).post('/api/me/timesheets').set('authorization', plain.authorization).send({
    projectId, taskId: ownTask.body.data.id, date: '2026-10-17', hours: 1,
  }).expect(400);
  assert.equal(hasIssue(unlinked, 'body.employeeId'), true);

  const managerCreated = await request(app).post('/api/data/timesheets').set('authorization', manager.authorization).send({
    employeeId: secondEmployee.id, projectId, taskId: peerTask.body.data.id, date: '2026-10-18', hours: 3,
  }).expect(201);
  assert.equal(managerCreated.body.data.employeeId, secondEmployee.id);
  assert.equal(managerCreated.body.data.status, 'pending_review');
});
