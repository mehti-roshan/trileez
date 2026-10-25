import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { database, initializeDatabase } from '../src/db/database.js';
import { signUserToken, verifyUserToken } from '../src/utils/jwt.js';

await initializeDatabase();
const app = createApp();

async function login(email = 'admin@trileez.ir', password = 'Admin123!') {
  return request(app).post('/api/auth/login').send({ email, password }).expect(200);
}

async function createUser(authorization: string, suffix: string, password = 'Temporary#Pass123') {
  return request(app).post('/api/users').set('authorization', authorization).send({
    name: `Auth User ${suffix}`, email: `auth-${suffix}@example.com`, role: 'member', title: 'Security test', password,
  }).expect(201);
}

test('access tokens expire and refresh tokens rotate into revocable server sessions', async () => {
  const agent = request.agent(app);
  const initial = await agent.post('/api/auth/login').send({ email: 'manager@trileez.ir', password: 'Manager123!' }).expect(200);
  assert.match(initial.headers['set-cookie'][0], /HttpOnly/i);
  assert.match(initial.headers['set-cookie'][0], /SameSite=Strict/i);

  const payload = verifyUserToken(initial.body.token);
  const user = await database.findUserForAuthentication({ id: payload.sub });
  assert.ok(user);
  const expired = signUserToken(user!, payload.sid, '-1s');
  await request(app).get('/api/projects').set('authorization', `Bearer ${expired}`).expect(401);

  const refreshed = await agent.post('/api/auth/refresh').expect(200);
  assert.notEqual(refreshed.body.token, initial.body.token);
  await request(app).get('/api/projects').set('authorization', `Bearer ${initial.body.token}`).expect(401);
  await request(app).get('/api/projects').set('authorization', `Bearer ${refreshed.body.token}`).expect(200);

  await agent.post('/api/auth/logout').set('authorization', `Bearer ${refreshed.body.token}`).expect(204);
  await request(app).get('/api/projects').set('authorization', `Bearer ${refreshed.body.token}`).expect(401);
  await agent.post('/api/auth/refresh').expect(401);
});

test('logout-all revokes every active device session', async () => {
  const first = request.agent(app); const second = request.agent(app);
  const firstLogin = await first.post('/api/auth/login').send({ email: 'member@trileez.ir', password: 'Manager123!' }).expect(200);
  const secondLogin = await second.post('/api/auth/login').send({ email: 'member@trileez.ir', password: 'Manager123!' }).expect(200);
  await first.post('/api/auth/logout-all').set('authorization', `Bearer ${firstLogin.body.token}`).expect(204);
  await request(app).get('/api/projects').set('authorization', `Bearer ${firstLogin.body.token}`).expect(401);
  await request(app).get('/api/projects').set('authorization', `Bearer ${secondLogin.body.token}`).expect(401);
  await second.post('/api/auth/refresh').expect(401);
});

test('temporary admin credentials force a policy-compliant password change', async () => {
  const admin = await login();
  const authorization = `Bearer ${admin.body.token}`;
  const suffix = `forced-${Date.now()}`;
  const created = await createUser(authorization, suffix);
  assert.equal(created.body.data.mustChangePassword, true);

  const temporaryLogin = await login(`auth-${suffix}@example.com`, 'Temporary#Pass123');
  const temporaryAuthorization = `Bearer ${temporaryLogin.body.token}`;
  await request(app).get('/api/projects').set('authorization', temporaryAuthorization).expect(403).expect(({ body }) => {
    assert.equal(body.code, 'PASSWORD_CHANGE_REQUIRED');
  });
  await request(app).post('/api/auth/change-password').set('authorization', temporaryAuthorization).send({
    currentPassword: 'Temporary#Pass123', newPassword: 'weak-password',
  }).expect(400).expect(({ body }) => assert.equal(body.code, 'VALIDATION_ERROR'));

  const changed = await request(app).post('/api/auth/change-password').set('authorization', temporaryAuthorization).send({
    currentPassword: 'Temporary#Pass123', newPassword: 'Changed#Password456',
  }).expect(200);
  assert.equal(changed.body.user.mustChangePassword, false);
  await request(app).get('/api/projects').set('authorization', `Bearer ${changed.body.token}`).expect(200);
  await request(app).get('/api/projects').set('authorization', temporaryAuthorization).expect(401);
  await request(app).post('/api/auth/login').send({ email: `auth-${suffix}@example.com`, password: 'Temporary#Pass123' }).expect(401);

  const adminReset = await request(app).post(`/api/users/${created.body.data.id}/password-reset`).set('authorization', authorization).expect(200);
  assert.equal(adminReset.body.data.oneTime, true);
  await request(app).get('/api/projects').set('authorization', `Bearer ${changed.body.token}`).expect(401);
  const resetLogin = await login(`auth-${suffix}@example.com`, adminReset.body.data.generatedPassword);
  assert.equal(resetLogin.body.user.mustChangePassword, true);
});

