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

async function login(email: string): Promise<{ authorization: string; user: { id: string; organizationId: string } }> {
  const response = await request(app).post('/api/auth/login').send({ email, password: email === 'admin@trileez.ir' ? 'Admin123!' : password }).expect(200);
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

async function createEmployee(authorization: string, input: Record<string, unknown>) {
  const response = await request(app).post('/api/employees').set('authorization', authorization).send({
    compensationType: 'hourly_task', employmentStatus: 'active', ...input,
  }).expect(201);
  return response.body.data as { id: string; userId?: string; fullName: string };
}

async function memberPersonIds(authorization: string, projectId: string): Promise<string[]> {
  const response = await request(app).get('/api/data/project-members').set('authorization', authorization).query({ projectId, limit: 100 }).expect(200);
  return response.body.data.map((member: { personId: string }) => member.personId);
}

async function projectsWithCode(authorization: string, code: string) {
  const response = await request(app).get('/api/projects').set('authorization', authorization).query({ search: code, limit: 50 }).expect(200);
  return response.body.data.filter((project: { code?: string }) => project.code === code);
}

test('the authenticated user and other eligible members can be assigned with one stable id', async () => {
  const admin = await login('admin@trileez.ir');
  const tag = suffix();
  const actorAccount = await createAccount(admin.authorization, admin.user.organizationId, 'manager', 'current');
  const otherAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'other');
  const outsiderAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'outsider');
  const actorEmployee = await createEmployee(admin.authorization, { fullName: `Current ${tag}`, personnelCode: `CUR-${tag}`, userId: actorAccount.id });
  const otherEmployee = await createEmployee(admin.authorization, { fullName: `Other ${tag}`, personnelCode: `OTH-${tag}`, userId: otherAccount.id });
  const loneEmployee = await createEmployee(admin.authorization, { fullName: `Lone ${tag}`, personnelCode: `LON-${tag}` });
  await createEmployee(admin.authorization, { fullName: `Outside ${tag}`, personnelCode: `OUT-${tag}`, userId: outsiderAccount.id });
  const actor = await login(actorAccount.email);

  const created = await request(app).post('/api/projects').set('authorization', actor.authorization).send({
    name: `Assignment ${tag}`, code: `ASN-${tag}`, startDate: '2026-09-01', endDate: '2026-12-31', managerId: actor.user.id,
    initialMembers: [actorEmployee.id, actor.user.id, otherEmployee.id, loneEmployee.id],
  }).expect(201);
  const projectId = created.body.data.id as string;
  const expectedPeople = [actor.user.id, otherAccount.id, loneEmployee.id].sort();
  assert.deepEqual([...created.body.data.members].sort(), expectedPeople);
  const memberships = await request(app).get('/api/data/project-members').set('authorization', actor.authorization).query({ projectId, limit: 100 }).expect(200);
  assert.equal(memberships.body.data.length, 3);
  assert.deepEqual(memberships.body.data.map((member: { personId: string }) => member.personId).sort(), expectedPeople);
  const refreshed = await request(app).get(`/api/projects/${projectId}`).set('authorization', actor.authorization).expect(200);
  assert.deepEqual([...refreshed.body.data.members].sort(), expectedPeople);
  const refreshedMembers = await memberPersonIds(actor.authorization, projectId);
  assert.deepEqual([...refreshedMembers].sort(), expectedPeople);

  const actorMembership = memberships.body.data.find((member: { personId: string }) => member.personId === actor.user.id);
  const selfAssigned = await request(app).post('/api/tasks').set('authorization', actor.authorization).send({
    title: `Current user ${tag}`, projectId, assigneeId: actorEmployee.id, status: 'todo',
  }).expect(201);
  assert.equal(selfAssigned.body.data.assigneeId, actor.user.id);
  assert.deepEqual(selfAssigned.body.data.assigneeIds, [actor.user.id]);
  assert.deepEqual(selfAssigned.body.data.assigneeMemberIds, [actorMembership.id]);
  const selfStored = await request(app).get(`/api/tasks/${selfAssigned.body.data.id}`).set('authorization', actor.authorization).expect(200);
  assert.equal(selfStored.body.data.assigneeId, actor.user.id);
  assert.deepEqual(selfStored.body.data.assigneeIds, [actor.user.id]);

  const otherAssigned = await request(app).post('/api/tasks').set('authorization', actor.authorization).send({
    title: `Other member ${tag}`, projectId, assigneeId: otherAccount.id, assigneeIds: [otherEmployee.id], status: 'todo',
  }).expect(201);
  assert.equal(otherAssigned.body.data.assigneeId, otherAccount.id);
  assert.deepEqual(otherAssigned.body.data.assigneeIds, [otherAccount.id]);
  const otherStored = await request(app).get(`/api/tasks/${otherAssigned.body.data.id}`).set('authorization', actor.authorization).expect(200);
  assert.equal(otherStored.body.data.assigneeId, otherAccount.id);

  const rejected = await request(app).post('/api/tasks').set('authorization', actor.authorization).send({
    title: `Outsider ${tag}`, projectId, assigneeId: outsiderAccount.id, status: 'todo',
  }).expect(400);
  assert.equal(rejected.body.error, 'Validation failed');
  assert.ok(rejected.body.issues.some((issue: { path: string }) => issue.path === 'body.assigneeIds'));
  assert.equal(otherStored.body.data.assigneeId, otherAccount.id);
  const stillOther = await request(app).get(`/api/tasks/${otherAssigned.body.data.id}`).set('authorization', actor.authorization).expect(200);
  assert.equal(stillOther.body.data.assigneeId, otherAccount.id);
  assert.equal((await projectsWithCode(actor.authorization, `ASN-${tag}`)).length, 1);
});

