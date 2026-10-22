import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { database, initializeDatabase } from '../src/db/database.js';

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

function hasIssue(response: { body: { issues?: { path?: string }[] } }, path: string): boolean {
  return Array.isArray(response.body.issues) && response.body.issues.some((issue) => issue.path === path);
}

function aligned(offsetMs: number): string {
  const stamp = Math.floor((Date.now() + offsetMs) / bucketMs) * bucketMs;
  return new Date(stamp).toISOString();
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

function deviceBody(installationId: string, deviceName: string, usage = true) {
  return {
    installationId,
    deviceName,
    agentVersion: '0.2.0',
    capabilities: usage
      ? ['employee-dashboard', 'time-entry', 'attendance-read', 'application-usage']
      : ['employee-dashboard', 'time-entry', 'attendance-read'],
    platform: 'Win32NT',
    osDescription: 'Windows test',
  };
}

let tail: Promise<void> = Promise.resolve();
function exclusive(name: string, fn: () => Promise<void>) {
  test(name, async () => {
    const previous = tail;
    let release = () => {};
    tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { await fn(); } finally { release(); }
  });
}

function batch(sessionId: string, intervals: Record<string, unknown>[], endedAt?: string) {
  return {
    session: {
      clientSessionId: sessionId,
      startedAt: aligned(-60_000),
      ...(endedAt ? { endedAt, endReason: 'stop' } : {}),
    },
    intervals,
  };
}

exclusive('usage uploads bind the authenticated employee and aggregate by application and interval', async () => {
  const admin = await login('admin@trileez.ir');
  const tag = suffix();
  const account = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'usage');
  const employee = await request(app).post('/api/employees').set('authorization', admin.authorization).send({
    fullName: `Usage ${tag}`, personnelCode: `USE-${tag}`, userId: account.id, employmentStatus: 'active', compensationType: 'hourly_task',
  }).expect(201);
  const member = await login(account.email);
  await request(app).put('/api/agent-usage/policy').set('authorization', admin.authorization).send({
    enabled: true, employeeMayPause: true, idleThresholdSeconds: 60, retentionDays: 30,
  }).expect(200);
  const enrolled = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).send(deviceBody(`usage-${tag}`, `لپ‌تاپ ${tag}`)).expect(201);
  const secret = enrolled.body.credential as string;
  const deviceId = enrolled.body.data.id as string;
  const word = `Word${tag.replace(/[^A-Za-z0-9]/g, '')}`;
  const excel = `Excel${tag.replace(/[^A-Za-z0-9]/g, '')}`;
  const sessionId = `session-${tag}`;
  const timeBefore = await database.forOrganization(member.user.organizationId).count('TimeEntry', { employeeId: employee.body.data.id });
  const attendanceBefore = await database.forOrganization(member.user.organizationId).count('AttendanceRecord', { employeeId: employee.body.data.id });
  const payrollBefore = await database.forOrganization(member.user.organizationId).count('PayrollRecord', { employeeId: employee.body.data.id });

  const uploaded = await request(app).post(`/api/me/agent-devices/${deviceId}/usage-batches`).set('authorization', member.authorization).set('x-device-credential', secret).send(batch(sessionId, [
    { clientIntervalId: `interval-word-${tag}`, processName: word, displayName: 'Microsoft Word', startedAt: aligned(-120_000), durationMs: 10_000 },
    { clientIntervalId: `interval-excel-${tag}`, processName: excel, displayName: 'Microsoft Excel', startedAt: aligned(-420_000), durationMs: 5_000 },
  ])).expect(200);

  assert.equal(uploaded.body.data.accepted, 2);
  assert.equal(JSON.stringify(uploaded.body).includes(secret), false);
  assert.equal(JSON.stringify(uploaded.body).includes('credentialHash'), false);
  const stored = await database.forOrganization(member.user.organizationId).list('AgentUsageInterval', { deviceId });
  assert.equal(stored.length, 2);
  assert.equal(stored.every((row) => row.userId === member.user.id && row.employeeId === employee.body.data.id), true);
  const summary = await request(app).get('/api/me/agent-usage/summary').query({ from: aligned(-86_400_000), to: new Date(Date.now() + 60_000).toISOString() }).set('authorization', member.authorization).expect(200);
  const names = summary.body.data.map((row: { processName: string; durationMs: number }) => `${row.processName}:${row.durationMs}`);
  assert.deepEqual(names.sort(), [`${excel}:5000`, `${word}:10000`]);
  assert.equal(summary.body.sessions.some((row: { clientSessionId: string }) => row.clientSessionId === sessionId), true);
  assert.equal(typeof summary.body.health.lastSuccessfulUploadAt, 'string');
  assert.equal(await database.forOrganization(member.user.organizationId).count('TimeEntry', { employeeId: employee.body.data.id }), timeBefore);
  assert.equal(await database.forOrganization(member.user.organizationId).count('AttendanceRecord', { employeeId: employee.body.data.id }), attendanceBefore);
  assert.equal(await database.forOrganization(member.user.organizationId).count('PayrollRecord', { employeeId: employee.body.data.id }), payrollBefore);
  const legacy = await request(app).get('/api/data/monitoring-activities').query({ limit: 100 }).set('authorization', admin.authorization).expect(200);
  assert.equal(JSON.stringify(legacy.body).includes(word), false);
});

