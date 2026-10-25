import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initializeDatabase } from '../src/db/database.js';

await initializeDatabase();
const app = createApp();

async function login(email = 'admin@trileez.ir', password = 'Admin123!'): Promise<string> {
  const response = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  return `Bearer ${response.body.token}`;
}

function issuePath(response: request.Response, path: string): void {
  assert.equal(response.body.code, 'VALIDATION_ERROR');
  assert.ok(response.body.issues.some((issue: { path: string }) => issue.path === path), JSON.stringify(response.body));
}

test('project hierarchy enforces membership, roles, task assignment, time entries, and derived metrics', async () => {
  const authorization = await login();
  const suffix = Date.now();
  const customer = await request(app).post('/api/data/customers').set('authorization', authorization).send({
    id: `project-customer-${suffix}`, entityType: 'company', name: 'Project Customer', company: 'Project Customer', currency: 'IRR',
  }).expect(201);

  const badCustomer = await request(app).post('/api/projects').set('authorization', authorization).send({ name: 'Bad customer project', customerId: `missing-${suffix}` }).expect(400);
  issuePath(badCustomer, 'body.customerId');

  const project = await request(app).post('/api/projects').set('authorization', authorization).send({
    name: `Project domain ${suffix}`, customerId: customer.body.data.id, managerId: 'u2', members: ['u2'],
    startDate: '2026-09-01', endDate: '2026-12-31',
  }).expect(201);
  assert.equal(project.body.data.progress, 0);
  assert.equal(project.body.data.customerId, customer.body.data.id);

  const roleA = await request(app).post('/api/data/project-roles').set('authorization', authorization).send({
    id: `role-a-${suffix}`, projectId: project.body.data.id, name: 'Developer', expectedHours: 40,
  }).expect(201);
  const roleB = await request(app).post('/api/data/project-roles').set('authorization', authorization).send({
    id: `role-b-${suffix}`, projectId: project.body.data.id, name: 'Reviewer', expectedHours: 10,
  }).expect(201);
  const member = await request(app).post('/api/data/project-members').set('authorization', authorization).send({
    id: `member-${suffix}`, projectId: project.body.data.id, personId: 'u3', roleIds: [roleA.body.data.id, roleB.body.data.id], joinedAt: '2026-09-01', status: 'active', hourlyCost: 100,
  }).expect(201);
  assert.deepEqual(member.body.data.roleIds, [roleA.body.data.id, roleB.body.data.id]);

  const duplicate = await request(app).post('/api/data/project-members').set('authorization', authorization).send({
    projectId: project.body.data.id, personId: 'e2', roleIds: [roleA.body.data.id], joinedAt: '2026-09-02', status: 'active',
  }).expect(400);
  issuePath(duplicate, 'body.personId');

  const phase = await request(app).post('/api/data/project-phases').set('authorization', authorization).send({
    id: `phase-${suffix}`, projectId: project.body.data.id, title: 'Implementation', startDate: '2026-09-01', endDate: '2026-11-30', plannedHours: 20,
  }).expect(201);
  const activity = await request(app).post('/api/data/project-activities').set('authorization', authorization).send({
    id: `activity-${suffix}`, projectId: project.body.data.id, roleId: roleA.body.data.id, title: 'Build', expectedHours: 12,
  }).expect(201);

  const nonMemberTask = await request(app).post('/api/tasks').set('authorization', authorization).send({
    title: 'Invalid non-member task', projectId: project.body.data.id, assigneeId: 'u2',
  }).expect(400);
  issuePath(nonMemberTask, 'body.assigneeIds');

  const task = await request(app).post('/api/tasks').set('authorization', authorization).send({
    title: 'Valid project task', projectId: project.body.data.id, phaseId: phase.body.data.id, activityId: activity.body.data.id,
    assigneeId: 'u3', assigneeMemberIds: [member.body.data.id], estimatedHours: 5, status: 'todo',
  }).expect(201);
  assert.equal(task.body.data.loggedHours, 0);

  const validTime = await request(app).post('/api/data/timesheets').set('authorization', authorization).send({
    id: `time-${suffix}`, employeeId: 'u3', projectId: project.body.data.id, taskId: task.body.data.id,
    date: '2026-09-26', hours: 3, hourlyRate: 999999, calculatedCost: 999999,
  }).expect(201);
  assert.equal(validTime.body.data.employeeId, 'e2');
  assert.equal(validTime.body.data.hourlyRate, 100);
  assert.equal(validTime.body.data.calculatedCost, 300);
  await request(app).patch(`/api/data/timesheets/${validTime.body.data.id}`).set('authorization', authorization).send({ status: 'approved' }).expect(400);
  await request(app).patch(`/api/data/timesheets/${validTime.body.data.id}/review`).set('authorization', authorization).send({ status: 'rejected' }).expect(400);
  const reviewedTime = await request(app).patch(`/api/data/timesheets/${validTime.body.data.id}/review`).set('authorization', authorization).send({ status: 'approved', reason: 'Approved for payroll' }).expect(200);
  assert.equal(reviewedTime.body.data.status, 'approved');
  assert.equal(reviewedTime.body.data.reviewReason, 'Approved for payroll');
  const correctedTime = await request(app).patch(`/api/data/timesheets/${validTime.body.data.id}`).set('authorization', authorization).send({ startTime: '09:00' }).expect(200);
  assert.equal(correctedTime.body.data.status, 'pending_review');
  assert.equal(correctedTime.body.data.reviewedBy, undefined);
  await request(app).patch(`/api/data/timesheets/${validTime.body.data.id}/review`).set('authorization', authorization).send({ status: 'approved', reason: 'Correction checked' }).expect(200);
  const billedTime = await request(app).patch(`/api/data/timesheets/${validTime.body.data.id}/billing`).set('authorization', authorization).send({ billingStatus: 'payment_queued' }).expect(200);
  assert.equal(billedTime.body.data.billingStatus, 'payment_queued');

  await request(app).patch(`/api/tasks/${task.body.data.id}`).set('authorization', authorization).send({ status: 'done' }).expect(200);
  const refreshedTask = await request(app).get(`/api/tasks/${task.body.data.id}`).set('authorization', authorization).expect(200);
  assert.equal(refreshedTask.body.data.loggedHours, 3);
  const refreshedProject = await request(app).get(`/api/projects/${project.body.data.id}`).set('authorization', authorization).expect(200);
  assert.equal(refreshedProject.body.data.tasksCount, 1);
  assert.equal(refreshedProject.body.data.completedTasksCount, 1);
  assert.equal(refreshedProject.body.data.progress, 100);
  assert.equal(refreshedProject.body.data.plannedHours, 12);
  assert.equal(refreshedProject.body.data.estimatedHours, 5);
  assert.equal(refreshedProject.body.data.actualHours, 3);
  const refreshedPhase = await request(app).get(`/api/data/project-phases/${phase.body.data.id}`).set('authorization', authorization).expect(200);
  assert.equal(refreshedPhase.body.data.progress, 100);
  assert.equal(refreshedPhase.body.data.actualHours, 3);

  await request(app).delete(`/api/tasks/${task.body.data.id}`).set('authorization', authorization).expect(400);
  await request(app).delete(`/api/data/project-members/${member.body.data.id}`).set('authorization', authorization).expect(400);
  await request(app).delete(`/api/projects/${project.body.data.id}`).set('authorization', authorization).expect(400);
  await request(app).delete(`/api/data/customers/${customer.body.data.id}`).set('authorization', authorization).expect(400);
  await request(app).delete('/api/employees/e2').set('authorization', authorization).expect(400);
});

test('phase, role, activity, task and time relationships cannot cross projects or organizations', async () => {
  const authorization = await login();
  const foreignAuthorization = await login('admin.org2@trileez.ir');
  const suffix = Date.now();
  const first = await request(app).post('/api/projects').set('authorization', authorization).send({ name: `First ${suffix}` }).expect(201);
  const second = await request(app).post('/api/projects').set('authorization', authorization).send({ name: `Second ${suffix}` }).expect(201);
  const phase = await request(app).post('/api/data/project-phases').set('authorization', authorization).send({ projectId: second.body.data.id, title: 'Other phase' }).expect(201);
  const mismatchedTask = await request(app).post('/api/tasks').set('authorization', authorization).send({ title: 'Mismatch', projectId: first.body.data.id, phaseId: phase.body.data.id }).expect(400);
  issuePath(mismatchedTask, 'body.phaseId');

  await request(app).get(`/api/data/project-phases/${phase.body.data.id}`).set('authorization', foreignAuthorization).expect(404);
  const foreignUse = await request(app).post('/api/tasks').set('authorization', foreignAuthorization).send({ title: 'Foreign reference', projectId: first.body.data.id }).expect(400);
  issuePath(foreignUse, 'body.projectId');
});
