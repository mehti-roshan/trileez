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

function expectIssue(response: request.Response, path: string): void {
  assert.equal(response.body.code, 'VALIDATION_ERROR');
  assert.ok(response.body.issues.some((issue: { path: string }) => issue.path === path), JSON.stringify(response.body));
}

test('meetings validate project, customer, people, tasks, departments, and permissions', async () => {
  const admin = await login();
  const memberToken = await login('member@trileez.ir', 'Manager123!');
  const foreign = await login('admin.org2@trileez.ir');
  const suffix = Date.now();
  const customer = await request(app).post('/api/data/customers').set('authorization', admin).send({
    id: `meeting-customer-${suffix}`, entityType: 'company', name: 'Meeting Customer', company: 'Meeting Customer', currency: 'IRR',
  }).expect(201);
  const otherCustomer = await request(app).post('/api/data/customers').set('authorization', admin).send({
    id: `meeting-other-customer-${suffix}`, entityType: 'company', name: 'Other Customer', company: 'Other Customer', currency: 'IRR',
  }).expect(201);
  const project = await request(app).post('/api/projects').set('authorization', admin).send({ name: `Meeting project ${suffix}`, customerId: customer.body.data.id }).expect(201);
  const task = await request(app).post('/api/tasks').set('authorization', admin).send({ title: 'Meeting task', projectId: project.body.data.id }).expect(201);

  await request(app).post('/api/meetings').set('authorization', memberToken).send({
    title: 'Forbidden meeting', startAt: '2026-10-10T10:00:00.000Z', durationMinutes: 30, organizerId: 'u3',
  }).expect(403);

  const malformedOrganizer = await request(app).post('/api/meetings').set('authorization', admin).send({
    title: 'Malformed organizer', startAt: '2026-10-10T10:00:00.000Z', durationMinutes: 30, organizerId: 'not-an-object-id',
  }).expect(400);
  expectIssue(malformedOrganizer, 'body.organizerId');

  const mismatch = await request(app).post('/api/meetings').set('authorization', admin).send({
    title: 'Mismatched customer', startAt: '2026-10-10T10:00:00.000Z', durationMinutes: 30, organizerId: 'u2',
    projectId: project.body.data.id, customerId: otherCustomer.body.data.id,
  }).expect(400);
  expectIssue(mismatch, 'body.customerId');

  const missingAttachment = await request(app).post('/api/meetings').set('authorization', admin).send({
    title: 'Missing attachment', startAt: '2026-10-10T10:00:00.000Z', durationMinutes: 30, organizerId: 'u2', attachments: [`missing-file-${suffix}`],
  }).expect(400);
  expectIssue(missingAttachment, 'body.attachments');

  const meeting = await request(app).post('/api/meetings').set('authorization', admin).send({
    title: 'Complete project meeting', startAt: '2026-10-10T10:00:00.000Z', durationMinutes: 75, organizerId: 'u2',
    participantIds: ['u2', 'u3', 'u3'], employeeIds: ['e2'], departments: ['فنی', 'محصول', 'فنی'], projectId: project.body.data.id,
    customerId: customer.body.data.id, taskIds: [task.body.data.id], agenda: 'Review delivery', notes: 'Meeting notes', outcome: 'Approved',
    followUpActions: 'Ship the result', attachments: [], createdBy: 'u-org2-admin',
  }).expect(201);
  assert.equal(meeting.body.data.createdBy, 'u1');
  assert.deepEqual(meeting.body.data.participantIds, ['u2', 'u3']);
  assert.deepEqual(meeting.body.data.departments, ['فنی', 'محصول']);
  assert.equal(meeting.body.data.projectId, project.body.data.id);
  assert.equal(meeting.body.data.customerId, customer.body.data.id);
  assert.deepEqual(meeting.body.data.taskIds, [task.body.data.id]);

  await request(app).get(`/api/meetings/${meeting.body.data.id}`).set('authorization', foreign).expect(404);
  await request(app).patch(`/api/meetings/${meeting.body.data.id}`).set('authorization', admin).send({
    status: 'completed', discussionSummary: 'Discussed', decisions: 'Proceed', nextMeetingAt: '2026-10-11T10:00:00.000Z',
  }).expect(200);
});

