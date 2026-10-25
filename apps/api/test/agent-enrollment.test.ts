import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

function passwordFor(email: string): string {
  return email === 'admin@trileez.ir' || email === 'admin.org2@trileez.ir' ? 'Admin123!' : password;
}

async function login(email: string): Promise<{ authorization: string; user: { id: string; organizationId: string } }> {
  const response = await request(app).post('/api/auth/login').send({ email, password: passwordFor(email) }).expect(200);
  const me = await request(app).get('/api/auth/me').set('authorization', `Bearer ${response.body.token}`).expect(200);
  return { authorization: `Bearer ${response.body.token}`, user: me.body.user };
}

async function createAccount(adminAuthorization: string, organizationId: string, role: 'manager' | 'member', label: string, options: { clearPasswordChange?: boolean } = {}) {
  const tag = suffix();
  const email = `${label}.${tag}@example.com`;
  const created = await request(app).post('/api/users').set('authorization', adminAuthorization).send({
    name: `Actor ${label} ${tag}`, email, password, role, title: 'همکار',
  }).expect(201);
  if (options.clearPasswordChange !== false) {
    await database.forOrganization(organizationId).update('User', created.body.data.id, { mustChangePassword: false });
  }
  return { id: created.body.data.id as string, email };
}

function enrollment(installationId: string, deviceName: string) {
  return {
    installationId,
    deviceName,
    agentVersion: '0.2.0',
    capabilities: ['employee-dashboard', 'screen-share', 'time-entry', 'monitoring', 'attendance-read', 'remote-control'],
    platform: 'Win32NT',
    osDescription: 'Windows test',
  };
}

function hashOf(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

function withoutCredential(body: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...body };
  delete copy.credential;
  return copy;
}

