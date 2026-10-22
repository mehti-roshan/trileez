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
  return Array.isArray(response.body.issues) && response.body.issues.some((issue) => issue.path === path && issue.code === 'unknown_field');
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

function deviceBody(installationId: string, deviceName: string, control: boolean) {
  return {
    installationId,
    deviceName,
    agentVersion: '0.2.0',
    capabilities: control
      ? ['employee-dashboard', 'time-entry', 'attendance-read', 'screen-share', 'remote-control']
      : ['employee-dashboard', 'time-entry', 'attendance-read', 'screen-share'],
    platform: 'Win32NT',
    osDescription: 'Windows test',
  };
}

async function audits(organizationId: string, sessionId: string) {
  const rows = await database.forOrganization(organizationId).list('AuditLog', { entityId: sessionId });
  return rows.filter((row) => row.entityId === sessionId);
}

test('viewing does not grant remote control and input is not a command channel', async () => {
  const admin = await login('admin@trileez.ir');
  const tag = suffix();
  const managerAccount = await createAccount(admin.authorization, admin.user.organizationId, 'manager', 'controlmanager');
  const otherAccount = await createAccount(admin.authorization, admin.user.organizationId, 'manager', 'controlother');
  const memberAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'controlworker');
  const manager = await login(managerAccount.email);
  const other = await login(otherAccount.email);
  const member = await login(memberAccount.email);
  const otherOrg = await login('admin.org2@trileez.ir');
  const employee = await request(app).post('/api/employees').set('authorization', admin.authorization).send({
    fullName: `Worker ${tag}`, personnelCode: `CTL-${tag}`, userId: memberAccount.id, employmentStatus: 'active', compensationType: 'hourly_task',
  }).expect(201);
  const viewOnly = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).send(deviceBody(`view-${tag}`, `مشاهده ${tag}`, false)).expect(201);
  const viewSecret = viewOnly.body.credential as string;
  const viewDevice = viewOnly.body.data.id as string;
  assert.equal(viewOnly.body.data.capabilities.includes('remote-control'), false);
  assert.equal(viewOnly.body.data.capabilities.includes('screen-share'), true);
  const viewSession = await request(app).post(`/api/agent-devices/${viewDevice}/screen-sessions`).set('authorization', manager.authorization).send({}).expect(201);
  const viewId = viewSession.body.data.id as string;
  assert.equal(viewSession.body.data.controlState, 'off');
  assert.equal(viewSession.body.data.inputPlane, 'unavailable');
  assert.equal(viewSession.body.data.permittedCapabilities.includes('remote-control'), false);
  assert.equal(viewSession.body.data.permittedCapabilities.includes('screen-share'), true);
  await request(app).post(`/api/me/agent-devices/${viewDevice}/screen-sessions/${viewId}/accept`).set('authorization', member.authorization).set('x-device-credential', viewSecret).send({}).expect(200);
  const denied = await request(app).post(`/api/agent-screen-sessions/${viewId}/control`).set('authorization', manager.authorization).send({ action: 'request' }).expect(403);
  assert.equal(denied.body.code, 'REMOTE_CONTROL_CAPABILITY');
  const stillView = await request(app).get(`/api/agent-screen-sessions/${viewId}`).set('authorization', manager.authorization).expect(200);
  assert.equal(stillView.body.data.state, 'active');
  assert.equal(stillView.body.data.controlState, 'off');

  const enrolled = await request(app).post('/api/me/agent-devices').set('authorization', member.authorization).send(deviceBody(`control-${tag}`, `کنترل ${tag}`, true)).expect(201);
  const secret = enrolled.body.credential as string;
  const deviceId = enrolled.body.data.id as string;
  assert.equal(enrolled.body.data.capabilities.includes('screen-share'), true);
  assert.equal(enrolled.body.data.capabilities.includes('remote-control'), true);
  const created = await request(app).post(`/api/agent-devices/${deviceId}/screen-sessions`).set('authorization', manager.authorization).send({}).expect(201);
  const sessionId = created.body.data.id as string;
  const opened = (await audits(member.user.organizationId, sessionId)).find((row) => row.action === 'screen.session_requested');
  assert.equal(opened?.metadata && (opened.metadata as { supportUserId?: string }).supportUserId, manager.user.id);
  assert.equal((opened?.metadata as { employeeUserId?: string }).employeeUserId, member.user.id);
  assert.equal((opened?.metadata as { employeeId?: string }).employeeId, employee.body.data.id);
  assert.equal(((opened?.metadata as { permittedCapabilities?: string[] }).permittedCapabilities || []).includes('remote-control'), false);
  await request(app).post(`/api/agent-screen-sessions/${sessionId}/control`).set('authorization', member.authorization).send({ action: 'request' }).expect(403);
  await request(app).post(`/api/agent-screen-sessions/${sessionId}/control`).send({ action: 'request' }).expect(401);
  const foreign = await request(app).post(`/api/agent-screen-sessions/${sessionId}/control`).set('authorization', otherOrg.authorization).send({ action: 'request' }).expect(404);
  assert.equal(foreign.body.error, 'Screen session not found');
  const blocked = await request(app).post(`/api/agent-screen-sessions/${sessionId}/control`).set('authorization', other.authorization).send({ action: 'request' }).expect(403);
  assert.equal(blocked.body.code, 'SCREEN_VIEW_FORBIDDEN');
  const tooSoon = await request(app).post(`/api/agent-screen-sessions/${sessionId}/control`).set('authorization', manager.authorization).send({ action: 'request' }).expect(409);
  assert.equal(tooSoon.body.code, 'SCREEN_NOT_ACTIVE');
  await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${sessionId}/accept`).set('authorization', member.authorization).set('x-device-credential', secret).send({}).expect(200);
  const selfGrant = await request(app).post(`/api/agent-screen-sessions/${sessionId}/control`).set('authorization', manager.authorization).send({ action: 'grant' }).expect(400);
  assert.equal(selfGrant.body.code, 'VALIDATION_ERROR');
  const shellAction = await request(app).post(`/api/agent-screen-sessions/${sessionId}/control`).set('authorization', manager.authorization).send({ action: 'shell' }).expect(400);
  assert.equal(shellAction.body.code, 'VALIDATION_ERROR');
  const requested = await request(app).post(`/api/agent-screen-sessions/${sessionId}/control`).set('authorization', manager.authorization).send({ action: 'request' }).expect(200);
  const grantId = requested.body.data.controlGrantId as string;
  assert.equal(requested.body.data.controlState, 'requested');
  assert.equal(requested.body.data.inputPlane, 'unavailable');
  assert.match(grantId, /^cg-[0-9a-f-]{36}$/);
  assert.equal(requested.body.data.permittedCapabilities.includes('remote-control'), false);
  const repeat = await request(app).post(`/api/agent-screen-sessions/${sessionId}/control`).set('authorization', manager.authorization).send({ action: 'request' }).expect(200);
  assert.equal(repeat.body.data.controlGrantId, grantId);
  await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${sessionId}/control`).set('authorization', member.authorization).send({ action: 'grant', grantId }).expect(401);
  const wrongGrant = await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${sessionId}/control`).set('authorization', member.authorization).set('x-device-credential', secret).send({ action: 'grant', grantId: 'cg-00000000-0000-4000-8000-000000000000' }).expect(409);
  assert.equal(wrongGrant.body.code, 'REMOTE_GRANT_INVALID');
  const granted = await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${sessionId}/control`).set('authorization', member.authorization).set('x-device-credential', secret).send({ action: 'grant', grantId }).expect(200);
  assert.equal(granted.body.data.controlState, 'granted');
  assert.equal(granted.body.data.inputPlane, 'unavailable');
  assert.equal(granted.body.data.permittedCapabilities.includes('screen-share'), true);
  assert.equal(granted.body.data.permittedCapabilities.includes('remote-control'), true);
  assert.equal(typeof granted.body.data.controlExpiresAt, 'string');
  const command = await request(app).post(`/api/agent-screen-sessions/${sessionId}/input`).set('authorization', manager.authorization).send({ grantId, command: 'cmd.exe /c whoami', shell: 'powershell' }).expect(400);
  assert.equal(command.body.code, 'VALIDATION_ERROR');
  assert.equal(hasIssue(command, 'body.command'), true);
  const keys = await request(app).post(`/api/agent-screen-sessions/${sessionId}/input`).set('authorization', manager.authorization).send({ grantId, keys: 'password=hunter2' }).expect(400);
  assert.equal(hasIssue(keys, 'body.keys'), true);
  await request(app).post(`/api/agent-screen-sessions/${sessionId}/shell`).set('authorization', manager.authorization).send({ command: 'cmd.exe' }).expect(404);
  const rejectedInput = await request(app).post(`/api/agent-screen-sessions/${sessionId}/input`).set('authorization', manager.authorization).send({ grantId }).expect(409);
  assert.equal(rejectedInput.body.code, 'REMOTE_INPUT_UNAVAILABLE');
  const kept = await request(app).post(`/api/agent-screen-sessions/${sessionId}/control`).set('authorization', manager.authorization).send({ action: 'request' }).expect(409);
  assert.equal(kept.body.code, 'REMOTE_CONTROL_GRANTED');
  assert.equal(kept.body.data?.controlGrantId, undefined);

  const supportRevoked = await request(app).post(`/api/agent-screen-sessions/${sessionId}/control`).set('authorization', manager.authorization).send({ action: 'revoke' }).expect(200);
  assert.equal(supportRevoked.body.data.controlState, 'revoked');
  assert.equal(supportRevoked.body.data.controlEndReason, 'support_revoke');
  assert.equal(supportRevoked.body.data.permittedCapabilities.includes('remote-control'), false);
  const afterRevoke = await request(app).post(`/api/agent-screen-sessions/${sessionId}/input`).set('authorization', manager.authorization).send({ grantId }).expect(409);
  assert.equal(afterRevoke.body.code, 'REMOTE_CONTROL_REVOKED');
  const again = await request(app).post(`/api/agent-screen-sessions/${sessionId}/control`).set('authorization', manager.authorization).send({ action: 'request' }).expect(200);
  const nextGrant = again.body.data.controlGrantId as string;
  assert.notEqual(nextGrant, grantId);
  const reused = await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${sessionId}/control`).set('authorization', member.authorization).set('x-device-credential', secret).send({ action: 'grant', grantId }).expect(409);
  assert.equal(reused.body.code, 'REMOTE_GRANT_INVALID');
  await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${sessionId}/control`).set('authorization', member.authorization).set('x-device-credential', secret).send({ action: 'grant', grantId: nextGrant }).expect(200);
  await database.forOrganization(member.user.organizationId).update('AgentScreenSession', sessionId, { controlExpiresAt: new Date(Date.now() - 1000).toISOString() });
  const expired = await request(app).post(`/api/agent-screen-sessions/${sessionId}/input`).set('authorization', manager.authorization).send({ grantId: nextGrant }).expect(409);
  assert.equal(expired.body.code, 'REMOTE_CONTROL_EXPIRED');
  const expiredGrant = await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${sessionId}/control`).set('authorization', member.authorization).set('x-device-credential', secret).send({ action: 'grant', grantId: nextGrant }).expect(409);
  assert.equal(expiredGrant.body.code, 'REMOTE_CONTROL_EXPIRED');
  const renewed = await request(app).post(`/api/agent-screen-sessions/${sessionId}/control`).set('authorization', manager.authorization).send({ action: 'request' }).expect(200);
  const liveGrant = renewed.body.data.controlGrantId as string;
  assert.notEqual(liveGrant, nextGrant);
  await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${sessionId}/control`).set('authorization', member.authorization).set('x-device-credential', secret).send({ action: 'grant', grantId: liveGrant }).expect(200);
  await database.forOrganization(member.user.organizationId).update('AgentEnrollment', deviceId, {
    capabilities: ['employee-dashboard', 'time-entry', 'attendance-read', 'screen-share'],
  });
  const capabilityLost = await request(app).post(`/api/agent-screen-sessions/${sessionId}/input`).set('authorization', manager.authorization).send({ grantId: liveGrant }).expect(403);
  assert.equal(capabilityLost.body.code, 'REMOTE_CONTROL_CAPABILITY');
  const stripped = await database.forOrganization(member.user.organizationId).get('AgentScreenSession', sessionId);
  assert.equal(stripped?.controlState, 'revoked');
  assert.equal(stripped?.controlEndReason, 'capability_lost');
  await database.forOrganization(member.user.organizationId).update('AgentEnrollment', deviceId, {
    capabilities: ['employee-dashboard', 'time-entry', 'attendance-read', 'screen-share', 'remote-control'],
  });
  const restored = await request(app).post(`/api/agent-screen-sessions/${sessionId}/control`).set('authorization', manager.authorization).send({ action: 'request' }).expect(200);
  const finalGrant = restored.body.data.controlGrantId as string;
  await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${sessionId}/control`).set('authorization', member.authorization).set('x-device-credential', secret).send({ action: 'grant', grantId: finalGrant }).expect(200);
  const ended = await request(app).post(`/api/me/agent-devices/${deviceId}/screen-sessions/${sessionId}/end`).set('authorization', member.authorization).set('x-device-credential', secret).send({ reason: 'employee_stop' }).expect(200);
  assert.equal(ended.body.data.state, 'ended');
  assert.equal(ended.body.data.endReason, 'employee_stop');
  assert.equal(ended.body.data.controlState, 'revoked');
  assert.equal(ended.body.data.controlEndReason, 'session_ended');
  assert.equal(ended.body.data.permittedCapabilities.includes('remote-control'), false);
  const afterEnd = await request(app).post(`/api/agent-screen-sessions/${sessionId}/input`).set('authorization', manager.authorization).send({ grantId: finalGrant }).expect(409);
  assert.equal(afterEnd.body.code, 'SCREEN_SESSION_ENDED');
  const controlAfterEnd = await request(app).post(`/api/agent-screen-sessions/${sessionId}/control`).set('authorization', manager.authorization).send({ action: 'request' }).expect(409);
  assert.equal(controlAfterEnd.body.code, 'SCREEN_SESSION_ENDED');

  const records = await audits(member.user.organizationId, sessionId);
  const actions = records.map((row) => row.action);
  for (const action of ['screen.session_requested', 'screen.session_started', 'screen.control_requested', 'screen.control_granted', 'screen.control_input_rejected', 'screen.control_revoked', 'screen.control_expired', 'screen.session_ended', 'screen.control_ended']) {
    assert.equal(actions.includes(action), true, action);
  }
  const endedAudit = records.find((row) => row.action === 'screen.control_ended');
  const endedMeta = endedAudit?.metadata as { permittedCapabilities?: string[]; supportUserId?: string; employeeUserId?: string };
  assert.equal(endedMeta.supportUserId, manager.user.id);
  assert.equal(endedMeta.employeeUserId, member.user.id);
  assert.equal(endedMeta.permittedCapabilities?.includes('screen-share'), true);
  assert.equal(endedMeta.permittedCapabilities?.includes('remote-control'), true);
  const serialized = JSON.stringify(records);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes('cmd.exe'), false);
  assert.equal(serialized.includes('powershell'), false);
  assert.equal(serialized.includes('hunter2'), false);
  assert.equal(serialized.includes('credential'), false);
});
