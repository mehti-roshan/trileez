import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
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

async function login(email: string): Promise<{ authorization: string; user: { id: string; organizationId: string; name?: string } }> {
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

function deviceBody(installationId: string, deviceName: string, screen = true) {
  return {
    installationId,
    deviceName,
    agentVersion: '0.2.0',
    capabilities: screen
      ? ['employee-dashboard', 'time-entry', 'attendance-read', 'screen-share']
      : ['employee-dashboard', 'time-entry', 'attendance-read'],
    platform: 'Win32NT',
    osDescription: 'Windows test',
  };
}

function jpeg(tag: string): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xd9]), Buffer.from(`FRAME-MARKER-${tag}`)]);
}

function binaryParser(res: NodeJS.ReadableStream, callback: (error: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

test('a support user needs authority and the employee must accept before any frame is shared', async () => {
  const admin = await login('admin@trileez.ir');
  const tag = suffix();
  const managerAccount = await createAccount(admin.authorization, admin.user.organizationId, 'manager', 'screenmanager');
  const otherManagerAccount = await createAccount(admin.authorization, admin.user.organizationId, 'manager', 'screenother');
  const memberAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'screenmember');
  const employee = await request(app).post('/api/employees').set('authorization', admin.authorization).send({
    fullName: `Screen ${tag}`, personnelCode: `SCR-${tag}`, userId: memberAccount.id, employmentStatus: 'active', compensationType: 'hourly_task',
  }).expect(201);
  const customerRecord = await request(app).post('/api/data/customers').set('authorization', admin.authorization).send({
    entityType: 'company', name: `Customer ${tag}`, company: `Company ${tag}`, currency: 'IRR',
  }).expect(201);
  const customerEmail = `customer.${tag}@example.com`;
  const customerUser = await request(app).post('/api/users').set('authorization', admin.authorization).send({
    name: `Actor customer ${tag}`, email: customerEmail, password, role: 'customer', customerId: customerRecord.body.data.id, title: 'مشتری',
  }).expect(201);
  await database.forOrganization(admin.user.organizationId).update('User', customerUser.body.data.id, { mustChangePassword: false });
  const manager = await login(managerAccount.email);
  const otherManager = await login(otherManagerAccount.email);
  const member = await login(memberAccount.email);
  const customer = await login(customerEmail);
  const otherOrg = await login('admin.org2@trileez.ir');
  const plain = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).send(deviceBody(`plain-screen-${tag}`, `ساده ${tag}`, false)).expect(201);
  const enrolled = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).send(deviceBody(`screen-${tag}`, `صفحه ${tag}`)).expect(201);
  const secret = enrolled.body.credential as string;
  const deviceId = enrolled.body.data.id as string;
  const filesBefore = await database.forOrganization(member.user.organizationId).count('FileRecord', {});
  const timeBefore = await database.forOrganization(member.user.organizationId).count('TimeEntry', { employeeId: employee.body.data.id });
  const attendanceBefore = await database.forOrganization(member.user.organizationId).count('AttendanceRecord', { employeeId: employee.body.data.id });
  const payrollBefore = await database.forOrganization(member.user.organizationId).count('PayrollRecord', { employeeId: employee.body.data.id });

  await request(app).post(`/api/agent-devices/${deviceId}/screen-sessions`).send({}).expect(401);
  const memberDenied = await request(app).post(`/api/agent-devices/${deviceId}/screen-sessions`).set('authorization', member.authorization).send({}).expect(403);
  assert.equal(memberDenied.body.error, 'Insufficient role');
  const customerDenied = await request(app).post(`/api/agent-devices/${deviceId}/screen-sessions`).set('authorization', customer.authorization).send({}).expect(403);
  assert.equal(customerDenied.body.error, 'Insufficient role');
  await request(app).post(`/api/agent-devices/${deviceId}/screen-sessions`).set('authorization', otherOrg.authorization).send({}).expect(404);
  const noCapability = await request(app).post(`/api/agent-devices/${plain.body.data.id}/screen-sessions`).set('authorization', manager.authorization).send({}).expect(403);
  assert.equal(noCapability.body.code, 'SCREEN_CAPABILITY');
  const forged = await request(app).post(`/api/agent-devices/${deviceId}/screen-sessions`).set('authorization', manager.authorization).send({
    employeeId: 'someone-else', requestNote: 'کمک', password: 'hidden-password',
  }).expect(400);
  assert.equal(forged.body.code, 'VALIDATION_ERROR');
  assert.equal(hasIssue(forged, 'body.employeeId'), true);
  const controlNote = await request(app).post(`/api/agent-devices/${deviceId}/screen-sessions`).set('authorization', manager.authorization).send({ requestNote: 'خط\nبعد' }).expect(400);
  assert.equal(hasIssue(controlNote, 'body.requestNote'), true);

  const created = await request(app).post(`/api/agent-devices/${deviceId}/screen-sessions`).set('authorization', manager.authorization).send({ requestNote: 'کمک برای ورود' }).expect(201);
  const sessionId = created.body.data.id as string;
  assert.equal(created.body.created, true);
  assert.equal(created.body.data.state, 'requested');
  assert.equal(typeof created.body.data.requestedAt, 'string');
  assert.equal(created.body.data.startedAt, null);
  assert.equal(created.body.data.endedAt, null);
  assert.equal(created.body.data.supportName, managerAccount.name);
  assert.equal(created.body.data.employeeId, employee.body.data.id);
  assert.equal(created.body.data.employeeUserId, member.user.id);
  assert.equal(JSON.stringify(created.body).includes(managerAccount.email), false);
  assert.equal(JSON.stringify(created.body).includes(secret), false);
  const again = await request(app).post(`/api/agent-devices/${deviceId}/screen-sessions`).set('authorization', manager.authorization).send({}).expect(200);
  assert.equal(again.body.created, false);
  assert.equal(again.body.data.id, sessionId);
  const busy = await request(app).post(`/api/agent-devices/${deviceId}/screen-sessions`).set('authorization', otherManager.authorization).send({}).expect(409);
  assert.equal(busy.body.code, 'SCREEN_SESSION_ACTIVE');

  const early = await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${sessionId}/frames`).set('authorization', member.authorization).set('x-device-credential', secret).set('content-type', 'image/jpeg').send(jpeg(tag)).expect(409);
  assert.equal(early.body.code, 'SCREEN_NOT_ACTIVE');
  const stranger = await request(app).get(`/api/me/agent-devices/${deviceId}/screen-session`).set('authorization', otherManager.authorization).set('x-device-credential', secret).expect(404);
  assert.equal(stranger.body.error.includes(secret), false);
  await request(app).get(`/api/me/agent-devices/${deviceId}/screen-session`).set('authorization', member.authorization).set('x-device-credential', 'not-the-secret').expect(401);
  const seen = await request(app).get(`/api/me/agent-devices/${deviceId}/screen-session`).set('authorization', member.authorization).set('x-device-credential', secret).expect(200);
  assert.equal(seen.body.data.id, sessionId);
  assert.equal(seen.body.data.state, 'requested');
  assert.equal(typeof seen.body.data.lastAgentAt, 'string');
  const forbiddenView = await request(app).get(`/api/agent-screen-sessions/${sessionId}/frame`).set('authorization', otherManager.authorization).expect(403);
  assert.equal(forbiddenView.body.code, 'SCREEN_VIEW_FORBIDDEN');
  await request(app).get(`/api/agent-screen-sessions/${sessionId}`).set('authorization', member.authorization).expect(403);

  const accepted = await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${sessionId}/accept`).set('authorization', member.authorization).set('x-device-credential', secret).expect(200);
  assert.equal(accepted.body.data.state, 'active');
  assert.equal(typeof accepted.body.data.startedAt, 'string');
  const uploaded = await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${sessionId}/frames`).set('authorization', member.authorization).set('x-device-credential', secret).set('content-type', 'image/jpeg').send(jpeg(tag)).expect(200);
  assert.equal(uploaded.body.data.accepted, true);
  assert.equal(uploaded.body.data.frameCount, 1);
  assert.equal(JSON.stringify(uploaded.body).includes(`FRAME-MARKER-${tag}`), false);
  const live = await request(app).get(`/api/agent-screen-sessions/${sessionId}/frame`).set('authorization', manager.authorization).buffer(true).parse(binaryParser).expect(200);
  assert.equal(live.headers['content-type'], 'image/jpeg');
  assert.equal(live.headers['cache-control'], 'no-store');
  assert.equal(live.body[0], 0xff);
  assert.equal(live.body[1], 0xd8);
  assert.equal(Buffer.isBuffer(live.body) && live.body.includes(Buffer.from(`FRAME-MARKER-${tag}`)), true);
  const stored = await database.forOrganization(member.user.organizationId).get('AgentScreenSession', sessionId);
  assert.equal(JSON.stringify(stored).includes(`FRAME-MARKER-${tag}`), false);
  assert.equal(JSON.stringify(stored).includes(secret), false);
  assert.equal(stored?.frameCount, 1);
  assert.equal(await database.forOrganization(member.user.organizationId).count('FileRecord', {}), filesBefore);
  assert.equal(await database.forOrganization(member.user.organizationId).count('TimeEntry', { employeeId: employee.body.data.id }), timeBefore);
  assert.equal(await database.forOrganization(member.user.organizationId).count('AttendanceRecord', { employeeId: employee.body.data.id }), attendanceBefore);
  assert.equal(await database.forOrganization(member.user.organizationId).count('PayrollRecord', { employeeId: employee.body.data.id }), payrollBefore);

  const stopped = await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${sessionId}/end`).set('authorization', member.authorization).set('x-device-credential', secret).send({ reason: 'employee_stop' }).expect(200);
  assert.equal(stopped.body.data.state, 'ended');
  assert.equal(stopped.body.data.endReason, 'employee_stop');
  assert.equal(typeof stopped.body.data.endedAt, 'string');
  const afterEnd = await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${sessionId}/frames`).set('authorization', member.authorization).set('x-device-credential', secret).set('content-type', 'image/jpeg').send(jpeg(tag)).expect(409);
  assert.equal(afterEnd.body.code, 'SCREEN_SESSION_ENDED');
  const cleared = await request(app).get(`/api/agent-screen-sessions/${sessionId}/frame`).set('authorization', manager.authorization).expect(409);
  assert.equal(cleared.body.code, 'SCREEN_SESSION_ENDED');
  const replacement = await request(app).post(`/api/agent-devices/${deviceId}/screen-sessions`).set('authorization', otherManager.authorization).send({}).expect(201);
  assert.notEqual(replacement.body.data.id, sessionId);
  assert.equal(replacement.body.data.state, 'requested');
});

test('screen sessions expire, reject bad frames, and stop when the agent goes silent', async () => {
  const admin = await login('admin@trileez.ir');
  const tag = suffix();
  const managerAccount = await createAccount(admin.authorization, admin.user.organizationId, 'manager', 'screentime');
  const memberAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'screentimeworker');
  const manager = await login(managerAccount.email);
  const member = await login(memberAccount.email);
  const enrolled = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).send(deviceBody(`time-screen-${tag}`, `زمان ${tag}`)).expect(201);
  const secret = enrolled.body.credential as string;
  const deviceId = enrolled.body.data.id as string;
  const requested = await request(app).post(`/api/agent-devices/${deviceId}/screen-sessions`).set('authorization', manager.authorization).send({}).expect(201);
  const requestId = requested.body.data.id as string;
  await database.forOrganization(member.user.organizationId).update('AgentScreenSession', requestId, { expiresAt: new Date(Date.now() - 1000).toISOString() });
  const requestExpired = await request(app).get(`/api/me/agent-devices/${deviceId}/screen-session`).set('authorization', member.authorization).set('x-device-credential', secret).expect(200);
  assert.equal(requestExpired.body.data.state, 'ended');
  assert.equal(requestExpired.body.data.endReason, 'timeout');
  assert.equal(typeof requestExpired.body.data.endedAt, 'string');

  const active = await request(app).post(`/api/agent-devices/${deviceId}/screen-sessions`).set('authorization', manager.authorization).send({}).expect(201);
  const sessionId = active.body.data.id as string;
  await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${sessionId}/accept`).set('authorization', member.authorization).set('x-device-credential', secret).expect(200);
  const seenAt = (await database.forOrganization(member.user.organizationId).get('AgentScreenSession', sessionId))?.lastAgentAt;
  await request(app).get(`/api/agent-screen-sessions/${sessionId}`).set('authorization', manager.authorization).expect(200);
  const afterSupportRead = await database.forOrganization(member.user.organizationId).get('AgentScreenSession', sessionId);
  assert.equal(new Date(String(afterSupportRead?.lastAgentAt)).toISOString(), new Date(String(seenAt)).toISOString());
  await database.forOrganization(member.user.organizationId).update('AgentScreenSession', sessionId, { lastAgentAt: new Date(Date.now() - 21_000).toISOString() });
  const silent = await request(app).get(`/api/agent-screen-sessions/${sessionId}`).set('authorization', manager.authorization).expect(200);
  assert.equal(silent.body.data.state, 'ended');
  assert.equal(silent.body.data.endReason, 'agent_lost');
  assert.equal(typeof silent.body.data.endedAt, 'string');

  const limited = await request(app).post(`/api/agent-devices/${deviceId}/screen-sessions`).set('authorization', manager.authorization).send({}).expect(201);
  const limitedId = limited.body.data.id as string;
  await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${limitedId}/accept`).set('authorization', member.authorization).set('x-device-credential', secret).expect(200);
  await database.forOrganization(member.user.organizationId).update('AgentScreenSession', limitedId, { expiresAt: new Date(Date.now() - 1000).toISOString(), lastAgentAt: new Date().toISOString() });
  const timedOut = await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${limitedId}/frames`).set('authorization', member.authorization).set('x-device-credential', secret).set('content-type', 'image/jpeg').send(jpeg(tag)).expect(409);
  assert.equal(timedOut.body.code, 'SCREEN_SESSION_ENDED');
  assert.equal((await database.forOrganization(member.user.organizationId).get('AgentScreenSession', limitedId))?.endReason, 'timeout');

  const fresh = await request(app).post(`/api/agent-devices/${deviceId}/screen-sessions`).set('authorization', manager.authorization).send({}).expect(201);
  const freshId = fresh.body.data.id as string;
  await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${freshId}/accept`).set('authorization', member.authorization).set('x-device-credential', secret).expect(200);
  const invalid = await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${freshId}/frames`).set('authorization', member.authorization).set('x-device-credential', secret).set('content-type', 'image/jpeg').send(Buffer.from('not-a-jpeg')).expect(400);
  assert.equal(invalid.body.code, 'SCREEN_FRAME_INVALID');
  const wrongType = await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${freshId}/frames`).set('authorization', member.authorization).set('x-device-credential', secret).set('content-type', 'text/plain').send(jpeg(tag)).expect(400);
  assert.equal(wrongType.body.code, 'SCREEN_FRAME_INVALID');
  const tooLarge = Buffer.alloc(400_001, 0x20);
  tooLarge[0] = 0xff;
  tooLarge[1] = 0xd8;
  const oversized = await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${freshId}/frames`).set('authorization', member.authorization).set('x-device-credential', secret).set('content-type', 'image/jpeg').send(tooLarge).expect(413);
  assert.equal(oversized.body.code, 'SCREEN_FRAME_TOO_LARGE');
  await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${freshId}/frames`).set('authorization', member.authorization).set('x-device-credential', secret).set('content-type', 'image/jpeg').send(jpeg(`${tag}-stale`)).expect(200);
  await new Promise((resolve) => setTimeout(resolve, 3200));
  await request(app).get(`/api/agent-screen-sessions/${freshId}/frame`).set('authorization', manager.authorization).expect(204);
  const rejected = await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${freshId}/end`).set('authorization', member.authorization).set('x-device-credential', secret).send({ reason: 'rejected' }).expect(200);
  assert.equal(rejected.body.data.endReason, 'rejected');
  const supportEnded = await request(app).post(`/api/agent-devices/${deviceId}/screen-sessions`).set('authorization', manager.authorization).send({}).expect(201);
  await request(app).post(`/api/agent-screen-sessions/${supportEnded.body.data.id}/end`).set('authorization', manager.authorization).expect(200);
  const endedRow = await database.forOrganization(member.user.organizationId).get('AgentScreenSession', supportEnded.body.data.id as string);
  assert.equal(endedRow?.state, 'ended');
  assert.equal(endedRow?.endReason, 'support_end');
  assert.equal(typeof endedRow?.endedAt, 'string');
});