test('enrollment binds the signed-in employee and records name, version, capabilities, and presence', async () => {
  const admin = await login('admin@trileez.ir');
  const tag = suffix();
  const managerAccount = await createAccount(admin.authorization, admin.user.organizationId, 'manager', 'devices');
  const workerAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'owner');
  const plainAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'plain');
  const inactiveAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'ended');
  const workerEmployee = await request(app).post('/api/employees').set('authorization', admin.authorization).send({
    fullName: `Owner ${tag}`, personnelCode: `OWN-${tag}`, userId: workerAccount.id, employmentStatus: 'active', compensationType: 'hourly_task',
  }).expect(201);
  await request(app).post('/api/employees').set('authorization', admin.authorization).send({
    fullName: `Ended ${tag}`, personnelCode: `END-${tag}`, userId: inactiveAccount.id, employmentStatus: 'terminated', compensationType: 'hourly_task',
  }).expect(201);
  const manager = await login(managerAccount.email);
  const worker = await login(workerAccount.email);
  const plain = await login(plainAccount.email);
  const inactive = await login(inactiveAccount.email);
  const deviceName = `لپ‌تاپ ${tag}`;
  const installationId = `inst-${tag}`;
  const legacyBefore = await request(app).get('/api/data/devices').query({ limit: 100 }).set('authorization', admin.authorization).expect(200);

  const created = await request(app).post('/api/me/agent-devices').set('authorization', worker.authorization).send(enrollment(installationId, deviceName)).expect(201);
  const secret = created.body.credential as string;
  const deviceId = created.body.data.id as string;
  assert.equal(created.body.created, true);
  assert.equal(typeof secret, 'string');
  assert.equal(secret.length > 20, true);
  assert.equal(created.body.data.installationId, installationId);
  assert.equal(created.body.data.deviceName, deviceName);
  assert.equal(created.body.data.agentVersion, '0.2.0');
  assert.deepEqual(created.body.data.capabilities, ['employee-dashboard', 'time-entry', 'attendance-read', 'screen-share', 'remote-control']);
  assert.equal(created.body.data.capabilities.includes('monitoring'), false);
  assert.equal(created.body.data.status, 'active');
  assert.equal(created.body.data.connectionStatus, 'offline');
  assert.equal(created.body.data.employeeId, workerEmployee.body.data.id);
  assert.equal(created.body.data.userId, worker.user.id);
  assert.equal(JSON.stringify(created.body).includes('credentialHash'), false);
  assert.equal(JSON.stringify(withoutCredential(created.body)).includes(secret), false);
  const stored = await database.forOrganization(worker.user.organizationId).get('AgentEnrollment', deviceId);
  assert.equal(stored?.credentialHash, hashOf(secret));
  assert.notEqual(stored?.credentialHash, secret);

  const listed = await request(app).get('/api/me/agent-devices').query({ limit: 100 }).set('authorization', worker.authorization).expect(200);
  assert.equal(listed.body.data.some((row: { id: string }) => row.id === deviceId), true);
  assert.equal(JSON.stringify(listed.body).includes(secret), false);
  assert.equal(JSON.stringify(listed.body).includes('credentialHash'), false);
  const one = await request(app).get(`/api/me/agent-devices/${deviceId}`).set('authorization', worker.authorization).expect(200);
  assert.equal(one.body.data.deviceName, deviceName);
  assert.equal(JSON.stringify(one.body).includes(secret), false);

  const plainDevice = await request(app).post('/api/me/agent-devices').set('authorization', plain.authorization).send(enrollment(`plain-${tag}`, `ساده ${tag}`)).expect(201);
  assert.equal(plainDevice.body.data.employeeId, null);
  const inactiveDevice = await request(app).post('/api/me/agent-devices').set('authorization', inactive.authorization).send(enrollment(`ended-${tag}`, `پایان ${tag}`)).expect(201);
  assert.equal(inactiveDevice.body.data.employeeId, null);

  const heartbeat = await request(app).post(`/api/me/agent-devices/${deviceId}/heartbeat`).set('authorization', worker.authorization).set('x-device-credential', secret).send({
    agentVersion: '0.2.0', capabilities: ['employee-dashboard', 'time-entry', 'attendance-read', 'screen-share'],
  }).expect(200);
  assert.equal(heartbeat.body.data.connectionStatus, 'online');
  assert.equal(typeof heartbeat.body.data.lastSeenAt, 'string');
  assert.deepEqual(heartbeat.body.data.capabilities, ['employee-dashboard', 'time-entry', 'attendance-read', 'screen-share']);
  assert.equal(JSON.stringify(heartbeat.body).includes(secret), false);

  await database.forOrganization(worker.user.organizationId).update('AgentEnrollment', deviceId, {
    lastSeenAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), connectionStatus: 'online',
  });
  const stale = await request(app).get(`/api/me/agent-devices/${deviceId}`).set('authorization', worker.authorization).expect(200);
  assert.equal(stale.body.data.connectionStatus, 'offline');
  const fresh = await request(app).post(`/api/me/agent-devices/${deviceId}/heartbeat`).set('authorization', worker.authorization).set('x-device-credential', secret).send({}).expect(200);
  assert.equal(fresh.body.data.connectionStatus, 'online');
  const disconnected = await request(app).post(`/api/me/agent-devices/${deviceId}/disconnect`).set('authorization', worker.authorization).set('x-device-credential', secret).send({}).expect(200);
  assert.equal(disconnected.body.data.connectionStatus, 'offline');
  assert.equal(disconnected.body.data.status, 'active');

  const legacyAfter = await request(app).get('/api/data/devices').query({ limit: 100 }).set('authorization', admin.authorization).expect(200);
  assert.equal(JSON.stringify(legacyBefore.body).includes(deviceName), false);
  assert.equal(JSON.stringify(legacyAfter.body).includes(deviceName), false);
  assert.equal(JSON.stringify(legacyAfter.body).includes(installationId), false);
  await request(app).post('/api/data/devices').set('authorization', worker.authorization).send({ name: deviceName, os: 'Windows', status: 'offline' }).expect(403);
  await request(app).get('/api/data/devices').set('authorization', worker.authorization).expect(403);
  const managed = await request(app).get('/api/agent-devices').query({ limit: 100 }).set('authorization', manager.authorization).expect(200);
  assert.equal(managed.body.data.some((row: { id: string }) => row.id === deviceId), true);
  assert.equal(JSON.stringify(managed.body).includes(secret), false);
  assert.equal(JSON.stringify(managed.body).includes('credentialHash'), false);
});