test('expiring one-time password reset tokens reset passwords and revoke sessions', async () => {
  const admin = await login();
  const authorization = `Bearer ${admin.body.token}`;
  const suffix = `reset-${Date.now()}`;
  await createUser(authorization, suffix);
  const forcedLogin = await login(`auth-${suffix}@example.com`, 'Temporary#Pass123');
  const changed = await request(app).post('/api/auth/change-password').set('authorization', `Bearer ${forcedLogin.body.token}`).send({
    currentPassword: 'Temporary#Pass123', newPassword: 'Before#Reset789',
  }).expect(200);

  const requested = await request(app).post('/api/auth/password-reset/request').send({ email: `auth-${suffix}@example.com` }).expect(202);
  assert.ok(requested.body.resetToken);
  await request(app).post('/api/auth/password-reset/confirm').send({ token: requested.body.resetToken, newPassword: 'too-weak' }).expect(400);
  await request(app).post('/api/auth/password-reset/confirm').send({ token: requested.body.resetToken, newPassword: 'After#ResetPassword123' }).expect(200);
  await request(app).get('/api/projects').set('authorization', `Bearer ${changed.body.token}`).expect(401);
  await request(app).post('/api/auth/password-reset/confirm').send({ token: requested.body.resetToken, newPassword: 'Another#Password123' }).expect(400);
  await request(app).post('/api/auth/login').send({ email: `auth-${suffix}@example.com`, password: 'Before#Reset789' }).expect(401);
  await login(`auth-${suffix}@example.com`, 'After#ResetPassword123');

  const expiring = await request(app).post('/api/auth/password-reset/request').send({ email: `auth-${suffix}@example.com` }).expect(202);
  const tokenId = String(expiring.body.resetToken).split('.')[0]!;
  await database.forOrganization('org1').update('PasswordResetToken', tokenId, { expiresAt: '2020-01-01T00:00:00.000Z' });
  await request(app).post('/api/auth/password-reset/confirm').send({ token: expiring.body.resetToken, newPassword: 'Expired#Token123' }).expect(400);
});

test('login failures are tracked and repeated brute-force attempts lock the account', async () => {
  const admin = await login();
  const suffix = `lock-${Date.now()}`;
  const created = await createUser(`Bearer ${admin.body.token}`, suffix);
  const email = `auth-${suffix}@example.com`;
  for (let attempt = 1; attempt < 5; attempt += 1) await request(app).post('/api/auth/login').send({ email, password: 'Wrong#Password123' }).expect(401);
  await request(app).post('/api/auth/login').send({ email, password: 'Wrong#Password123' }).expect(429);
  await request(app).post('/api/auth/login').send({ email, password: 'Temporary#Pass123' }).expect(429);
  const stored = await database.forOrganization('org1').get('User', created.body.data.id);
  assert.equal(stored?.failedLoginAttempts, 5);
  assert.ok(Date.parse(String(stored?.lockoutUntil)) > Date.now());
});

test('password-reset requests are rate limited without exposing unknown accounts', async () => {
  const suffix = `limit-${Date.now()}`;
  const email = `unknown-${suffix}@example.com`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await request(app).post('/api/auth/password-reset/request').send({ email }).expect(202);
    assert.deepEqual(response.body, { accepted: true });
  }
  await request(app).post('/api/auth/password-reset/request').send({ email }).expect(429);
});

test('admin user creation enforces the backend password policy', async () => {
  const admin = await login();
  await request(app).post('/api/users').set('authorization', `Bearer ${admin.body.token}`).send({
    name: 'Weak Password User', email: `weak-${Date.now()}@example.com`, role: 'member', title: 'Tester', password: 'password',
  }).expect(400).expect(({ body }) => {
    assert.equal(body.code, 'VALIDATION_ERROR');
    assert.ok(body.issues.some((issue: { code: string }) => issue.code === 'password_policy'));
  });
});
