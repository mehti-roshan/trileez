import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initializeDatabase } from '../src/db/database.js';

await initializeDatabase();
const app = createApp();

async function adminAuthorization(): Promise<string> {
  const response = await request(app).post('/api/auth/login').send({ email: 'admin@trileez.ir', password: 'Admin123!' }).expect(200);
  return `Bearer ${response.body.token}`;
}

function assertValidationError(response: request.Response, path?: string): void {
  assert.equal(response.body.error, 'Validation failed');
  assert.equal(response.body.code, 'VALIDATION_ERROR');
  assert.ok(Array.isArray(response.body.issues));
  if (path) assert.ok(response.body.issues.some((item: { path: string }) => item.path === path));
}

test('body validation rejects unknown fields, invalid enums, dates, numbers, arrays and nested objects', async () => {
  const authorization = await adminAuthorization();

  assertValidationError(await request(app).post('/api/projects').set('authorization', authorization).send({ name: 'Invalid', unexpected: true }).expect(400), 'body.unexpected');
  assertValidationError(await request(app).post('/api/projects').set('authorization', authorization).send({ name: 'Invalid', status: 'not-a-status' }).expect(400), 'body.status');
  assertValidationError(await request(app).post('/api/projects').set('authorization', authorization).send({ name: 'Invalid', startDate: 'not-a-date' }).expect(400), 'body.startDate');
  assertValidationError(await request(app).post('/api/projects').set('authorization', authorization).send({ name: 'Invalid', progress: 101 }).expect(400), 'body.progress');
  assertValidationError(await request(app).post('/api/projects').set('authorization', authorization).send({ name: 'Invalid', members: 'e1' }).expect(400), 'body.members');
  assertValidationError(await request(app).post('/api/meetings').set('authorization', authorization).send({
    title: 'Invalid nested object', startAt: '2026-09-26T10:00:00.000Z', durationMinutes: 30, organizerId: 'u1',
    meetingDocument: { name: 'minutes.pdf', type: 'application/pdf', size: 10, executable: true },
  }).expect(400), 'body.meetingDocument.executable');
});

test('params and query parameters use the same validation error contract', async () => {
  const authorization = await adminAuthorization();
  assertValidationError(await request(app).get('/api/projects/not%20a%20valid%20id').set('authorization', authorization).expect(400), 'params.id');
  assertValidationError(await request(app).get('/api/files?unknownFilter=yes').set('authorization', authorization).expect(400), 'query.unknownFilter');
  assertValidationError(await request(app).get('/api/files?projectId=bad%20id').set('authorization', authorization).expect(400), 'query.projectId');
});

test('invalid and cross-workspace relationships are rejected before persistence', async () => {
  const authorization = await adminAuthorization();
  const invalid = await request(app)
    .post('/api/tasks')
    .set('authorization', authorization)
    .send({ title: 'Orphan task', projectId: 'project-does-not-exist' })
    .expect(400);
  assertValidationError(invalid, 'body.projectId');
  assert.equal(invalid.body.issues[0].location, 'relationship');

  const legacyInvalid = await request(app)
    .post('/api/data/timesheets')
    .set('authorization', authorization)
    .send({ employeeId: 'employee-does-not-exist', projectId: 'p1', taskId: 't1', date: '2026-09-26', hours: 2 })
    .expect(400);
  assertValidationError(legacyInvalid, 'body.employeeId');
});

test('mass-assignment fields are ignored and server-owned values win', async () => {
  const authorization = await adminAuthorization();
  const suppliedCreatedAt = '2000-01-01T00:00:00.000Z';

  const project = await request(app)
    .post('/api/projects')
    .set('authorization', authorization)
    .send({
      name: 'Mass assignment protected project', organizationId: 'org2', createdBy: 'u-org2-admin', createdAt: suppliedCreatedAt,
      permissions: ['hr:manage-users'], permissionOverrides: { additions: ['finance:pay'], removals: [] },
    })
    .expect(201);
  assert.equal(project.body.data.organizationId, 'org1');
  assert.equal(project.body.data.createdBy, 'u1');
  assert.notEqual(project.body.data.createdAt, suppliedCreatedAt);
  assert.equal(project.body.data.permissions, undefined);
  assert.equal(project.body.data.permissionOverrides, undefined);

  const updated = await request(app)
    .patch(`/api/projects/${project.body.data.id}`)
    .set('authorization', authorization)
    .send({ name: 'Safe update', organizationId: 'org2', createdBy: 'u-org2-admin', updatedAt: suppliedCreatedAt })
    .expect(200);
  assert.equal(updated.body.data.organizationId, 'org1');
  assert.equal(updated.body.data.createdBy, 'u1');
  assert.equal(updated.body.data.name, 'Safe update');

  await request(app).delete(`/api/projects/${project.body.data.id}`).set('authorization', authorization).expect(204);
});

