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

function passwordFor(email: string): string {
  return email === 'admin@trileez.ir' || email === 'admin.org2@trileez.ir' ? 'Admin123!' : password;
}

function hasIssue(response: { body: { issues?: { path?: string; code?: string }[] } }, path: string): boolean {
  return Array.isArray(response.body.issues) && response.body.issues.some((issue) => issue.path === path);
}

async function login(email: string): Promise<{ authorization: string; user: { id: string; organizationId: string } }> {
  const response = await request(app).post('/api/auth/login').send({ email, password: passwordFor(email) }).expect(200);
  const me = await request(app).get('/api/auth/me').set('authorization', `Bearer ${response.body.token}`).expect(200);
  return { authorization: `Bearer ${response.body.token}`, user: me.body.user };
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

function deviceBody(installationId: string, deviceName: string, health = true) {
  return {
    installationId,
    deviceName,
    agentVersion: '0.2.0',
    capabilities: health
      ? ['employee-dashboard', 'time-entry', 'attendance-read', 'device-health']
      : ['employee-dashboard', 'time-entry', 'attendance-read'],
    platform: 'Win32NT',
    osDescription: 'Windows test',
  };
}

function sample(id: string, patch: Record<string, unknown> = {}) {
  return {
    clientSampleId: id,
    sampledAt: new Date(Date.now() - 60_000).toISOString(),
    cpuPercent: 12.5,
    memoryUsedBytes: 4_000_000_000,
    memoryTotalBytes: 8_000_000_000,
    diskFreeBytes: 50_000_000_000,
    diskTotalBytes: 200_000_000_000,
    osName: 'Windows',
    osVersion: '10.0.19045',
    architecture: 'X64',
    agentVersion: '0.2.0',
    online: false,
    lastHeartbeatAt: new Date(Date.now() - 30_000).toISOString(),
    collectorPhase: 'running',
    syncPhase: 'pending',
    queueDepth: 1,
    pendingBytes: 400,
    ...patch,
  };
}

test('health uploads bind the signed-in employee and keep enrollment presence authoritative', async () => {
  const admin = await login('admin@trileez.ir');
  const tag = suffix();
  const account = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'health');
  const employee = await request(app).post('/api/employees').set('authorization', admin.authorization).send({
    fullName: `Health ${tag}`, personnelCode: `HLT-${tag}`, userId: account.id, employmentStatus: 'active', compensationType: 'hourly_task',
  }).expect(201);
  const member = await login(account.email);
  const enrolled = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).send(deviceBody(`health-${tag}`, `سلامت ${tag}`)).expect(201);
  const secret = enrolled.body.credential as string;
  const deviceId = enrolled.body.data.id as string;
  await request(app).post(`/api/me/agent-devices/${deviceId}/heartbeat`).set('authorization', member.authorization).set('x-device-credential', secret).send({ agentVersion: '0.2.0' }).expect(200);
  const timeBefore = await database.forOrganization(member.user.organizationId).count('TimeEntry', { employeeId: employee.body.data.id });
  const attendanceBefore = await database.forOrganization(member.user.organizationId).count('AttendanceRecord', { employeeId: employee.body.data.id });
  const payrollBefore = await database.forOrganization(member.user.organizationId).count('PayrollRecord', { employeeId: employee.body.data.id });
  const legacyBefore = JSON.stringify((await request(app).get('/api/data/monitoring-activities').query({ limit: 100 }).set('authorization', admin.authorization).expect(200)).body);

  const uploaded = await request(app).post(`/api/me/agent-devices/${deviceId}/health-batches`).set('authorization', member.authorization).set('x-device-credential', secret).send({
    samples: [sample(`sample-${tag}`)],
  }).expect(200);

  assert.equal(uploaded.body.data.accepted, 1);
  assert.equal(JSON.stringify(uploaded.body).includes(secret), false);
  assert.equal(JSON.stringify(uploaded.body).includes('credentialHash'), false);
  const stored = await database.forOrganization(member.user.organizationId).list('AgentHealthSample', { deviceId });
  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.userId, member.user.id);
  assert.equal(stored[0]?.employeeId, employee.body.data.id);
  assert.equal(stored[0]?.cpuPercent, 12.5);
  const view = await request(app).get('/api/agent-health/summary').query({ deviceId }).set('authorization', admin.authorization).expect(200);
  const row = view.body.data[0];
  assert.equal(row.deviceId, deviceId);
  assert.equal(row.connectionStatus, 'online');
  assert.equal(row.sample.online, false);
  assert.equal(typeof row.lastSeenAt, 'string');
  assert.equal(row.sample.cpuPercent, 12.5);
  assert.equal(row.sample.architecture, 'X64');
  assert.equal(row.employeeId, employee.body.data.id);
  assert.equal(JSON.stringify(view.body).includes(secret), false);
  assert.equal(JSON.stringify(view.body).includes('credentialHash'), false);
  assert.equal(JSON.stringify(view.body).includes('fingerprint'), false);
  const owner = await request(app).get(`/api/me/agent-devices/${deviceId}/health`).set('authorization', member.authorization).set('x-device-credential', secret).expect(200);
  assert.equal(owner.body.data.sample.osName, 'Windows');
  assert.equal(owner.body.data.retentionDays, 14);
  assert.equal(await database.forOrganization(member.user.organizationId).count('TimeEntry', { employeeId: employee.body.data.id }), timeBefore);
  assert.equal(await database.forOrganization(member.user.organizationId).count('AttendanceRecord', { employeeId: employee.body.data.id }), attendanceBefore);
  assert.equal(await database.forOrganization(member.user.organizationId).count('PayrollRecord', { employeeId: employee.body.data.id }), payrollBefore);
  const legacyAfter = JSON.stringify((await request(app).get('/api/data/monitoring-activities').query({ limit: 100 }).set('authorization', admin.authorization).expect(200)).body);
  assert.equal(legacyAfter, legacyBefore);
  assert.equal(legacyAfter.includes(`sample-${tag}`), false);
  const otherOrg = await login('admin.org2@trileez.ir');
  await request(app).get('/api/agent-health/summary').query({ deviceId }).set('authorization', otherOrg.authorization).expect(404);
});

