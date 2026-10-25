import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { database, initializeDatabase } from '../src/db/database.js';

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

test('effective project access includes project, role, and direct inheritance with specific revocation overrides', async () => {
  const admin = await login();
  const memberToken = await login('member@trileez.ir', 'Manager123!');
  const suffix = Date.now();
  const project = await request(app).post('/api/projects').set('authorization', admin).send({ name: `Access project ${suffix}` }).expect(201);
  const otherProject = await request(app).post('/api/projects').set('authorization', admin).send({ name: `Other access project ${suffix}` }).expect(201);
  const developer = await request(app).post('/api/data/project-roles').set('authorization', admin).send({
    id: `access-role-${suffix}`, projectId: project.body.data.id, name: 'Developer',
  }).expect(201);
  const otherRole = await request(app).post('/api/data/project-roles').set('authorization', admin).send({
    id: `other-access-role-${suffix}`, projectId: otherProject.body.data.id, name: 'Other role',
  }).expect(201);
  const member = await request(app).post('/api/data/project-members').set('authorization', admin).send({
    id: `access-member-${suffix}`, projectId: project.body.data.id, personId: 'u3', roleIds: [developer.body.data.id], joinedAt: '2026-09-01', status: 'active',
  }).expect(201);
  const otherMember = await request(app).post('/api/data/project-members').set('authorization', admin).send({
    id: `other-access-member-${suffix}`, projectId: otherProject.body.data.id, personId: 'u2', roleIds: [otherRole.body.data.id], joinedAt: '2026-09-01', status: 'active',
  }).expect(201);

  const projectWide = await request(app).post('/api/data/project-accesses').set('authorization', admin).send({
    id: `access-project-${suffix}`, projectId: project.body.data.id, content: 'Project repository', resource: 'repository', permission: 'read', scope: 'project', notes: 'Everyone',
  }).expect(201);
  const roleWide = await request(app).post('/api/data/project-accesses').set('authorization', admin).send({
    id: `access-role-wide-${suffix}`, projectId: project.body.data.id, content: 'Deployment service', resource: 'deployment', permission: 'execute', scope: 'role', roleId: developer.body.data.id,
  }).expect(201);
  const direct = await request(app).post('/api/data/project-accesses').set('authorization', admin).send({
    id: `access-direct-${suffix}`, projectId: project.body.data.id, content: 'Incident console', resource: 'incident-console', permission: 'admin', scope: 'person', projectMemberId: member.body.data.id,
  }).expect(201);
  await request(app).post('/api/data/project-accesses').set('authorization', admin).send({
    id: `access-expired-${suffix}`, projectId: project.body.data.id, content: 'Expired service', resource: 'expired', permission: 'read', scope: 'project',
    startDate: '2026-09-01T00:00:00.000Z', expiryDate: '2026-09-25T00:00:00.000Z',
  }).expect(201);

  const effective = await request(app).get(`/api/data/project-accesses/effective?projectId=${project.body.data.id}&projectMemberId=${member.body.data.id}`).set('authorization', admin).expect(200);
  assert.deepEqual(new Set(effective.body.data.map((item: { resource: string }) => item.resource)), new Set(['repository', 'deployment', 'incident-console']));
  assert.equal(effective.body.data.find((item: { resource: string }) => item.resource === 'repository').inheritedFrom, 'project-wide');
  assert.equal(effective.body.data.find((item: { resource: string }) => item.resource === 'deployment').inheritedFrom, 'role-based');
  assert.equal(effective.body.data.find((item: { resource: string }) => item.resource === 'incident-console').inheritedFrom, 'direct');
  assert.ok(effective.body.data.every((item: { inheritanceReason?: string }) => item.inheritanceReason));

  const selfEffective = await request(app).get(`/api/data/project-accesses/effective?projectId=${project.body.data.id}`).set('authorization', memberToken).expect(200);
  assert.equal(selfEffective.body.member.id, member.body.data.id);
  assert.equal(selfEffective.body.data.length, 3);
  await request(app).get(`/api/data/project-accesses/effective?projectId=${otherProject.body.data.id}&projectMemberId=${otherMember.body.data.id}`).set('authorization', memberToken).expect(403);

  const invalidRole = await request(app).post('/api/data/project-accesses').set('authorization', admin).send({
    projectId: project.body.data.id, content: 'Wrong role', resource: 'wrong', permission: 'read', scope: 'role', roleId: otherRole.body.data.id,
  }).expect(400);
  expectIssue(invalidRole, 'body.roleId');
  const invalidMember = await request(app).post('/api/data/project-accesses').set('authorization', admin).send({
    projectId: project.body.data.id, content: 'Wrong member', resource: 'wrong-person', permission: 'read', scope: 'person', projectMemberId: otherMember.body.data.id,
  }).expect(400);
  expectIssue(invalidMember, 'body.projectMemberId');

  const directRevoke = await request(app).post('/api/data/project-accesses').set('authorization', admin).send({
    id: `access-direct-revoke-${suffix}`, projectId: project.body.data.id, content: 'Repository denied directly', resource: 'repository', permission: 'read',
    scope: 'person', projectMemberId: member.body.data.id, status: 'revoked',
  }).expect(201);
  assert.equal(directRevoke.body.data.status, 'revoked');
  const afterOverride = await request(app).get(`/api/data/project-accesses/effective?projectId=${project.body.data.id}&projectMemberId=${member.body.data.id}`).set('authorization', admin).expect(200);
  assert.ok(!afterOverride.body.data.some((item: { resource: string }) => item.resource === 'repository'));

  await request(app).patch(`/api/data/project-accesses/${roleWide.body.data.id}`).set('authorization', admin).send({ status: 'revoked' }).expect(200);
  const afterRoleRevoke = await request(app).get(`/api/data/project-accesses/effective?projectId=${project.body.data.id}&projectMemberId=${member.body.data.id}`).set('authorization', admin).expect(200);
  assert.deepEqual(afterRoleRevoke.body.data.map((item: { resource: string }) => item.resource), ['incident-console']);

  assert.equal(projectWide.body.data.grantedBy, 'u1');
  assert.equal(direct.body.data.grantedBy, 'u1');
});