test('invalid employees and unauthorized membership assignments are rejected without leaving a project', async () => {
  const admin = await login('admin@trileez.ir');
  const tag = suffix();
  const actorAccount = await createAccount(admin.authorization, admin.user.organizationId, 'manager', 'owner');
  const limitedAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'limited');
  const unlinkedAccount = await createAccount(admin.authorization, admin.user.organizationId, 'member', 'unlinked');
  const validEmployee = await createEmployee(admin.authorization, { fullName: `Valid ${tag}`, personnelCode: `VAL-${tag}`, userId: actorAccount.id });
  const inactiveEmployee = await createEmployee(admin.authorization, { fullName: `Inactive ${tag}`, personnelCode: `INA-${tag}`, employmentStatus: 'terminated' });
  const actor = await login(actorAccount.email);
  const limited = await login(limitedAccount.email);
  const before = await request(app).get('/api/data/project-members').set('authorization', actor.authorization).query({ personId: actor.user.id, limit: 100 }).expect(200);

  const unknownCode = `UNK-${tag}`;
  const unknown = await request(app).post('/api/projects').set('authorization', actor.authorization).send({
    name: `Unknown member ${tag}`, code: unknownCode, startDate: '2026-09-01', endDate: '2026-12-31',
    initialMembers: [validEmployee.id, `missing-${tag}`],
  }).expect(400);
  assert.equal(unknown.body.error, 'Validation failed');
  assert.equal(unknown.body.code, 'VALIDATION_ERROR');
  assert.ok(unknown.body.issues.some((issue: { path: string }) => issue.path === 'body.initialMembers'));
  assert.equal((await projectsWithCode(actor.authorization, unknownCode)).length, 0);

  const inactiveCode = `INA-${tag}`;
  const inactive = await request(app).post('/api/projects').set('authorization', actor.authorization).send({
    name: `Inactive member ${tag}`, code: inactiveCode, startDate: '2026-09-01', endDate: '2026-12-31',
    initialMembers: [validEmployee.id, inactiveEmployee.id],
  }).expect(400);
  assert.ok(inactive.body.issues.some((issue: { path: string; message: string }) => issue.path === 'body.initialMembers' && issue.message.length > 0));
  assert.equal((await projectsWithCode(actor.authorization, inactiveCode)).length, 0);

  const unlinkedCode = `NEM-${tag}`;
  const unlinked = await request(app).post('/api/projects').set('authorization', actor.authorization).send({
    name: `No employee ${tag}`, code: unlinkedCode, startDate: '2026-09-01', endDate: '2026-12-31',
    initialMembers: [unlinkedAccount.id],
  }).expect(400);
  assert.ok(unlinked.body.issues.some((issue: { path: string }) => issue.path === 'body.initialMembers'));
  assert.equal((await projectsWithCode(actor.authorization, unlinkedCode)).length, 0);

  const after = await request(app).get('/api/data/project-members').set('authorization', actor.authorization).query({ personId: actor.user.id, limit: 100 }).expect(200);
  assert.equal(after.body.data.length, before.body.data.length);

  const deniedCode = `DEN-${tag}`;
  const denied = await request(app).post('/api/projects').set('authorization', limited.authorization).send({
    name: `Denied ${tag}`, code: deniedCode, initialMembers: [validEmployee.id],
  }).expect(403);
  assert.equal(denied.body.resource, 'projects');
  assert.equal(denied.body.action, 'create');
  assert.equal((await projectsWithCode(admin.authorization, deniedCode)).length, 0);

  const existing = await request(app).post('/api/projects').set('authorization', actor.authorization).send({
    name: `Existing ${tag}`, code: `EX-${tag}`, startDate: '2026-09-01', endDate: '2026-12-31',
  }).expect(201);
  const direct = await request(app).post('/api/data/project-members').set('authorization', limited.authorization).send({
    projectId: existing.body.data.id, personId: actor.user.id, joinedAt: '2026-09-01', status: 'active',
  }).expect(403);
  assert.equal(direct.body.resource, 'project-members');
  assert.deepEqual(await memberPersonIds(actor.authorization, existing.body.data.id), []);
});