exclusive('replaying an interval does not double-count and a higher cumulative duration replaces it once', async () => {
  const admin = await login('admin@trileez.ir');
  const tag = suffix();
  const account = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'replay');
  const member = await login(account.email);
  await request(app).put('/api/agent-usage/policy').set('authorization', admin.authorization).send({
    enabled: true, employeeMayPause: true, idleThresholdSeconds: 60, retentionDays: 30,
  }).expect(200);
  const enrolled = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).send(deviceBody(`replay-${tag}`, `بازپخش ${tag}`)).expect(201);
  const secret = enrolled.body.credential as string;
  const deviceId = enrolled.body.data.id as string;
  const processName = `Replay${tag.replace(/[^A-Za-z0-9]/g, '')}`;
  const interval = { clientIntervalId: `replay-interval-${tag}`, processName, displayName: 'Replay', startedAt: aligned(-120_000), durationMs: 10_000 };
  const first = await request(app).post(`/api/me/agent-devices/${deviceId}/usage-batches`).set('authorization', member.authorization).set('x-device-credential', secret).send(batch(`replay-session-${tag}`, [interval])).expect(200);
  const second = await request(app).post(`/api/me/agent-devices/${deviceId}/usage-batches`).set('authorization', member.authorization).set('x-device-credential', secret).send(batch(`replay-session-${tag}`, [interval])).expect(200);
  const third = await request(app).post(`/api/me/agent-devices/${deviceId}/usage-batches`).set('authorization', member.authorization).set('x-device-credential', secret).send(batch(`replay-session-${tag}`, [{ ...interval, durationMs: 15_000 }])).expect(200);

  assert.equal(first.body.data.accepted, 1);
  assert.equal(second.body.data.duplicate, 1);
  assert.equal(third.body.data.updated, 1);
  const rows = await database.forOrganization(member.user.organizationId).list('AgentUsageInterval', { clientIntervalId: interval.clientIntervalId });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.durationMs, 15_000);
});