test('replaying a health sample is a duplicate and a changed payload conflicts', async () => {
  const admin = await login('admin@trileez.ir');
  const tag = suffix();
  const account = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'healthreplay');
  const member = await login(account.email);
  const enrolled = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).send(deviceBody(`replay-health-${tag}`, `بازپخش ${tag}`)).expect(201);
  const secret = enrolled.body.credential as string;
  const deviceId = enrolled.body.data.id as string;
  const body = sample(`replay-${tag}`);
  const first = await request(app).post(`/api/me/agent-devices/${deviceId}/health-batches`).set('authorization', member.authorization).set('x-device-credential', secret).send({ samples: [body] }).expect(200);
  const second = await request(app).post(`/api/me/agent-devices/${deviceId}/health-batches`).set('authorization', member.authorization).set('x-device-credential', secret).send({ samples: [body] }).expect(200);
  const third = await request(app).post(`/api/me/agent-devices/${deviceId}/health-batches`).set('authorization', member.authorization).set('x-device-credential', secret).send({
    samples: [{ ...body, cpuPercent: 40 }],
  }).expect(200);

  assert.equal(first.body.data.accepted, 1);
  assert.equal(second.body.data.duplicate, 1);
  assert.deepEqual(second.body.data.duplicateIds, [`replay-${tag}`]);
  assert.equal(third.body.data.rejected[0].code, 'HEALTH_SAMPLE_CONFLICT');
  const rows = await database.forOrganization(member.user.organizationId).list('AgentHealthSample', { clientSampleId: `replay-${tag}` });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.cpuPercent, 12.5);
});

