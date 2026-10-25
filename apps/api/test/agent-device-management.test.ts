import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { database, initializeDatabase } from '../src/db/database.js';
import { liveConnectionLabel, projectAgentDevice } from '../../web/src/services/agentDeviceView.ts';

await initializeDatabase();
const app = createApp();
const password = 'StrongPassword123!';
const bucketMs = 300_000;

function suffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function passwordFor(email: string): string {
  return email === 'admin@trileez.ir' || email === 'admin.org2@trileez.ir' ? 'Admin123!' : password;
}

function aligned(offsetMs: number): string {
  return new Date(Math.floor((Date.now() + offsetMs) / bucketMs) * bucketMs).toISOString();
}

async function login(email: string): Promise<{ authorization: string; user: { id: string; organizationId: string; role?: string } }> {
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
  return { id: created.body.data.id as string, email, name: `Actor ${label} ${tag}` };
}

function enrollment(installationId: string, deviceName: string) {
  return {
    installationId,
    deviceName,
    agentVersion: '0.2.0',
    capabilities: ['employee-dashboard', 'time-entry', 'attendance-read', 'application-usage', 'device-health', 'screen-share', 'monitoring'],
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
    collectorPhase: 'running',
    syncPhase: 'pending',
    queueDepth: 1,
    pendingBytes: 400,
    ...patch,
  };
}

test('managers from another organization and unauthorized roles cannot view or control enrolled devices', async () => {
  const admin = await login('admin@trileez.ir');
  const foreign = await login('admin.org2@trileez.ir');
  const tag = suffix();
  const workerAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'guarded');
  const managerAccount = await createAccount(admin.authorization, admin.user.organizationId, 'manager', 'guardmgr');
  const customerRecord = await request(app).post('/api/data/customers').set('authorization', admin.authorization).send({
    entityType: 'company', name: `Customer ${tag}`, company: `Company ${tag}`, currency: 'IRR',
  }).expect(201);
  const customerEmail = `customer.${tag}@example.com`;
  const customerUser = await request(app).post('/api/users').set('authorization', admin.authorization).send({
    name: `Actor customer ${tag}`, email: customerEmail, password, role: 'customer', customerId: customerRecord.body.data.id, title: 'مشتری',
  }).expect(201);
  await database.forOrganization(admin.user.organizationId).update('User', customerUser.body.data.id, { mustChangePassword: false });
  const worker = await login(workerAccount.email);
  const manager = await login(managerAccount.email);
  const customer = await login(customerEmail);
  const deviceName = `محافظت ${tag}`;
  const created = await request(app).post('/api/me/agent-devices').set('authorization', worker.authorization).send(enrollment(`guard-mgmt-${tag}`, deviceName)).expect(201);
  const deviceId = created.body.data.id as string;
  const secret = created.body.credential as string;

  await request(app).get('/api/agent-devices').set('authorization', worker.authorization).expect(403);
  await request(app).get(`/api/agent-devices/${deviceId}`).set('authorization', worker.authorization).expect(403);
  await request(app).post(`/api/agent-devices/${deviceId}/revoke`).set('authorization', worker.authorization).send({}).expect(403);
  await request(app).post(`/api/agent-devices/${deviceId}/screen-sessions`).set('authorization', worker.authorization).send({}).expect(403);
  await request(app).get('/api/agent-devices').set('authorization', customer.authorization).expect(403);
  await request(app).get(`/api/agent-devices/${deviceId}`).set('authorization', customer.authorization).expect(403);
  await request(app).get(`/api/agent-devices/${deviceId}`).expect(401);
  await request(app).get('/api/agent-devices').set('authorization', `Bearer ${secret}`).expect(401);

  const hidden = await request(app).get(`/api/agent-devices/${deviceId}`).set('authorization', foreign.authorization).expect(404);
  assert.equal(JSON.stringify(hidden.body).includes(deviceName), false);
  assert.equal(JSON.stringify(hidden.body).includes(secret), false);
  const foreignList = await request(app).get('/api/agent-devices').query({ limit: 100 }).set('authorization', foreign.authorization).expect(200);
  assert.equal(JSON.stringify(foreignList.body).includes(deviceName), false);
  assert.equal(foreignList.body.data.some((row: { id: string }) => row.id === deviceId), false);
  const foreignRevoke = await request(app).post(`/api/agent-devices/${deviceId}/revoke`).set('authorization', foreign.authorization).send({}).expect(404);
  assert.equal(JSON.stringify(foreignRevoke.body).includes(deviceName), false);
  const visible = await request(app).get(`/api/agent-devices/${deviceId}`).set('authorization', manager.authorization).expect(200);
  assert.equal(visible.body.data.deviceName, deviceName);
  assert.equal(visible.body.data.userId, worker.user.id);
  assert.equal(JSON.stringify(visible.body).includes(secret), false);
  assert.equal(JSON.stringify(visible.body).includes('credentialHash'), false);
});