exclusive('unauthorized callers, forged ownership, window titles, and oversized batches are rejected', async () => {
  const admin = await login('admin@trileez.ir');
  const tag = suffix();
  const account = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'guardusage');
  const customerRecord = await request(app).post('/api/data/customers').set('authorization', admin.authorization).send({
    entityType: 'company', name: `Customer ${tag}`, company: `Company ${tag}`, currency: 'IRR',
  }).expect(201);
  const customerEmail = `customer.${tag}@example.com`;
  const customerUser = await request(app).post('/api/users').set('authorization', admin.authorization).send({
    name: `Actor customer ${tag}`, email: customerEmail, password, role: 'customer', customerId: customerRecord.body.data.id, title: 'مشتری',
  }).expect(201);
  await database.forOrganization(admin.user.organizationId).update('User', customerUser.body.data.id, { mustChangePassword: false });
  const member = await login(account.email);
  const customer = await login(customerEmail);
  await request(app).put('/api/agent-usage/policy').set('authorization', admin.authorization).send({
    enabled: true, employeeMayPause: true, idleThresholdSeconds: 60, retentionDays: 30,
  }).expect(200);
  const plain = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).send(deviceBody(`plain-${tag}`, `ساده ${tag}`, false)).expect(201);
  const enrolled = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).send(deviceBody(`guard-usage-${tag}`, `محافظ ${tag}`)).expect(201);
  const secret = enrolled.body.credential as string;
  const deviceId = enrolled.body.data.id as string;
  const body = batch(`guard-session-${tag}`, [
    { clientIntervalId: `guard-interval-${tag}`, processName: 'NOTEPAD', displayName: 'Notepad', startedAt: aligned(-120_000), durationMs: 1_000 },
  ]);

  await request(app).post(`/api/me/agent-devices/${deviceId}/usage-batches`).send(body).expect(401);
  const customerDenied = await request(app).post(`/api/me/agent-devices/${deviceId}/usage-batches`).set('authorization', customer.authorization).set('x-device-credential', secret).send(body).expect(403);
  assert.equal(customerDenied.body.error, 'Insufficient role');
  const capability = await request(app).post(`/api/me/agent-devices/${plain.body.data.id}/usage-batches`).set('authorization', member.authorization).set('x-device-credential', plain.body.credential).send(body).expect(403);
  assert.equal(capability.body.code, 'USAGE_CAPABILITY');
  const forged = await request(app).post(`/api/me/agent-devices/${deviceId}/usage-batches`).set('authorization', member.authorization).set('x-device-credential', secret).send({
    ...body, employeeId: 'someone-else', userId: 'someone-else', organizationId: 'other-org',
  }).expect(400);
  assert.equal(forged.body.code, 'VALIDATION_ERROR');
  for (const path of ['body.employeeId', 'body.userId', 'body.organizationId']) assert.equal(hasIssue(forged, path), true);
  const titled = await request(app).post(`/api/me/agent-devices/${deviceId}/usage-batches`).set('authorization', member.authorization).set('x-device-credential', secret).send({
    session: body.session,
    intervals: [{ ...body.intervals[0], windowTitle: 'secret.docx', keystrokes: 'password', clipboard: 'secret', path: 'C:\\secret.txt' }],
  }).expect(400);
  for (const path of ['body.intervals.0.windowTitle', 'body.intervals.0.keystrokes', 'body.intervals.0.clipboard', 'body.intervals.0.path']) assert.equal(hasIssue(titled, path), true);
  const slashed = await request(app).post(`/api/me/agent-devices/${deviceId}/usage-batches`).set('authorization', member.authorization).set('x-device-credential', secret).send({
    session: body.session,
    intervals: [{ ...body.intervals[0], clientIntervalId: `slash-${tag}`, processName: 'C:\\Windows\\notepad.exe' }],
  }).expect(400);
  assert.equal(hasIssue(slashed, 'body.intervals.0.processName'), true);
  const oversized = await request(app).post(`/api/me/agent-devices/${deviceId}/usage-batches`).set('authorization', member.authorization).set('x-device-credential', secret).send({
    session: body.session,
    intervals: Array.from({ length: 41 }, (_, index) => ({ clientIntervalId: `bulk-${tag}-${index}`, processName: 'NOTEPAD', startedAt: aligned(-120_000), durationMs: 1_000 })),
  }).expect(400);
  assert.equal(hasIssue(oversized, 'body.intervals'), true);
  await request(app).get('/api/me/agent-usage/summary').set('authorization', `Bearer ${secret}`).expect(401);
  assert.equal(await database.forOrganization(member.user.organizationId).count('AgentUsageInterval', { deviceId }), 0);
});