test('project events enforce relationships and are generated for important project changes', async () => {
  const admin = await login();
  const memberToken = await login('member@trileez.ir', 'Manager123!');
  const suffix = Date.now();
  const project = await request(app).post('/api/projects').set('authorization', admin).send({
    name: `Event project ${suffix}`, startDate: '2026-09-01', endDate: '2026-12-31',
  }).expect(201);
  const otherProject = await request(app).post('/api/projects').set('authorization', admin).send({ name: `Other event project ${suffix}` }).expect(201);
  const projectMember = await request(app).post('/api/data/project-members').set('authorization', admin).send({
    id: `event-member-${suffix}`, projectId: project.body.data.id, personId: 'u3', joinedAt: '2026-09-01', status: 'active', roleIds: [],
  }).expect(201);
  const phase = await request(app).post('/api/data/project-phases').set('authorization', admin).send({
    id: `event-phase-${suffix}`, projectId: project.body.data.id, title: 'Important phase', startDate: '2026-09-01', endDate: '2026-11-30',
  }).expect(201);
  const otherPhase = await request(app).post('/api/data/project-phases').set('authorization', admin).send({
    id: `other-event-phase-${suffix}`, projectId: otherProject.body.data.id, title: 'Other phase',
  }).expect(201);
  const task = await request(app).post('/api/tasks').set('authorization', admin).send({
    title: 'Major delivery milestone', projectId: project.body.data.id, phaseId: phase.body.data.id, assigneeId: 'u3', priority: 'high', status: 'in_progress',
  }).expect(201);

  await request(app).post('/api/project-events').set('authorization', memberToken).send({
    projectId: project.body.data.id, eventType: 'یادداشت عملیاتی', title: 'Forbidden', date: '2026-09-26T10:00:00.000Z', description: 'No permission',
  }).expect(403);

  const invalidPhase = await request(app).post('/api/project-events').set('authorization', admin).send({
    projectId: project.body.data.id, phaseId: otherPhase.body.data.id, eventType: 'یادداشت عملیاتی', title: 'Wrong phase',
    date: '2026-09-26T10:00:00.000Z', description: 'This phase belongs elsewhere',
  }).expect(400);
  expectIssue(invalidPhase, 'body.phaseId');

  const manual = await request(app).post('/api/project-events').set('authorization', admin).send({
    projectId: project.body.data.id, personId: 'e2', phaseId: phase.body.data.id, taskId: task.body.data.id,
    eventType: 'تأیید مشتری', title: 'Customer approved milestone', date: '2026-09-26T10:00:00.000Z',
    description: 'Approval received', customerVisible: true, createdBy: 'u-org2-admin', registeredBy: 'u-org2-admin',
  }).expect(201);
  assert.equal(manual.body.data.createdBy, 'u1');
  assert.equal(manual.body.data.registeredBy, 'u1');
  assert.equal(manual.body.data.projectMemberId, projectMember.body.data.id);
  assert.equal(manual.body.data.source, 'manual');

  await request(app).patch(`/api/projects/${project.body.data.id}`).set('authorization', admin).send({ status: 'on_hold' }).expect(200);
  await request(app).patch(`/api/data/project-phases/${phase.body.data.id}`).set('authorization', admin).send({ status: 'completed' }).expect(200);
  await request(app).patch(`/api/tasks/${task.body.data.id}`).set('authorization', admin).send({ status: 'done' }).expect(200);
  await request(app).patch(`/api/data/project-members/${projectMember.body.data.id}`).set('authorization', admin).send({ status: 'inactive', leftAt: '2026-09-26T12:00:00.000Z' }).expect(200);

  const events = await request(app).get('/api/project-events').set('authorization', admin).expect(200);
  const projectEvents = events.body.data.filter((event: { projectId: string }) => event.projectId === project.body.data.id);
  for (const expectedType of ['عضویت کارمند در پروژه', 'تغییر وضعیت پروژه', 'تکمیل فاز پروژه', 'دستاورد یا نقطه عطف', 'خروج کارمند از پروژه']) {
    assert.ok(projectEvents.some((event: { eventType: string }) => event.eventType === expectedType), `Missing automatic event: ${expectedType}`);
  }
  const systemEvent = projectEvents.find((event: { eventType: string; source: string }) => event.eventType === 'تغییر وضعیت پروژه' && event.source === 'system');
  assert.ok(systemEvent);
  await request(app).patch(`/api/project-events/${systemEvent.id}`).set('authorization', admin).send({ title: 'Tampered' }).expect(400);
  await request(app).delete(`/api/project-events/${systemEvent.id}`).set('authorization', admin).expect(400);
});