test('health uploads reject revoked devices, secrets, oversized batches, and expired samples', async () => {
  const admin = await login('admin@trileez.ir');
  const tag = suffix();
  const account = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'healthguard');
  const otherAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'healthother');
  const customerRecord = await request(app).post('/api/data/customers').set('authorization', admin.authorization).send({
    entityType: 'company', name: `Customer ${tag}`, company: `Company ${tag}`, currency: 'IRR',
  }).expect(201);
  const customerEmail = `customer.${tag}@example.com`;
  const customerUser = await request(app).post('/api/users').set('authorization', admin.authorization).send({
    name: `Actor customer ${tag}`, email: customerEmail, password, role: 'customer', customerId: customerRecord.body.data.id, title: 'مشتری',
  }).expect(201);
  await database.forOrganization(admin.user.organizationId).update('User', customerUser.body.data.id, { mustChangePassword: false });
  const member = await login(account.email);
  const other = await login(otherAccount.email);
  const customer = await login(customerEmail);
  const plain = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).send(deviceBody(`plain-health-${tag}`, `ساده ${tag}`, false)).expect(201);
  const enrolled = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).send(deviceBody(`guard-health-${tag}`, `محافظ ${tag}`)).expect(201);
  const secret = enrolled.body.credential as string;
  const deviceId = enrolled.body.data.id as string;
  const body = { samples: [sample(`guard-${tag}`)] };

  await request(app).post(`/api/me/agent-devices/${deviceId}/health-batches`).send(body).expect(401);
  const customerDenied = await request(app).post(`/api/me/agent-devices/${deviceId}/health-batches`).set('authorization', customer.authorization).set('x-device-credential', secret).send(body).expect(403);
  assert.equal(customerDenied.body.error, 'Insufficient role');
  const capability = await request(app).post(`/api/me/agent-devices/${plain.body.data.id}/health-batches`).set('authorization', member.authorization).set('x-device-credential', plain.body.credential).send(body).expect(403);
  assert.equal(capability.body.code, 'HEALTH_CAPABILITY');
  const forged = await request(app).post(`/api/me/agent-devices/${deviceId}/health-batches`).set('authorization', member.authorization).set('x-device-credential', secret).send({
    ...body, employeeId: 'someone-else', password: 'hidden-password', token: 'hidden-token', screenshot: 'image-bytes', windowTitle: 'Secret.docx',
  }).expect(400);
  assert.equal(forged.body.code, 'VALIDATION_ERROR');
  for (const path of ['body.employeeId', 'body.password', 'body.token', 'body.screenshot', 'body.windowTitle']) assert.equal(hasIssue(forged, path), true);
  assert.equal(await database.forOrganization(member.user.organizationId).count('AgentHealthSample', { deviceId }), 0);
  const stranger = await request(app).post(`/api/me/agent-devices/${deviceId}/health-batches`).set('authorization', other.authorization).set('x-device-credential', secret).send(body).expect(404);
  assert.equal(stranger.body.error.includes(secret), false);
  await request(app).post(`/api/me/agent-devices/${deviceId}/health-batches`).set('authorization', member.authorization).set('x-device-credential', 'not-the-secret').send(body).expect(401);
  const tooMany = { samples: Array.from({ length: 21 }, (_, index) => sample(`many-${tag}-${index}`, { cpuPercent: undefined, memoryUsedBytes: undefined, memoryTotalBytes: undefined, diskFreeBytes: undefined, diskTotalBytes: undefined, osName: undefined, osVersion: undefined, architecture: undefined, lastHeartbeatAt: undefined })) };
  const oversizedCount = await request(app).post(`/api/me/agent-devices/${deviceId}/health-batches`).set('authorization', member.authorization).set('x-device-credential', secret).send(tooMany).expect(400);
  assert.equal(hasIssue(oversizedCount, 'body.samples'), true);
  const huge = await request(app).post(`/api/me/agent-devices/${deviceId}/health-batches`).set('authorization', member.authorization).set('x-device-credential', secret).send({ samples: [], padding: 'x'.repeat(70_000) }).expect(413);
  assert.equal(huge.body.code, 'PAYLOAD_TOO_LARGE');
  const stale = await request(app).post(`/api/me/agent-devices/${deviceId}/health-batches`).set('authorization', member.authorization).set('x-device-credential', secret).send({
    samples: [sample(`stale-${tag}`, { sampledAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString() }), sample(`fresh-${tag}`)],
  }).expect(200);
  assert.equal(stale.body.data.accepted, 1);
  assert.equal(stale.body.data.rejected[0].code, 'HEALTH_RETENTION');
  await database.forOrganization(member.user.organizationId).create('AgentHealthSample', {
    id: `hs-old-${tag}`,
    userId: member.user.id,
    deviceId,
    clientSampleId: `expired-${tag}`,
    sampledAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    agentVersion: '0.2.0',
    online: true,
    collectorPhase: 'running',
    syncPhase: 'pending',
    queueDepth: 0,
    pendingBytes: 0,
    fingerprint: 'old',
    createdBy: member.user.id,
  });
  await request(app).post(`/api/me/agent-devices/${deviceId}/health-batches`).set('authorization', member.authorization).set('x-device-credential', secret).send({ samples: [sample(`fresh-${tag}`)] }).expect(200);
  const remaining = await database.forOrganization(member.user.organizationId).list('AgentHealthSample', { deviceId });
  assert.equal(remaining.some((row) => row.clientSampleId === `expired-${tag}`), false);
  assert.equal(remaining.some((row) => row.clientSampleId === `fresh-${tag}`), true);

  await request(app).post(`/api/agent-devices/${deviceId}/revoke`).set('authorization', admin.authorization).send({}).expect(200);
  const revoked = await request(app).post(`/api/me/agent-devices/${deviceId}/health-batches`).set('authorization', member.authorization).set('x-device-credential', secret).send(body).expect(403);
  assert.equal(revoked.body.code, 'DEVICE_REVOKED');
  const afterRevoke = await database.forOrganization(member.user.organizationId).list('AgentHealthSample', { clientSampleId: `guard-${tag}` });
  assert.equal(afterRevoke.length, 0);
  const memberSummary = await request(app).get('/api/agent-health/summary').query({ deviceId }).set('authorization', member.authorization).expect(403);
  assert.equal(memberSummary.body.error, 'Insufficient role');
});
