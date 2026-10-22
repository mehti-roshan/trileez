import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { database, initializeDatabase } from '../src/db/database.js';

await initializeDatabase();
const app = createApp();

function tehranDay(value: unknown): string {
  const text = String(value ?? '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(text));
}

async function login(email = 'admin@trileez.ir', password = 'Admin123!'): Promise<string> {
  const response = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  return `Bearer ${response.body.token}`;
}

test('gantt dates, board status, and time entries persist without weakening validation or authorization', async () => {
  const authorization = await login();
  const memberAuthorization = await login('member@trileez.ir', 'Manager123!');
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const project = await request(app).post('/api/projects').set('authorization', authorization).send({
    name: `Schedule contract ${suffix}`, startDate: '2026-09-01', endDate: '2026-12-31',
  }).expect(201);
  const projectId = project.body.data.id;
  const role = await request(app).post('/api/data/project-roles').set('authorization', authorization).send({
    id: `role-${suffix}`, projectId, name: 'Builder', expectedHours: 40,
  }).expect(201);
  const otherRole = await request(app).post('/api/data/project-roles').set('authorization', authorization).send({
    id: `other-role-${suffix}`, projectId, name: 'Reviewer', expectedHours: 8,
  }).expect(201);
  const member = await request(app).post('/api/data/project-members').set('authorization', authorization).send({
    id: `member-${suffix}`, projectId, personId: 'u3', roleIds: [role.body.data.id], joinedAt: '2026-09-01', status: 'active', hourlyCost: 100,
  }).expect(201);
  await request(app).post('/api/data/project-members').set('authorization', authorization).send({
    id: `manager-member-${suffix}`, projectId, personId: 'u2', roleIds: [role.body.data.id], joinedAt: '2026-09-01', status: 'active', hourlyCost: 80,
  }).expect(201);
  const phase = await request(app).post('/api/data/project-phases').set('authorization', authorization).send({
    id: `phase-${suffix}`, projectId, title: 'Delivery', startDate: '2026-09-01', endDate: '2026-11-30',
  }).expect(201);
  const activity = await request(app).post('/api/data/project-activities').set('authorization', authorization).send({
    id: `activity-${suffix}`, projectId, roleId: role.body.data.id, title: 'Build', expectedHours: 12,
  }).expect(201);
  const otherActivity = await request(app).post('/api/data/project-activities').set('authorization', authorization).send({
    id: `other-activity-${suffix}`, projectId, roleId: otherRole.body.data.id, title: 'Review', expectedHours: 4,
  }).expect(201);

  const outsidePhase = await request(app).post('/api/tasks').set('authorization', authorization).send({
    title: 'Outside the phase', projectId, phaseId: phase.body.data.id, activityId: activity.body.data.id,
    assigneeId: 'u3', assigneeMemberIds: [member.body.data.id], startDate: '2026-09-01', dueDate: '2026-12-15', status: 'todo',
  }).expect(400);
  assert.equal(outsidePhase.body.error, 'Validation failed');
  assert.equal(outsidePhase.body.code, 'VALIDATION_ERROR');
  assert.equal(outsidePhase.body.issues.find((issue: { path: string }) => issue.path === 'body.dueDate')?.code, 'invalid_relationship');

  const created = await request(app).post('/api/tasks').set('authorization', authorization).send({
    title: `Movable task ${suffix}`, projectId, phaseId: phase.body.data.id, activityId: activity.body.data.id,
    assigneeId: 'u3', assigneeMemberIds: [member.body.data.id], startDate: '2026-09-01', dueDate: '2026-09-10', status: 'todo',
  }).expect(201);
  const taskId = created.body.data.id;

  const moved = await request(app).patch(`/api/tasks/${taskId}`).set('authorization', authorization).send({
    startDate: '2026-09-05', dueDate: '2026-09-20',
  }).expect(200);
  assert.equal(tehranDay(moved.body.data.startDate), '2026-09-05');
  assert.equal(tehranDay(moved.body.data.dueDate), '2026-09-20');
  const movedStored = await request(app).get(`/api/tasks/${taskId}`).set('authorization', authorization).expect(200);
  assert.equal(tehranDay(movedStored.body.data.startDate), '2026-09-05');
  assert.equal(tehranDay(movedStored.body.data.dueDate), '2026-09-20');

  const pastPhase = await request(app).patch(`/api/tasks/${taskId}`).set('authorization', authorization).send({ dueDate: '2026-12-15' }).expect(400);
  assert.ok(pastPhase.body.issues.some((issue: { path: string; message: string }) => issue.path === 'body.dueDate' && issue.message.length > 0));
  const unchangedDate = await request(app).get(`/api/tasks/${taskId}`).set('authorization', authorization).expect(200);
  assert.equal(tehranDay(unchangedDate.body.data.dueDate), '2026-09-20');

  const phaseEndEvening = await request(app).patch(`/api/tasks/${taskId}`).set('authorization', authorization).send({ dueDate: '2026-11-30T18:00:00.000Z' }).expect(200);
  assert.equal(tehranDay(phaseEndEvening.body.data.dueDate), '2026-11-30');
  const nextTehranDay = await request(app).patch(`/api/tasks/${taskId}`).set('authorization', authorization).send({ dueDate: '2026-11-30T20:30:00.000Z' }).expect(400);
  assert.ok(nextTehranDay.body.issues.some((issue: { path: string }) => issue.path === 'body.dueDate'));
  const stillPhaseEnd = await request(app).get(`/api/tasks/${taskId}`).set('authorization', authorization).expect(200);
  assert.equal(stillPhaseEnd.body.data.dueDate, phaseEndEvening.body.data.dueDate);

  await database.forOrganization('org1').update('Task', taskId, { dueDate: '2026-12-31', activityId: otherActivity.body.data.id });
  const statusMove = await request(app).patch(`/api/tasks/${taskId}`).set('authorization', authorization).send({ status: 'in_progress' }).expect(200);
  assert.equal(statusMove.body.data.status, 'in_progress');
  const statusStored = await request(app).get(`/api/tasks/${taskId}`).set('authorization', authorization).expect(200);
  assert.equal(statusStored.body.data.status, 'in_progress');
  assert.equal(tehranDay(statusStored.body.data.dueDate), '2026-12-31');
  assert.equal(statusStored.body.data.activityId, otherActivity.body.data.id);

  const roleStillEnforced = await request(app).patch(`/api/tasks/${taskId}`).set('authorization', authorization).send({ activityId: otherActivity.body.data.id }).expect(400);
  assert.ok(roleStillEnforced.body.issues.some((issue: { path: string }) => issue.path === 'body.activityId'));
  const roleUnchanged = await request(app).get(`/api/tasks/${taskId}`).set('authorization', authorization).expect(200);
  assert.equal(roleUnchanged.body.data.status, 'in_progress');

  const echoed = await request(app).patch(`/api/tasks/${taskId}`).set('authorization', authorization).send({ status: 'review', updatedBy: 'u3' }).expect(200);
  assert.equal(echoed.body.data.status, 'review');
  assert.equal(echoed.body.data.updatedBy, 'u1');
  const echoedStored = await request(app).get(`/api/tasks/${taskId}`).set('authorization', authorization).expect(200);
  assert.equal(echoedStored.body.data.status, 'review');
  assert.equal(echoedStored.body.data.updatedBy, 'u1');

  const createdTime = await request(app).post('/api/data/timesheets').set('authorization', authorization).send({
    id: `time-${suffix}`, employeeId: 'u3', projectId, taskId, date: '2026-09-26', hours: 2.5, hourlyRate: 1, calculatedCost: 1, status: 'approved',
  }).expect(201);
  assert.equal(createdTime.body.data.employeeId, 'e2');
  assert.equal(createdTime.body.data.hours, 2.5);
  assert.equal(createdTime.body.data.status, 'pending_review');
  assert.equal(tehranDay(createdTime.body.data.date), '2026-09-26');
  const createdTimeStored = await request(app).get(`/api/data/timesheets/${createdTime.body.data.id}`).set('authorization', authorization).expect(200);
  assert.equal(createdTimeStored.body.data.employeeId, 'e2');
  assert.equal(createdTimeStored.body.data.hours, 2.5);
  assert.equal(createdTimeStored.body.data.status, 'pending_review');

  const editedTime = await request(app).patch(`/api/data/timesheets/${createdTime.body.data.id}`).set('authorization', authorization).send({
    date: '2026-09-27', hours: 4,
  }).expect(200);
  assert.equal(editedTime.body.data.hours, 4);
  assert.equal(tehranDay(editedTime.body.data.date), '2026-09-27');
  assert.equal(editedTime.body.data.status, 'pending_review');
  await request(app).patch(`/api/data/timesheets/${createdTime.body.data.id}/review`).set('authorization', authorization).send({ status: 'approved', reason: 'Checked' }).expect(200);
  const reopened = await request(app).patch(`/api/data/timesheets/${createdTime.body.data.id}`).set('authorization', authorization).send({ hours: 5 }).expect(200);
  assert.equal(reopened.body.data.hours, 5);
  assert.equal(reopened.body.data.status, 'pending_review');
  assert.equal(reopened.body.data.reviewedBy, undefined);
  const reopenedStored = await request(app).get(`/api/data/timesheets/${createdTime.body.data.id}`).set('authorization', authorization).expect(200);
  assert.equal(reopenedStored.body.data.hours, 5);
  assert.equal(reopenedStored.body.data.status, 'pending_review');

  const invalidHours = await request(app).patch(`/api/data/timesheets/${createdTime.body.data.id}`).set('authorization', authorization).send({ hours: 30 }).expect(400);
  assert.equal(invalidHours.body.error, 'Validation failed');
  assert.ok(invalidHours.body.issues.some((issue: { path: string; code: string }) => issue.path === 'body.hours' && issue.code === 'too_large'));
  const hoursUnchanged = await request(app).get(`/api/data/timesheets/${createdTime.body.data.id}`).set('authorization', authorization).expect(200);
  assert.equal(hoursUnchanged.body.data.hours, 5);

  const missingHours = await request(app).post('/api/data/timesheets').set('authorization', authorization).send({
    id: `missing-hours-${suffix}`, employeeId: 'u3', projectId, taskId, date: '2026-09-26',
  }).expect(400);
  assert.ok(missingHours.body.issues.some((issue: { path: string }) => issue.path === 'body.hours'));
  await request(app).get(`/api/data/timesheets/missing-hours-${suffix}`).set('authorization', authorization).expect(404);

  const unassigned = await request(app).post('/api/data/timesheets').set('authorization', authorization).send({
    id: `unassigned-${suffix}`, employeeId: 'u2', projectId, taskId, date: '2026-09-26', hours: 1,
  }).expect(400);
  assert.ok(unassigned.body.issues.some((issue: { path: string }) => issue.path === 'body.employeeId'));
  await request(app).get(`/api/data/timesheets/unassigned-${suffix}`).set('authorization', authorization).expect(404);

  await request(app).patch(`/api/tasks/${taskId}`).set('authorization', memberAuthorization).send({ status: 'done' }).expect(403);
  const memberTaskDenied = await request(app).get(`/api/tasks/${taskId}`).set('authorization', authorization).expect(200);
  assert.equal(memberTaskDenied.body.data.status, 'review');
  await request(app).patch(`/api/data/timesheets/${createdTime.body.data.id}`).set('authorization', memberAuthorization).send({ hours: 6 }).expect(403);
  const memberTimeDenied = await request(app).get(`/api/data/timesheets/${createdTime.body.data.id}`).set('authorization', authorization).expect(200);
  assert.equal(memberTimeDenied.body.data.hours, 5);

  const memberCreated = await request(app).post('/api/data/timesheets').set('authorization', memberAuthorization).send({
    id: `member-time-${suffix}`, employeeId: 'u3', projectId, taskId, date: '2026-09-28', hours: 1.5,
  }).expect(201);
  assert.equal(memberCreated.body.data.employeeId, 'e2');
  assert.equal(memberCreated.body.data.status, 'pending_review');
  const memberStored = await request(app).get(`/api/data/timesheets/${memberCreated.body.data.id}`).set('authorization', authorization).expect(200);
  assert.equal(memberStored.body.data.hours, 1.5);
  assert.equal(tehranDay(memberStored.body.data.date), '2026-09-28');

  await request(app).patch(`/api/tasks/${taskId}`).send({ status: 'done' }).expect(401);
  await request(app).post('/api/data/timesheets').send({
    id: `anonymous-${suffix}`, employeeId: 'u3', projectId, taskId, date: '2026-09-28', hours: 1,
  }).expect(401);
  const anonymousUntouched = await request(app).get(`/api/tasks/${taskId}`).set('authorization', authorization).expect(200);
  assert.equal(anonymousUntouched.body.data.status, 'review');
  await request(app).get(`/api/data/timesheets/anonymous-${suffix}`).set('authorization', authorization).expect(404);
});