test('revoked devices and other organizations cannot open or view a screen session', async () => {
  const admin = await login('admin@trileez.ir');
  const tag = suffix();
  const managerAccount = await createAccount(admin.authorization, admin.user.organizationId, 'manager', 'screenguard');
  const memberAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'screenguardworker');
  const manager = await login(managerAccount.email);
  const member = await login(memberAccount.email);
  const otherOrg = await login('admin.org2@trileez.ir');
  const enrolled = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).send(deviceBody(`guard-screen-${tag}`, `محافظ ${tag}`)).expect(201);
  const secret = enrolled.body.credential as string;
  const deviceId = enrolled.body.data.id as string;
  const created = await request(app).post(`/api/agent-devices/${deviceId}/screen-sessions`).set('authorization', manager.authorization).send({}).expect(201);
  const sessionId = created.body.data.id as string;
  await request(app).get(`/api/agent-screen-sessions/${sessionId}`).set('authorization', otherOrg.authorization).expect(404);
  await request(app).post(`/api/agent-devices/${deviceId}/revoke`).set('authorization', admin.authorization).send({}).expect(200);
  const revoked = await request(app).get(`/api/me/agent-devices/${deviceId}/screen-session`).set('authorization', member.authorization).set('x-device-credential', secret).expect(403);
  assert.equal(revoked.body.code, 'DEVICE_REVOKED');
  const closed = await database.forOrganization(member.user.organizationId).get('AgentScreenSession', sessionId);
  assert.equal(closed?.state, 'ended');
  assert.equal(closed?.endReason, 'agent_lost');
  const recreate = await request(app).post(`/api/agent-devices/${deviceId}/screen-sessions`).set('authorization', manager.authorization).send({}).expect(403);
  assert.equal(recreate.body.code, 'DEVICE_REVOKED');
});