test('duplicate registration keeps one device and rotates the secret only when the current one is not presented', async () => {
  const admin = await login('admin@trileez.ir');
  const tag = suffix();
  const account = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'duplicate');
  const member = await login(account.email);
  const installationId = `dup-${tag}`;
  const first = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).send(enrollment(installationId, `تکرار ${tag}`)).expect(201);
  const secret = first.body.credential as string;
  const deviceId = first.body.data.id as string;

  const same = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).set('x-device-credential', secret).send(enrollment(installationId, `تکرار تازه ${tag}`)).expect(200);
  assert.equal(same.body.created, false);
  assert.equal(same.body.data.id, deviceId);
  assert.equal(same.body.credential, undefined);
  assert.equal(same.body.data.deviceName, `تکرار تازه ${tag}`);
  const still = await request(app).post(`/api/me/agent-devices/${deviceId}/heartbeat`).set('authorization', member.authorization).set('x-device-credential', secret).send({}).expect(200);
  assert.equal(still.body.data.connectionStatus, 'online');

  const rotated = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).send(enrollment(installationId, `تکرار چرخیده ${tag}`)).expect(200);
  const replacement = rotated.body.credential as string;
  assert.equal(rotated.body.created, false);
  assert.equal(rotated.body.data.id, deviceId);
  assert.notEqual(replacement, secret);
  assert.equal(JSON.stringify(withoutCredential(rotated.body)).includes(replacement), false);
  const rejected = await request(app).post(`/api/me/agent-devices/${deviceId}/heartbeat`).set('authorization', member.authorization).set('x-device-credential', secret).send({}).expect(401);
  assert.equal(rejected.body.code, 'DEVICE_CREDENTIAL_REJECTED');
  assert.equal(JSON.stringify(rejected.body).includes(secret), false);
  assert.equal(JSON.stringify(rejected.body).includes(replacement), false);
  await request(app).post(`/api/me/agent-devices/${deviceId}/heartbeat`).set('authorization', member.authorization).set('x-device-credential', replacement).send({}).expect(200);

  const wrong = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).set('x-device-credential', 'wrong-credential-value').send(enrollment(installationId, `تکرار نهایی ${tag}`)).expect(200);
  const newest = wrong.body.credential as string;
  assert.notEqual(newest, replacement);
  await request(app).post(`/api/me/agent-devices/${deviceId}/heartbeat`).set('authorization', member.authorization).set('x-device-credential', replacement).send({}).expect(401);
  await request(app).post(`/api/me/agent-devices/${deviceId}/heartbeat`).set('authorization', member.authorization).set('x-device-credential', newest).send({}).expect(200);
  const rows = await database.forOrganization(member.user.organizationId).list('AgentEnrollment', { installationId });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.credentialHash, hashOf(newest));
});

test('unauthorized callers cannot register a device or use a device secret as an account', async () => {
  const admin = await login('admin@trileez.ir');
  const tag = suffix();
  const account = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'guard');
  const locked = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'locked', { clearPasswordChange: false });
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
  const lockedLogin = await request(app).post('/api/auth/login').send({ email: locked.email, password }).expect(200);
  const lockedAuthorization = `Bearer ${lockedLogin.body.token}`;
  const before = await database.forOrganization(member.user.organizationId).count('AgentEnrollment', { userId: member.user.id });

  await request(app).post('/api/me/agent-devices').send(enrollment(`anon-${tag}`, `ناشناس ${tag}`)).expect(401);
  const customerDenied = await request(app).post('/api/me/agent-devices').set('authorization', customer.authorization).send(enrollment(`cust-${tag}`, `مشتری ${tag}`)).expect(403);
  assert.equal(customerDenied.body.error, 'Insufficient role');
  const passwordDenied = await request(app).post('/api/me/agent-devices').set('authorization', lockedAuthorization).send(enrollment(`lock-${tag}`, `قفل ${tag}`)).expect(403);
  assert.equal(passwordDenied.body.code, 'PASSWORD_CHANGE_REQUIRED');
  const forged = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).send({
    ...enrollment(`forged-${tag}`, `جعل ${tag}`),
    employeeId: 'someone-else', userId: 'someone-else', organizationId: 'other-org', status: 'active', credential: 'client-secret',
  }).expect(400);
  assert.equal(forged.body.error, 'Validation failed');
  assert.equal(forged.body.code, 'VALIDATION_ERROR');
  for (const path of ['body.employeeId', 'body.userId', 'body.organizationId', 'body.status', 'body.credential']) {
    assert.equal(hasIssue(forged, path), true);
  }
  assert.equal(await database.forOrganization(member.user.organizationId).count('AgentEnrollment', { userId: member.user.id }), before);
  assert.equal(await database.forOrganization(member.user.organizationId).count('AgentEnrollment', { installationId: `forged-${tag}` }), 0);

  const created = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).send(enrollment(`guard-${tag}`, `محافظ ${tag}`)).expect(201);
  const secret = created.body.credential as string;
  const deviceId = created.body.data.id as string;
  await request(app).get('/api/agent-devices').set('authorization', member.authorization).expect(403);
  await request(app).post(`/api/agent-devices/${deviceId}/revoke`).set('authorization', member.authorization).send({}).expect(403);
  await request(app).post(`/api/agent-devices/${deviceId}/disable`).set('authorization', member.authorization).send({}).expect(403);
  await request(app).get('/api/users').set('authorization', `Bearer ${secret}`).expect(401);
  await request(app).get('/api/agent-devices').set('authorization', `Bearer ${secret}`).expect(401);
  await request(app).post(`/api/me/agent-devices/${deviceId}/heartbeat`).set('x-device-credential', secret).send({}).expect(401);
  const missing = await request(app).post(`/api/me/agent-devices/${deviceId}/heartbeat`).set('authorization', member.authorization).send({}).expect(401);
  assert.equal(missing.body.code, 'DEVICE_CREDENTIAL_REJECTED');
  assert.equal(JSON.stringify(missing.body).includes(secret), false);
  const huge = 'a'.repeat(180);
  const oversized = await request(app).post(`/api/me/agent-devices/${deviceId}/heartbeat`).set('authorization', member.authorization).set('x-device-credential', huge).send({}).expect(401);
  assert.equal(oversized.body.code, 'DEVICE_CREDENTIAL_REJECTED');
  assert.equal(JSON.stringify(oversized.body).includes(huge), false);
});