test('user permissions and finalized performance fields cannot be assigned by clients', async () => {
  const authorization = await adminAuthorization();
  const unique = Date.now();
  const user = await request(app)
    .post('/api/users')
    .set('authorization', authorization)
    .send({
      name: 'Validation User', email: `validation-${unique}@example.com`, password: 'StrongPassword123!', role: 'member', title: 'Tester',
      permissions: ['hr:manage-users'], permissionOverrides: { additions: ['finance:pay'], removals: [] }, passwordHash: 'plaintext',
    })
    .expect(201);
  assert.deepEqual(user.body.data.permissionOverrides, { additions: [], removals: [] });
  assert.equal(user.body.data.permissions, undefined);
  assert.equal(user.body.data.passwordHash, undefined);

  const period = await request(app)
    .post('/api/performance/periods')
    .set('authorization', authorization)
    .send({ employeeId: 'e1', period: '2025-01-15', score: 80, status: 'open', evaluatedBy: 'u-org2-admin', finalizedAt: '2000-01-01T00:00:00.000Z' })
    .expect(201);
  assert.equal(period.body.data.status, 'finalized');
  assert.equal(period.body.data.score, 70);
  assert.equal(period.body.data.evaluatedBy, 'u1');
  assert.notEqual(period.body.data.finalizedAt, '2000-01-01T00:00:00.000Z');

  await request(app)
    .patch(`/api/performance/periods/${period.body.data.id}`)
    .set('authorization', authorization)
    .send({ score: 1, finalizedAt: '2000-01-01T00:00:00.000Z', evaluatedBy: 'u-org2-admin' })
    .expect(404);
});

test('legacy mutations enforce their resource allow-list and field types', async () => {
  const authorization = await adminAuthorization();
  assertValidationError(await request(app).post('/api/data/goals').set('authorization', authorization).send({ title: 'Goal', arbitraryAdminFlag: true }).expect(400), 'body.arbitraryAdminFlag');
  assertValidationError(await request(app).post('/api/data/goals').set('authorization', authorization).send({ title: 'Goal', progress: 'fifty' }).expect(400), 'body.progress');

  const created = await request(app)
    .post('/api/data/goals')
    .set('authorization', authorization)
    .send({ title: 'Protected legacy goal', organizationId: 'org2', createdBy: 'u-org2-admin', createdAt: '2000-01-01T00:00:00.000Z' })
    .expect(201);
  assert.equal(created.body.data.organizationId, 'org1');
  assert.equal(created.body.data.createdBy, 'u1');
  assert.notEqual(created.body.data.createdAt, '2000-01-01T00:00:00.000Z');
  await request(app).delete(`/api/data/goals/${created.body.data.id}`).set('authorization', authorization).expect(204);
});

test('generic updates cannot mass-assign protected financial or approval state', async () => {
  const authorization = await adminAuthorization();
  const bank = await request(app)
    .post('/api/data/bank-accounts')
    .set('authorization', authorization)
    .send({ label: 'Validation bank', bankName: 'Test bank', maskedNumber: '****1234', accountType: 'checking', balance: 100, status: 'active' })
    .expect(201);
  assertValidationError(await request(app)
    .patch(`/api/data/bank-accounts/${bank.body.data.id}`)
    .set('authorization', authorization)
    .send({ balance: 999_999 })
    .expect(400));

  const leave = await request(app)
    .post('/api/data/leave-requests')
    .set('authorization', authorization)
    .send({ employeeId: 'e1', startDate: '2026-09-27', endDate: '2026-09-27', days: 1, leaveType: 'annual', reason: 'Test', status: 'pending', approverId: 'u1' })
    .expect(201);
  assertValidationError(await request(app)
    .patch(`/api/data/leave-requests/${leave.body.data.id}`)
    .set('authorization', authorization)
    .send({ status: 'approved', approverId: 'u-org2-admin' })
    .expect(400));

  await request(app).delete(`/api/data/bank-accounts/${bank.body.data.id}`).set('authorization', authorization).expect(204);
  await request(app).delete(`/api/data/leave-requests/${leave.body.data.id}`).set('authorization', authorization).expect(204);
});