test('quality caps stay inside the mode and the relay keeps only the latest frame', async () => {
  const admin = await login('admin@trileez.ir');
  const tag = suffix();
  const managerAccount = await createAccount(admin.authorization, admin.user.organizationId, 'manager', 'screenquality');
  const otherAccount = await createAccount(admin.authorization, admin.user.organizationId, 'manager', 'screenqualityother');
  const memberAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'screenqualityworker');
  const manager = await login(managerAccount.email);
  const other = await login(otherAccount.email);
  const member = await login(memberAccount.email);
  const enrolled = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).send(deviceBody(`quality-screen-${tag}`, `کیفیت ${tag}`)).expect(201);
  const secret = enrolled.body.credential as string;
  const deviceId = enrolled.body.data.id as string;
  const filesBefore = await database.forOrganization(member.user.organizationId).count('FileRecord', {});

  const tooFast = await request(app).post(`/api/agent-devices/${deviceId}/screen-sessions`).set('authorization', manager.authorization).send({ qualityMode: 'high', maxFps: 120 }).expect(400);
  assert.equal(tooFast.body.code, 'VALIDATION_ERROR');
  const defaults = await request(app).post(`/api/agent-devices/${deviceId}/screen-sessions`).set('authorization', manager.authorization).send({}).expect(201);
  assert.equal(defaults.body.data.qualityMode, 'assistance');
  assert.equal(defaults.body.data.maxFps, 2);
  assert.equal(defaults.body.data.maxEdge, 1280);
  assert.equal(defaults.body.data.jpegQuality, 60);
  assert.equal(defaults.body.data.relay.retainedFrames, 0);
  await request(app).post(`/api/agent-screen-sessions/${defaults.body.data.id}/end`).set('authorization', manager.authorization).expect(200);

  const capped = await request(app).post(`/api/agent-devices/${deviceId}/screen-sessions`).set('authorization', manager.authorization).send({
    qualityMode: 'assistance', maxFps: 30, maxEdge: 1920, jpegQuality: 85,
  }).expect(201);
  assert.equal(capped.body.data.maxFps, 5);
  assert.equal(capped.body.data.maxEdge, 1280);
  assert.equal(capped.body.data.jpegQuality, 70);
  await request(app).post(`/api/agent-screen-sessions/${capped.body.data.id}/end`).set('authorization', manager.authorization).expect(200);

  const created = await request(app).post(`/api/agent-devices/${deviceId}/screen-sessions`).set('authorization', manager.authorization).send({
    qualityMode: 'high', maxFps: 10, maxEdge: 1600, jpegQuality: 50,
  }).expect(201);
  const sessionId = created.body.data.id as string;
  assert.equal(created.body.data.qualityMode, 'high');
  assert.equal(created.body.data.maxFps, 15);
  assert.equal(created.body.data.maxEdge, 1600);
  assert.equal(created.body.data.jpegQuality, 50);
  const forbidden = await request(app).post(`/api/agent-screen-sessions/${sessionId}/quality`).set('authorization', other.authorization).send({ qualityMode: 'assistance' }).expect(403);
  assert.equal(forbidden.body.code, 'SCREEN_VIEW_FORBIDDEN');
  const switched = await request(app).post(`/api/agent-screen-sessions/${sessionId}/quality`).set('authorization', manager.authorization).send({
    qualityMode: 'high', maxFps: 24, maxEdge: 1280, jpegQuality: 60,
  }).expect(200);
  assert.equal(switched.body.data.qualityMode, 'high');
  assert.equal(switched.body.data.maxFps, 24);
  assert.equal(switched.body.data.maxEdge, 1280);
  assert.ok(switched.body.data.maxFps <= 30);
  assert.ok(switched.body.data.maxEdge <= 1920);

  await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${sessionId}/accept`).set('authorization', member.authorization).set('x-device-credential', secret).send({}).expect(200);
  const seen = await request(app).get(`/api/me/agent-devices/${deviceId}/screen-session`).set('authorization', member.authorization).set('x-device-credential', secret).expect(200);
  assert.equal(seen.body.data.qualityMode, 'high');
  assert.equal(seen.body.data.maxFps, 24);

  const started = process.hrtime.bigint();
  const cpuStart = process.cpuUsage();
  const heapStart = process.memoryUsage().heapUsed;
  const latencies: number[] = [];
  let accepted = 0;
  while (Number(process.hrtime.bigint() - started) / 1e6 < 1000 && accepted < 120) {
    const mark = process.hrtime.bigint();
    const tag = accepted === 0 ? 'first' : 'last';
    const uploaded = await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${sessionId}/frames`).set('authorization', member.authorization).set('x-device-credential', secret).set('content-type', 'image/jpeg').send(jpeg(tag)).expect(200);
    latencies.push(Number(process.hrtime.bigint() - mark) / 1e6);
    assert.equal(uploaded.body.data.accepted, true);
    assert.equal(uploaded.body.data.retainedFrames, 1);
    assert.equal(uploaded.body.data.bytes, jpeg(tag).length);
    assert.equal(JSON.stringify(uploaded.body).includes('FRAME-MARKER'), false);
    accepted += 1;
  }
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  const cpu = process.cpuUsage(cpuStart);
  const heapAfter = process.memoryUsage().heapUsed;
  const achievedFps = accepted >= 2 ? Number((((accepted - 1) * 1000) / elapsedMs).toFixed(2)) : 0;
  const averageLatencyMs = latencies.length === 0 ? 0 : Number((latencies.reduce((sum, value) => sum + value, 0) / latencies.length).toFixed(2));
  console.log(`SCREEN_RELAY_MEASUREMENT ${JSON.stringify({
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
    cpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    accepted,
    elapsedMs: Number(elapsedMs.toFixed(1)),
    achievedFps,
    averageLatencyMs,
    cpuUserMicros: cpu.user,
    cpuSystemMicros: cpu.system,
    heapBefore: heapStart,
    heapAfter,
    captureIncluded: false,
  })}`);
  assert.ok(accepted >= 2);
  assert.ok(achievedFps > 0);
  const frame = await request(app).get(`/api/agent-screen-sessions/${sessionId}/frame`).set('authorization', manager.authorization).buffer(true).parse(binaryParser).expect(200);
  assert.equal(frame.headers['content-type'], 'image/jpeg');
  assert.equal(frame.body[0], 0xff);
  assert.equal(frame.body[1], 0xd8);
  assert.equal(frame.body.includes(Buffer.from('FRAME-MARKER-last')), true);
  assert.equal(frame.body.includes(Buffer.from('FRAME-MARKER-first')), false);
  const metadata = await request(app).get(`/api/agent-screen-sessions/${sessionId}`).set('authorization', manager.authorization).expect(200);
  assert.equal(metadata.body.data.relay.retainedFrames, 1);
  assert.equal(metadata.body.data.frameCount, accepted);
  assert.equal(metadata.body.data.maxFps, 24);
  const stored = await database.forOrganization(member.user.organizationId).get('AgentScreenSession', sessionId);
  assert.equal(JSON.stringify(stored).includes('FRAME-MARKER'), false);
  assert.equal(await database.forOrganization(member.user.organizationId).count('FileRecord', {}), filesBefore);

  const ended = await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${sessionId}/end`).set('authorization', member.authorization).set('x-device-credential', secret).send({ reason: 'employee_stop' }).expect(200);
  assert.equal(ended.body.data.state, 'ended');
  assert.equal(ended.body.data.endReason, 'employee_stop');
  assert.equal(typeof ended.body.data.endedAt, 'string');
  await request(app).get(`/api/agent-screen-sessions/${sessionId}/frame`).set('authorization', manager.authorization).expect(409);
  const after = await request(app).get(`/api/agent-screen-sessions/${sessionId}`).set('authorization', manager.authorization).expect(200);
  assert.equal(after.body.data.relay.retainedFrames, 0);
  const qualityAfterEnd = await request(app).post(`/api/agent-screen-sessions/${sessionId}/quality`).set('authorization', manager.authorization).send({ qualityMode: 'assistance' }).expect(409);
  assert.equal(qualityAfterEnd.body.code, 'SCREEN_SESSION_ENDED');
});