test('enrollment, telemetry, stale heartbeats, and support sessions stay scoped through the management view', async () => {
  const admin = await login('admin@trileez.ir');
  const foreign = await login('admin.org2@trileez.ir');
  const tag = suffix();
  const workerAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'owner');
  const managerAccount = await createAccount(admin.authorization, admin.user.organizationId, 'manager', 'support');
  const otherManagerAccount = await createAccount(admin.authorization, admin.user.organizationId, 'manager', 'other');
  const employee = await request(app).post('/api/employees').set('authorization', admin.authorization).send({
    fullName: `Owner ${tag}`, personnelCode: `OWN-${tag}`, userId: workerAccount.id, employmentStatus: 'active', compensationType: 'hourly_task',
  }).expect(201);
  const worker = await login(workerAccount.email);
  const manager = await login(managerAccount.email);
  const otherManager = await login(otherManagerAccount.email);
  const deviceName = `لپ‌تاپ ${tag}`;
  const enrolled = await request(app).post('/api/me/agent-devices').set('authorization', worker.authorization).send(enrollment(`desk-${tag}`, deviceName)).expect(201);
  const secret = enrolled.body.credential as string;
  const deviceId = enrolled.body.data.id as string;
  const employeeId = employee.body.data.id as string;
  const timeBefore = await database.forOrganization(worker.user.organizationId).count('TimeEntry', { employeeId });
  const attendanceBefore = await database.forOrganization(worker.user.organizationId).count('AttendanceRecord', { employeeId });
  const payrollBefore = await database.forOrganization(worker.user.organizationId).count('PayrollRecord', { employeeId });

  await request(app).post(`/api/me/agent-devices/${deviceId}/heartbeat`).set('authorization', worker.authorization).set('x-device-credential', secret).send({ agentVersion: '0.2.0' }).expect(200);
  await request(app).put('/api/agent-usage/policy').set('authorization', admin.authorization).send({
    enabled: true, employeeMayPause: true, idleThresholdSeconds: 60, retentionDays: 30,
  }).expect(200);
  const processName = `Word${tag.replace(/[^A-Za-z0-9]/g, '')}`;
  const windowTitle = `SecretTitle${tag}`;
  const usage = await request(app).post(`/api/me/agent-devices/${deviceId}/usage-batches`).set('authorization', worker.authorization).set('x-device-credential', secret).send({
    session: { clientSessionId: `usage-${tag}`, startedAt: aligned(-60_000) },
    intervals: [{ clientIntervalId: `interval-${tag}`, processName, displayName: windowTitle, startedAt: aligned(-120_000), durationMs: 10_000 }],
  }).expect(200);
  assert.equal(usage.body.data.accepted, 1);
  const health = await request(app).post(`/api/me/agent-devices/${deviceId}/health-batches`).set('authorization', worker.authorization).set('x-device-credential', secret).send({
    samples: [sample(`health-${tag}`, { online: false, cpuPercent: 12.5 })],
  }).expect(200);
  assert.equal(health.body.data.accepted, 1);

  const fresh = await request(app).get(`/api/agent-devices/${deviceId}`).set('authorization', manager.authorization).expect(200);
  const freshView = projectAgentDevice(fresh.body.data);
  assert.equal(fresh.body.data.deviceName, deviceName);
  assert.equal(fresh.body.data.employeeName, `Owner ${tag}`);
  assert.equal(fresh.body.data.userName, workerAccount.name);
  assert.equal(fresh.body.data.employeeId, employeeId);
  assert.equal(fresh.body.data.status, 'active');
  assert.equal(fresh.body.data.agentVersion, '0.2.0');
  assert.deepEqual(fresh.body.data.capabilities, ['employee-dashboard', 'time-entry', 'attendance-read', 'application-usage', 'device-health', 'screen-share']);
  assert.equal(fresh.body.data.connectionStatus, 'online');
  assert.equal(fresh.body.data.connectionVerified, true);
  assert.equal(typeof fresh.body.data.lastSeenAt, 'string');
  assert.equal(fresh.body.data.telemetry.health.cpuPercent, 12.5);
  assert.equal(Object.hasOwn(fresh.body.data.telemetry.health, 'online'), false);
  assert.equal(typeof fresh.body.data.telemetry.lastSuccessfulSyncAt, 'string');
  assert.equal(fresh.body.data.telemetry.lastSuccessfulSyncAt, fresh.body.data.telemetry.healthLastSuccessfulUploadAt);
  assert.equal(typeof fresh.body.data.telemetry.usageLastSuccessfulUploadAt, 'string');
  assert.equal(fresh.body.data.telemetry.usageProcesses[0].processName, processName);
  assert.equal(fresh.body.data.telemetry.usageProcesses[0].durationMs, 10_000);
  assert.equal(fresh.body.data.screen.access, 'none');
  assert.equal(freshView.connectionVerified, true);
  assert.equal(liveConnectionLabel(freshView.connectionVerified), 'آنلاین');
  assert.equal(freshView.canRequestSupport, true);
  assert.equal(JSON.stringify(fresh.body).includes(windowTitle), false);
  assert.equal(JSON.stringify(fresh.body).includes(secret), false);
  assert.equal(JSON.stringify(fresh.body).includes('credentialHash'), false);
  assert.equal(JSON.stringify(fresh.body).includes('fingerprint'), false);
  assert.equal(JSON.stringify(fresh.body).includes('displayName'), false);
  assert.equal(JSON.stringify(freshView).includes(windowTitle), false);

  const staleAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await database.forOrganization(worker.user.organizationId).update('AgentEnrollment', deviceId, { lastSeenAt: staleAt, connectionStatus: 'online' });
  await request(app).post(`/api/me/agent-devices/${deviceId}/health-batches`).set('authorization', worker.authorization).set('x-device-credential', secret).send({
    samples: [sample(`health-stale-${tag}`, { online: true, cpuPercent: 33, syncPhase: 'retrying', sampledAt: new Date(Date.now() - 30_000).toISOString() })],
  }).expect(200);
  const stale = await request(app).get(`/api/agent-devices/${deviceId}`).set('authorization', manager.authorization).expect(200);
  const staleView = projectAgentDevice(stale.body.data);
  assert.equal(stale.body.data.connectionStatus, 'offline');
  assert.equal(stale.body.data.connectionVerified, false);
  assert.ok(Date.now() - Date.parse(stale.body.data.lastSeenAt) > 3 * 60 * 1000);
  assert.equal(stale.body.data.notices.some((notice: { code: string }) => notice.code === 'HEARTBEAT_STALE'), true);
  assert.equal(stale.body.data.notices.some((notice: { code: string }) => notice.code === 'HEALTH_SYNC_RETRYING'), true);
  assert.equal(stale.body.data.telemetry.health.cpuPercent, 33);
  assert.equal(Object.hasOwn(stale.body.data.telemetry.health, 'online'), false);
  assert.equal(staleView.connectionStatus, 'offline');
  assert.equal(staleView.connectionVerified, false);
  assert.equal(liveConnectionLabel(staleView.connectionVerified), 'آفلاین');
  assert.equal(staleView.lastSeenAt, stale.body.data.lastSeenAt);

  const note = `Assist ${tag}`;
  const createdSession = await request(app).post(`/api/agent-devices/${deviceId}/screen-sessions`).set('authorization', manager.authorization).send({ requestNote: note }).expect(201);
  const sessionId = createdSession.body.data.id as string;
  const grantId = typeof createdSession.body.data.controlGrantId === 'string' ? createdSession.body.data.controlGrantId : '';
  const ownerView = await request(app).get(`/api/agent-devices/${deviceId}`).set('authorization', manager.authorization).expect(200);
  const ownerProjected = projectAgentDevice(ownerView.body.data);
  assert.equal(ownerView.body.data.screen.access, 'own');
  assert.equal(ownerView.body.data.screen.session.id, sessionId);
  assert.equal(ownerView.body.data.screen.session.state, 'requested');
  assert.equal(ownerView.body.data.screen.session.requestNote, note);
  assert.equal(Object.hasOwn(ownerView.body.data.screen.session, 'controlGrantId'), false);
  assert.equal(Object.hasOwn(ownerView.body.data.screen.session, 'relay'), false);
  assert.equal(JSON.stringify(ownerView.body).includes('controlGrantId'), false);
  if (grantId) assert.equal(JSON.stringify(ownerView.body).includes(grantId), false);
  assert.equal(ownerProjected.screenSession?.id, sessionId);
  assert.equal(ownerProjected.screenSession?.state, 'requested');
  assert.equal(ownerProjected.canRequestSupport, false);
  assert.equal(JSON.stringify(ownerProjected).includes('controlGrantId'), false);
  const listed = await request(app).get('/api/agent-devices').query({ limit: 100 }).set('authorization', manager.authorization).expect(200);
  const listedRow = listed.body.data.find((row: { id: string }) => row.id === deviceId);
  assert.equal(listedRow.screen.session.id, sessionId);
  assert.equal(projectAgentDevice(listedRow).screenSession?.state, 'requested');

  const hiddenSession = await request(app).get(`/api/agent-devices/${deviceId}`).set('authorization', otherManager.authorization).expect(200);
  assert.equal(hiddenSession.body.data.screen.access, 'other');
  assert.equal(hiddenSession.body.data.screen.session, null);
  assert.equal(JSON.stringify(hiddenSession.body).includes(sessionId), false);
  assert.equal(JSON.stringify(hiddenSession.body).includes(note), false);
  assert.equal(projectAgentDevice(hiddenSession.body.data).screenSession, null);
  assert.equal(projectAgentDevice(hiddenSession.body.data).canRequestSupport, false);
  const forbiddenSession = await request(app).get(`/api/agent-screen-sessions/${sessionId}`).set('authorization', otherManager.authorization).expect(403);
  assert.equal(forbiddenSession.body.code, 'SCREEN_VIEW_FORBIDDEN');
  assert.equal(JSON.stringify(forbiddenSession.body).includes(note), false);
  const ownSession = await request(app).get(`/api/agent-screen-sessions/${sessionId}`).set('authorization', manager.authorization).expect(200);
  assert.equal(ownSession.body.data.state, 'requested');
  const foreignSession = await request(app).get(`/api/agent-screen-sessions/${sessionId}`).set('authorization', foreign.authorization).expect(404);
  assert.equal(JSON.stringify(foreignSession.body).includes(note), false);
  assert.equal(JSON.stringify(foreignSession.body).includes(deviceName), false);

  const revoked = await request(app).post(`/api/agent-devices/${deviceId}/revoke`).set('authorization', manager.authorization).send({}).expect(200);
  assert.equal(revoked.body.data.status, 'revoked');
  const after = await request(app).get(`/api/agent-devices/${deviceId}`).set('authorization', manager.authorization).expect(200);
  const afterView = projectAgentDevice(after.body.data);
  assert.equal(after.body.data.status, 'revoked');
  assert.equal(after.body.data.connectionStatus, 'offline');
  assert.equal(after.body.data.connectionVerified, false);
  assert.equal(after.body.data.screen.access, 'none');
  assert.equal(after.body.data.notices.some((notice: { code: string }) => notice.code === 'DEVICE_REVOKED'), true);
  assert.equal(afterView.canRevoke, false);
  assert.equal(afterView.canRequestSupport, false);
  assert.equal(afterView.screenSession, null);
  const storedSession = await database.forOrganization(worker.user.organizationId).get('AgentScreenSession', sessionId);
  assert.equal(storedSession?.state, 'ended');
  const rejectedBeat = await request(app).post(`/api/me/agent-devices/${deviceId}/heartbeat`).set('authorization', worker.authorization).set('x-device-credential', secret).send({}).expect(403);
  assert.equal(rejectedBeat.body.code, 'DEVICE_REVOKED');
  const rejectedSession = await request(app).post(`/api/agent-devices/${deviceId}/screen-sessions`).set('authorization', manager.authorization).send({}).expect(403);
  assert.equal(rejectedSession.body.code, 'DEVICE_REVOKED');
  const legacy = await request(app).get('/api/data/devices').query({ limit: 100 }).set('authorization', admin.authorization).expect(200);
  assert.equal(JSON.stringify(legacy.body).includes(deviceName), false);
  assert.equal(await database.forOrganization(worker.user.organizationId).count('TimeEntry', { employeeId }), timeBefore);
  assert.equal(await database.forOrganization(worker.user.organizationId).count('AttendanceRecord', { employeeId }), attendanceBefore);
  assert.equal(await database.forOrganization(worker.user.organizationId).count('PayrollRecord', { employeeId }), payrollBefore);
  assert.equal(JSON.stringify(after.body).includes(secret), false);
  assert.equal(JSON.stringify(after.body).includes(windowTitle), false);
});