test('credential secrets are encrypted at rest, selectively revealed, audited, and blocked after revocation', async () => {
  const admin = await login();
  const memberToken = await login('member@trileez.ir', 'Manager123!');
  const foreign = await login('admin.org2@trileez.ir');
  const suffix = Date.now();
  const project = await request(app).post('/api/projects').set('authorization', admin).send({ name: `Credential project ${suffix}` }).expect(201);
  const member = await request(app).post('/api/data/project-members').set('authorization', admin).send({
    id: `credential-member-${suffix}`, projectId: project.body.data.id, personId: 'u3', roleIds: [], joinedAt: '2026-09-01', status: 'active',
  }).expect(201);
  const plaintext = `TopSecret-${suffix}`;
  const tokenPlaintext = `ApiToken-${suffix}`;
  const access = await request(app).post('/api/data/project-accesses').set('authorization', admin).send({
    id: `credential-access-${suffix}`, projectId: project.body.data.id,
    content: `Production console, username: deployer, password: ${plaintext}, token: ${tokenPlaintext}`, kind: 'credentials', system: 'production-console',
    resource: 'production-console', permission: 'login', username: 'deployer', scope: 'project',
  }).expect(201);
  assert.equal(access.body.data.hasSecret, true);
  assert.ok(String(access.body.data.content).includes('[محفوظ]'));
  assert.equal(access.body.data.secret, undefined);
  assert.equal(access.body.data.secretCiphertext, undefined);

  const stored = await database.forOrganization('org1').get('ProjectAccess', access.body.data.id);
  assert.ok(stored);
  assert.equal(stored!.secret, undefined);
  assert.notEqual(stored!.secretCiphertext, plaintext);
  assert.ok(typeof stored!.secretCiphertext === 'string' && stored!.secretCiphertext.length > 20);
  assert.ok(!JSON.stringify(stored).includes(plaintext));
  assert.ok(!JSON.stringify(stored).includes(tokenPlaintext));

  const list = await request(app).get('/api/data/project-accesses').set('authorization', admin).expect(200);
  const listed = list.body.data.find((item: { id: string }) => item.id === access.body.data.id);
  assert.equal(listed.secretCiphertext, undefined);
  assert.equal(listed.secretIv, undefined);
  assert.equal(listed.secretTag, undefined);

  const reveal = await request(app).post(`/api/data/project-accesses/${access.body.data.id}/secret/reveal`).set('authorization', memberToken).send({ reason: 'Deploy approved release' }).expect(200);
  assert.equal(reveal.body.data.secret, `password: ${plaintext}\ntoken: ${tokenPlaintext}`);
  assert.equal(reveal.body.data.oneTime, true);
  await request(app).post(`/api/data/project-accesses/${access.body.data.id}/secret/reveal`).set('authorization', foreign).send({ reason: 'Cross organization attempt' }).expect(403);

  await request(app).patch(`/api/data/project-accesses/${access.body.data.id}`).set('authorization', admin).send({ status: 'revoked' }).expect(200);
  const effective = await request(app).get(`/api/data/project-accesses/effective?projectId=${project.body.data.id}&projectMemberId=${member.body.data.id}`).set('authorization', admin).expect(200);
  assert.ok(!effective.body.data.some((item: { id: string }) => item.id === access.body.data.id));
  await request(app).post(`/api/data/project-accesses/${access.body.data.id}/secret/reveal`).set('authorization', memberToken).send({ reason: 'Attempt after revocation' }).expect(403);
  await request(app).post(`/api/data/project-accesses/${access.body.data.id}/secret/reveal`).set('authorization', admin).send({ reason: 'Management attempt after revocation' }).expect(403);

  const audit = await request(app).get(`/api/data/project-accesses/${access.body.data.id}/audit`).set('authorization', admin).expect(200);
  assert.ok(audit.body.data.some((entry: { action: string }) => entry.action === 'project-accesses.secret-revealed'));
  assert.ok(audit.body.data.some((entry: { action: string }) => entry.action === 'project-accesses.revoked'));
  assert.ok(!JSON.stringify(audit.body.data).includes(plaintext));
  assert.ok(!JSON.stringify(audit.body.data).includes(tokenPlaintext));
  await request(app).delete(`/api/data/project-accesses/${access.body.data.id}`).set('authorization', admin).expect(204);
  const retained = await request(app).get(`/api/data/project-accesses/${access.body.data.id}`).set('authorization', admin).expect(200);
  assert.equal(retained.body.data.status, 'revoked');
});