exclusive('revocation, disablement, pause, and retention bound what is stored', async () => {
  const admin = await login('admin@trileez.ir');
  const tag = suffix();
  const managerAccount = await createAccount(admin.authorization, admin.user.organizationId, 'manager', 'usagecontrol');
  const account = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'usagelimit');
  const manager = await login(managerAccount.email);
  const member = await login(account.email);
  await request(app).put('/api/agent-usage/policy').set('authorization', manager.authorization).send({
    enabled: true, employeeMayPause: true, idleThresholdSeconds: 60, retentionDays: 30,
  }).expect(200);
  const enrolled = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).send(deviceBody(`limit-${tag}`, `محدود ${tag}`)).expect(201);
  const secret = enrolled.body.credential as string;
  const deviceId = enrolled.body.data.id as string;
  const earlyId = `early-${tag}`;
  const lateId = `late-${tag}`;
  const oldId = `old-${tag}`;
  await request(app).post(`/api/me/agent-devices/${deviceId}/usage-batches`).set('authorization', member.authorization).set('x-device-credential', secret).send(batch(`limit-session-${tag}`, [
    { clientIntervalId: earlyId, processName: 'EARLY', startedAt: aligned(-180_000), durationMs: 2_000 },
    { clientIntervalId: oldId, processName: 'ARCHIVE', startedAt: aligned(-10 * 86_400_000), durationMs: 2_000 },
  ])).expect(200);

  await request(app).put('/api/agent-usage/policy').set('authorization', manager.authorization).send({
    enabled: false, employeeMayPause: true, idleThresholdSeconds: 60, retentionDays: 30,
  }).expect(200);
  const beforeRejection = await request(app).get('/api/me/agent-usage/summary').set('authorization', member.authorization).expect(200);
  const syncedAt = beforeRejection.body.health.lastSuccessfulUploadAt;
  assert.equal(typeof syncedAt, 'string');
  const disabled = await request(app).post(`/api/me/agent-devices/${deviceId}/usage-batches`).set('authorization', member.authorization).set('x-device-credential', secret).send(batch(`limit-session-${tag}`, [
    { clientIntervalId: lateId, processName: 'LATE', startedAt: new Date(Date.now() + 5_000).toISOString(), durationMs: 2_000 },
  ])).expect(200);
  assert.equal(disabled.body.data.rejected[0].code, 'USAGE_DISABLED');
  assert.equal(disabled.body.data.accepted, 0);
  assert.equal(disabled.body.data.lastSuccessfulUploadAt, syncedAt);
  const afterRejection = await request(app).get('/api/me/agent-usage/summary').set('authorization', member.authorization).expect(200);
  assert.equal(afterRejection.body.health.lastSuccessfulUploadAt, syncedAt);
  assert.equal(await database.forOrganization(member.user.organizationId).count('AgentUsageInterval', { clientIntervalId: lateId }), 0);
  assert.equal(await database.forOrganization(member.user.organizationId).count('AgentUsageInterval', { clientIntervalId: earlyId }), 1);
  assert.equal(await database.forOrganization(member.user.organizationId).count('AgentUsageInterval', { clientIntervalId: oldId }), 1);

  await request(app).put('/api/agent-usage/policy').set('authorization', manager.authorization).send({
    enabled: true, employeeMayPause: true, idleThresholdSeconds: 60, retentionDays: 30,
  }).expect(200);
  const paused = await request(app).post(`/api/me/agent-devices/${deviceId}/usage-preference`).set('authorization', member.authorization).set('x-device-credential', secret).send({ paused: true }).expect(200);
  assert.equal(paused.body.data.paused, true);
  const pausedUpload = await request(app).post(`/api/me/agent-devices/${deviceId}/usage-batches`).set('authorization', member.authorization).set('x-device-credential', secret).send(batch(`paused-session-${tag}`, [
    { clientIntervalId: `paused-${tag}`, processName: 'PAUSED', startedAt: new Date().toISOString(), durationMs: 1_000 },
  ])).expect(200);
  assert.equal(pausedUpload.body.data.rejected[0].code, 'USAGE_PAUSED');
  await request(app).put('/api/agent-usage/policy').set('authorization', manager.authorization).send({
    enabled: true, employeeMayPause: false, idleThresholdSeconds: 60, retentionDays: 7,
  }).expect(200);
  const pauseDenied = await request(app).post(`/api/me/agent-devices/${deviceId}/usage-preference`).set('authorization', member.authorization).set('x-device-credential', secret).send({ paused: false }).expect(403);
  assert.equal(pauseDenied.body.code, 'USAGE_PAUSE_NOT_ALLOWED');

  const summary = await request(app).get('/api/me/agent-usage/summary').query({ from: aligned(-20 * 86_400_000), to: new Date(Date.now() + 60_000).toISOString() }).set('authorization', member.authorization).expect(200);
  assert.equal(summary.body.data.some((row: { processName: string }) => row.processName === 'ARCHIVE'), false);
  assert.equal(summary.body.data.some((row: { processName: string }) => row.processName === 'EARLY'), true);

  await request(app).post(`/api/agent-devices/${deviceId}/revoke`).set('authorization', manager.authorization).send({}).expect(200);
  const revoked = await request(app).post(`/api/me/agent-devices/${deviceId}/usage-batches`).set('authorization', member.authorization).set('x-device-credential', secret).send(batch(`revoked-session-${tag}`, [
    { clientIntervalId: `revoked-${tag}`, processName: 'REVOKED', startedAt: aligned(-60_000), durationMs: 1_000 },
  ])).expect(403);
  assert.equal(revoked.body.code, 'DEVICE_REVOKED');
  assert.equal(JSON.stringify(revoked.body).includes(secret), false);
});

