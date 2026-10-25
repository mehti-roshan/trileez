import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { database, initializeDatabase } from '../src/db/database.js';

await initializeDatabase();
const app = createApp();

async function login(email = 'admin@trileez.ir', password = 'Admin123!', requestId?: string) {
  const call = request(app).post('/api/auth/login').set('user-agent', 'Trilez-Audit-Test/1.0');
  if (requestId) call.set('x-request-id', requestId);
  return call.send({ email, password }).expect(200);
}

test('authentication audits include centralized request context and are organization scoped', async () => {
  const requestId = `audit-login-${Date.now()}`;
  const admin = await login('admin@trileez.ir', 'Admin123!', requestId);
  assert.equal(admin.headers['x-request-id'], requestId);
  const authorization = `Bearer ${admin.body.token}`;
  const result = await request(app).get('/api/audit').query({ action: 'auth.login_succeeded', requestId }).set('authorization', authorization).expect(200);
  assert.equal(result.body.data.length, 1);
  const row = result.body.data[0];
  assert.equal(row.organizationId, 'org1');
  assert.equal(row.actorId, 'u1');
  assert.equal(row.entityType, 'User');
  assert.equal(row.entityId, 'u1');
  assert.equal(row.requestId, requestId);
  assert.equal(row.userAgent, 'Trilez-Audit-Test/1.0');
  assert.ok(row.ip);
  assert.ok(!Number.isNaN(Date.parse(row.timestamp)));

  const foreign = await login('admin.org2@trileez.ir');
  const hidden = await request(app).get('/api/audit').query({ requestId }).set('authorization', `Bearer ${foreign.body.token}`).expect(200);
  assert.equal(hidden.body.data.length, 0);
});

test('employee and role changes retain redacted before and after snapshots', async () => {
  const admin = await login();
  const authorization = `Bearer ${admin.body.token}`;
  const suffix = Date.now();
  const user = await request(app).post('/api/users').set('authorization', authorization).send({
    name: 'Audit Role User', email: `audit-role-${suffix}@example.com`, password: 'Temporary#Secure123', role: 'member', title: 'Audited user',
  }).expect(201);
  await request(app).patch(`/api/users/${user.body.data.id}`).set('authorization', authorization).send({ role: 'manager' }).expect(200);
  const roleAudits = await request(app).get('/api/audit').query({ entityType: 'User', entityId: user.body.data.id }).set('authorization', authorization).expect(200);
  const created = roleAudits.body.data.find((row: { action: string }) => row.action === 'user.created_with_temporary_password');
  const roleChanged = roleAudits.body.data.find((row: { action: string }) => row.action === 'user.role_changed');
  assert.equal(created.after.passwordHash, '[REDACTED]');
  assert.equal(roleChanged.before.role, 'member');
  assert.equal(roleChanged.after.role, 'manager');

  const employee = await request(app).post('/api/employees').set('authorization', authorization).send({
    fullName: 'کارمند ممیزی', personnelCode: `AUD-${suffix}`, jobTitle: 'کارشناس', department: 'کنترل', compensationType: 'full_time_attendance',
  }).expect(201);
  await request(app).patch(`/api/employees/${employee.body.data.id}`).set('authorization', authorization).send({ jobTitle: 'کارشناس ارشد' }).expect(200);
  const employeeAudits = await request(app).get('/api/audit').query({ entityType: 'Employee', entityId: employee.body.data.id }).set('authorization', authorization).expect(200);
  const update = employeeAudits.body.data.find((row: { action: string }) => row.action === 'employees.updated');
  assert.equal(update.before.jobTitle, 'کارشناس');
  assert.equal(update.after.jobTitle, 'کارشناس ارشد');
  assert.ok(update.metadata.changedFields.includes('jobTitle'));
});

test('financial, performance, document access, and customer visibility actions are audited', async () => {
  const admin = await login();
  const authorization = `Bearer ${admin.body.token}`;
  const suffix = Date.now();
  const customer = await request(app).post('/api/data/customers').set('authorization', authorization).send({
    id: `audit-customer-${suffix}`, name: 'مشتری ممیزی', company: 'شرکت ممیزی', currency: 'IRR', code: `AUD-C-${suffix}`, entityType: 'company', status: 'active', phone: '02100000000',
  }).expect(201);
  await request(app).patch(`/api/data/customers/${customer.body.data.id}`).set('authorization', authorization).send({ status: 'inactive' }).expect(200);
  const customerAudits = await request(app).get('/api/audit').query({ entityType: 'Customer', entityId: customer.body.data.id }).set('authorization', authorization).expect(200);
  const customerUpdate = customerAudits.body.data.find((row: { action: string }) => row.action === 'customers.updated');
  assert.equal(customerUpdate.before.status, 'active');
  assert.equal(customerUpdate.after.status, 'inactive');

  const reason = `Audit performance ${suffix}`;
  const performance = await request(app).post('/api/performance/events').set('authorization', authorization).send({ employeeId: 'e1', reason, points: 3, date: '2026-09-26' }).expect(201);
  const performanceAudits = await request(app).get('/api/audit').query({ entityType: 'PerformanceEvent', entityId: performance.body.data.id }).set('authorization', authorization).expect(200);
  assert.equal(performanceAudits.body.data[0].reason, reason);

  const uploaded = await request(app).post('/api/files').set('authorization', authorization)
    .field('projectId', 'p1').attach('file', Buffer.from('audited body'), { filename: 'audited.txt', contentType: 'text/plain' }).expect(201);
  await request(app).patch(`/api/files/${uploaded.body.data.id}`).set('authorization', authorization).send({ customerVisible: true }).expect(200);
  await request(app).get(`/api/files/${uploaded.body.data.id}/content`).set('authorization', authorization).expect(200);
  const fileAudits = await request(app).get('/api/audit').query({ entityType: 'FileRecord', entityId: uploaded.body.data.id }).set('authorization', authorization).expect(200);
  const visibility = fileAudits.body.data.find((row: { action: string }) => row.action === 'file.customer_visibility_changed');
  assert.equal(visibility.before.customerVisible, false);
  assert.equal(visibility.after.customerVisible, true);
  assert.equal(visibility.metadata.customerVisibilityChanged, true);
  assert.ok(fileAudits.body.data.some((row: { action: string }) => row.action === 'file.content_accessed'));
});

test('audit records are append-only and ordinary users cannot forge or read them', async () => {
  const admin = await login();
  const authorization = `Bearer ${admin.body.token}`;
  const list = await request(app).get('/api/audit').set('authorization', authorization).expect(200);
  assert.ok(list.body.data.length > 0);
  const auditId = list.body.data[0].id;
  await assert.rejects(() => database.forOrganization('org1').update('AuditLog', auditId, { action: 'forged' }), /append-only/);
  await assert.rejects(() => database.forOrganization('org1').remove('AuditLog', auditId), /append-only/);
  const unchanged = await database.forOrganization('org1').get('AuditLog', auditId);
  assert.notEqual(unchanged?.action, 'forged');

  const member = await login('member@trileez.ir', 'Manager123!');
  await request(app).get('/api/audit').set('authorization', `Bearer ${member.body.token}`).expect(403);
  await request(app).post('/api/data/activity-logs').set('authorization', authorization).send({ action: 'forged', description: 'client supplied audit' }).expect(403);
  await request(app).post('/api/audit').set('authorization', authorization).send({ action: 'forged' }).expect(404);
  await request(app).patch(`/api/audit/${auditId}`).set('authorization', authorization).send({ action: 'forged' }).expect(404);
  await request(app).delete(`/api/audit/${auditId}`).set('authorization', authorization).expect(404);
});