test('revocation and disablement are enforced and a revoked installation is not reactivated', async () => {
  const admin = await login('admin@trileez.ir');
  const tag = suffix();
  const managerAccount = await createAccount(admin.authorization, admin.user.organizationId, 'manager', 'control');
  const account = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'remote');
  const manager = await login(managerAccount.email);
  const member = await login(account.email);
  const first = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).send(enrollment(`rev-${tag}`, `لغو ${tag}`)).expect(201);
  const firstSecret = first.body.credential as string;
  const firstId = first.body.data.id as string;
  const revoked = await request(app).post(`/api/agent-devices/${firstId}/revoke`).set('authorization', manager.authorization).send({}).expect(200);
  assert.equal(revoked.body.data.status, 'revoked');
  assert.equal(JSON.stringify(revoked.body).includes(firstSecret), false);
  const revokedBeat = await request(app).post(`/api/me/agent-devices/${firstId}/heartbeat`).set('authorization', member.authorization).set('x-device-credential', firstSecret).send({}).expect(403);
  assert.equal(revokedBeat.body.code, 'DEVICE_REVOKED');
  assert.equal(JSON.stringify(revokedBeat.body).includes(firstSecret), false);
  const reused = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).set('x-device-credential', firstSecret).send(enrollment(`rev-${tag}`, `لغو دوباره ${tag}`)).expect(403);
  assert.equal(reused.body.code, 'DEVICE_REVOKED');
  assert.equal(reused.body.credential, undefined);
  const stillRevoked = await request(app).get(`/api/me/agent-devices/${firstId}`).set('authorization', member.authorization).expect(200);
  assert.equal(stillRevoked.body.data.status, 'revoked');
  const enableRevoked = await request(app).post(`/api/agent-devices/${firstId}/enable`).set('authorization', manager.authorization).send({}).expect(403);
  assert.equal(enableRevoked.body.code, 'DEVICE_REVOKED');
  const replacement = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).send(enrollment(`new-${tag}`, `جایگزین ${tag}`)).expect(201);
  assert.notEqual(replacement.body.data.id, firstId);
  assert.equal(replacement.body.data.status, 'active');

  const second = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).send(enrollment(`off-${tag}`, `خاموش ${tag}`)).expect(201);
  const secondSecret = second.body.credential as string;
  const secondId = second.body.data.id as string;
  const disabled = await request(app).post(`/api/agent-devices/${secondId}/disable`).set('authorization', manager.authorization).send({}).expect(200);
  assert.equal(disabled.body.data.status, 'disabled');
  const disabledBeat = await request(app).post(`/api/me/agent-devices/${secondId}/heartbeat`).set('authorization', member.authorization).set('x-device-credential', secondSecret).send({}).expect(403);
  assert.equal(disabledBeat.body.code, 'DEVICE_DISABLED');
  const disabledAgain = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).set('x-device-credential', secondSecret).send(enrollment(`off-${tag}`, `خاموش ${tag}`)).expect(200);
  assert.equal(disabledAgain.body.created, false);
  assert.equal(disabledAgain.body.data.status, 'disabled');
  assert.equal(disabledAgain.body.credential, undefined);
  assert.equal(disabledAgain.body.data.id, secondId);
  const enabled = await request(app).post(`/api/agent-devices/${secondId}/enable`).set('authorization', manager.authorization).send({}).expect(200);
  assert.equal(enabled.body.data.status, 'active');
  await request(app).post(`/api/me/agent-devices/${secondId}/heartbeat`).set('authorization', member.authorization).set('x-device-credential', secondSecret).send({}).expect(200);
  const unregistered = await request(app).post(`/api/me/agent-devices/${secondId}/unregister`).set('authorization', member.authorization).set('x-device-credential', secondSecret).send({}).expect(200);
  assert.equal(unregistered.body.data.status, 'revoked');
  const afterUnregister = await request(app).post(`/api/me/agent-devices/${secondId}/heartbeat`).set('authorization', member.authorization).set('x-device-credential', secondSecret).send({}).expect(403);
  assert.equal(afterUnregister.body.code, 'DEVICE_REVOKED');
});