exclusive('usage stays inside the employee and organization', async () => {
  const admin = await login('admin@trileez.ir');
  const otherAdmin = await login('admin.org2@trileez.ir');
  const tag = suffix();
  const managerAccount = await createAccount(admin.authorization, admin.user.organizationId, 'manager', 'usagescope');
  const ownerAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'usageowner');
  const otherAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'usageother');
  const manager = await login(managerAccount.email);
  const owner = await login(ownerAccount.email);
  const other = await login(otherAccount.email);
  await request(app).put('/api/agent-usage/policy').set('authorization', admin.authorization).send({
    enabled: true, employeeMayPause: true, idleThresholdSeconds: 60, retentionDays: 30,
  }).expect(200);
  const enrolled = await request(app).post('/api/me/agent-devices').set('authorization', owner.authorization).send(deviceBody(`scope-${tag}`, `مالک ${tag}`)).expect(201);
  const secret = enrolled.body.credential as string;
  const deviceId = enrolled.body.data.id as string;
  const processName = `Scope${tag.replace(/[^A-Za-z0-9]/g, '')}`;
  await request(app).post(`/api/me/agent-devices/${deviceId}/usage-batches`).set('authorization', owner.authorization).set('x-device-credential', secret).send(batch(`scope-session-${tag}`, [
    { clientIntervalId: `scope-interval-${tag}`, processName, displayName: 'Scoped', startedAt: aligned(-120_000), durationMs: 4_000 },
  ])).expect(200);

  const otherDevice = await request(app).post('/api/me/agent-devices').set('authorization', other.authorization).send(deviceBody(`scope-other-${tag}`, `دیگری ${tag}`)).expect(201);
  const crossed = await request(app).post(`/api/me/agent-devices/${deviceId}/usage-batches`).set('authorization', other.authorization).set('x-device-credential', secret).send(batch(`stolen-session-${tag}`, [
    { clientIntervalId: `stolen-${tag}`, processName: 'STOLEN', startedAt: aligned(-120_000), durationMs: 4_000 },
  ])).expect(404);
  assert.equal(JSON.stringify(crossed.body).includes(processName), false);
  assert.equal(JSON.stringify(crossed.body).includes(secret), false);
  const otherSummary = await request(app).get('/api/me/agent-usage/summary').query({ from: aligned(-86_400_000), to: new Date(Date.now() + 60_000).toISOString() }).set('authorization', other.authorization).expect(200);
  assert.equal(JSON.stringify(otherSummary.body).includes(processName), false);
  const managed = await request(app).get('/api/agent-usage/summary').query({ userId: owner.user.id, from: aligned(-86_400_000), to: new Date(Date.now() + 60_000).toISOString() }).set('authorization', manager.authorization).expect(200);
  assert.equal(managed.body.data.some((row: { processName: string }) => row.processName === processName), true);
  const foreign = await request(app).get('/api/agent-usage/summary').query({ userId: owner.user.id, from: aligned(-86_400_000), to: new Date(Date.now() + 60_000).toISOString() }).set('authorization', otherAdmin.authorization).expect(404);
  assert.equal(JSON.stringify(foreign.body).includes(processName), false);
  await request(app).get('/api/agent-usage/summary').set('authorization', other.authorization).expect(403);
  assert.equal(otherDevice.body.data.id === deviceId, false);
});