test('a device stays inside its employee and organization', async () => {
  const admin = await login('admin@trileez.ir');
  const foreign = await login('admin.org2@trileez.ir');
  const tag = suffix();
  const firstAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'first');
  const secondAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'second');
  const managerAccount = await createAccount(admin.authorization, admin.user.organizationId, 'manager', 'scope');
  const first = await login(firstAccount.email);
  const second = await login(secondAccount.email);
  const manager = await login(managerAccount.email);
  const deviceName = `مرزی ${tag}`;
  const created = await request(app).post('/api/me/agent-devices').set('authorization', first.authorization).send(enrollment(`boundary-${tag}`, deviceName)).expect(201);
  const secret = created.body.credential as string;
  const deviceId = created.body.data.id as string;

  const hidden = await request(app).get(`/api/me/agent-devices/${deviceId}`).set('authorization', second.authorization).expect(404);
  assert.equal(JSON.stringify(hidden.body).includes(deviceName), false);
  assert.equal(JSON.stringify(hidden.body).includes(secret), false);
  const secondList = await request(app).get('/api/me/agent-devices').query({ limit: 100 }).set('authorization', second.authorization).expect(200);
  assert.equal(secondList.body.data.some((row: { id: string }) => row.id === deviceId), false);
  const crossedBeat = await request(app).post(`/api/me/agent-devices/${deviceId}/heartbeat`).set('authorization', second.authorization).set('x-device-credential', secret).send({}).expect(404);
  assert.equal(JSON.stringify(crossedBeat.body).includes(deviceName), false);
  assert.equal(JSON.stringify(crossedBeat.body).includes(secret), false);
  const conflict = await request(app).post('/api/me/agent-devices').set('authorization', second.authorization).send(enrollment(`boundary-${tag}`, `ربوده ${tag}`)).expect(409);
  assert.equal(conflict.body.code, 'DEVICE_INSTALLATION_CONFLICT');
  assert.equal(conflict.body.credential, undefined);
  assert.equal(JSON.stringify(conflict.body).includes(deviceName), false);
  assert.equal(JSON.stringify(conflict.body).includes(deviceId), false);
  assert.equal(JSON.stringify(conflict.body).includes(secret), false);
  await request(app).post(`/api/me/agent-devices/${deviceId}/heartbeat`).set('authorization', first.authorization).set('x-device-credential', secret).send({}).expect(200);

  const own = await request(app).post('/api/me/agent-devices').set('authorization', second.authorization).send(enrollment(`second-${tag}`, `دوم ${tag}`)).expect(201);
  await request(app).get(`/api/me/agent-devices/${own.body.data.id}`).set('authorization', first.authorization).expect(404);
  const visible = await request(app).get('/api/agent-devices').query({ limit: 100 }).set('authorization', manager.authorization).expect(200);
  assert.equal(visible.body.data.some((row: { id: string }) => row.id === deviceId), true);
  const foreignList = await request(app).get('/api/agent-devices').query({ limit: 100 }).set('authorization', foreign.authorization).expect(200);
  assert.equal(foreignList.body.data.some((row: { id: string }) => row.id === deviceId), false);
  assert.equal(JSON.stringify(foreignList.body).includes(deviceName), false);
  const foreignRevoke = await request(app).post(`/api/agent-devices/${deviceId}/revoke`).set('authorization', foreign.authorization).send({}).expect(404);
  assert.equal(JSON.stringify(foreignRevoke.body).includes(deviceName), false);
  const foreignRead = await request(app).get(`/api/me/agent-devices/${deviceId}`).set('authorization', foreign.authorization).expect(404);
  assert.equal(JSON.stringify(foreignRead.body).includes(deviceName), false);
  const still = await request(app).get(`/api/me/agent-devices/${deviceId}`).set('authorization', first.authorization).expect(200);
  assert.equal(still.body.data.status, 'active');
});
