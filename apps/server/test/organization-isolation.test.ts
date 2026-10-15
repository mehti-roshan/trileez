import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initializeDatabase } from '../src/db/database.js';

await initializeDatabase();
const app = createApp();

async function login(email: string, password = 'Admin123!'): Promise<string> {
  const response = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  assert.ok(response.body.token);
  return `Bearer ${response.body.token}`;
}

const organizationA = 'org1';
const organizationB = 'org2';

test('dedicated resources derive organization from the authenticated user and hide foreign IDs', async () => {
  const orgA = await login('admin@trileez.ir');
  const orgB = await login('admin.org2@trileez.ir');

  const createdByB = await request(app)
    .post(`/api/projects?organizationId=${organizationA}`)
    .set('authorization', orgB)
    .set('x-organization-id', organizationA)
    .send({ name: 'Organization B project', organizationId: organizationA })
    .expect(201);
  assert.equal(createdByB.body.data.organizationId, organizationB);
  const foreignId = createdByB.body.data.id as string;

  const orgAList = await request(app).get('/api/projects').set('authorization', orgA).expect(200);
  assert.ok(!orgAList.body.data.some((row: { id: string }) => row.id === foreignId));
  await request(app).get(`/api/projects/${foreignId}`).set('authorization', orgA).expect(404);
  await request(app).patch(`/api/projects/${foreignId}`).set('authorization', orgA).send({ name: 'cross-org update', organizationId: organizationA }).expect(404);
  await request(app).delete(`/api/projects/${foreignId}`).set('authorization', orgA).expect(404);

  const stillOwnedByB = await request(app).get(`/api/projects/${foreignId}`).set('authorization', orgB).expect(200);
  assert.equal(stillOwnedByB.body.data.name, 'Organization B project');
  assert.equal(stillOwnedByB.body.data.organizationId, organizationB);

  const createdByA = await request(app)
    .post('/api/projects')
    .set('authorization', orgA)
    .send({ name: 'Organization A project', organizationId: organizationB })
    .expect(201);
  assert.equal(createdByA.body.data.organizationId, organizationA);

  const attemptedMove = await request(app)
    .patch(`/api/projects/${createdByA.body.data.id}`)
    .set('authorization', orgA)
    .send({ organizationId: organizationB, name: 'Still organization A' })
    .expect(200);
  assert.equal(attemptedMove.body.data.organizationId, organizationA);

  await request(app).delete(`/api/projects/${foreignId}`).set('authorization', orgB).expect(204);
  await request(app).delete(`/api/projects/${createdByA.body.data.id}`).set('authorization', orgA).expect(204);
});

test('legacy resources isolate list, read, update and delete even when record IDs collide', async () => {
  const orgA = await login('admin@trileez.ir');
  const orgB = await login('admin.org2@trileez.ir');
  const sharedId = `shared-goal-${Date.now()}`;

  const recordA = await request(app)
    .post('/api/data/goals')
    .set('authorization', orgA)
    .send({ id: sharedId, title: 'Organization A goal', organizationId: organizationB })
    .expect(201);
  const recordB = await request(app)
    .post('/api/data/goals')
    .set('authorization', orgB)
    .send({ id: sharedId, title: 'Organization B goal', organizationId: organizationA })
    .expect(201);
  assert.equal(recordA.body.data.organizationId, organizationA);
  assert.equal(recordB.body.data.organizationId, organizationB);

  const readA = await request(app).get(`/api/data/goals/${sharedId}`).set('authorization', orgA).expect(200);
  const readB = await request(app).get(`/api/data/goals/${sharedId}`).set('authorization', orgB).expect(200);
  assert.equal(readA.body.data.title, 'Organization A goal');
  assert.equal(readB.body.data.title, 'Organization B goal');

  await request(app)
    .patch(`/api/data/goals/${sharedId}`)
    .set('authorization', orgA)
    .send({ title: 'Organization A updated', organizationId: organizationB })
    .expect(200);
  const unchangedB = await request(app).get(`/api/data/goals/${sharedId}`).set('authorization', orgB).expect(200);
  assert.equal(unchangedB.body.data.title, 'Organization B goal');
  assert.equal(unchangedB.body.data.organizationId, organizationB);

  await request(app).delete(`/api/data/goals/${sharedId}`).set('authorization', orgA).expect(204);
  await request(app).get(`/api/data/goals/${sharedId}`).set('authorization', orgA).expect(404);
  await request(app).get(`/api/data/goals/${sharedId}`).set('authorization', orgB).expect(200);
  await request(app).delete(`/api/data/goals/${sharedId}`).set('authorization', orgB).expect(204);
});

test('user administration and dashboard data remain inside the authenticated organization', async () => {
  const orgA = await login('admin@trileez.ir');
  const orgB = await login('admin.org2@trileez.ir');

  const usersA = await request(app).get('/api/users').set('authorization', orgA).expect(200);
  assert.ok(!usersA.body.data.some((user: { id: string }) => user.id === 'u-org2-admin'));
  const usersB = await request(app).get('/api/users').set('authorization', orgB).expect(200);
  assert.ok(usersB.body.data.some((user: { id: string }) => user.id === 'u-org2-admin'));

  await request(app).patch('/api/users/u-org2-admin').set('authorization', orgA).send({ title: 'Compromised' }).expect(404);
  await request(app).post('/api/users/u-org2-admin/password-reset').set('authorization', orgA).expect(404);

  const summaryABefore = await request(app).get('/api/dashboard/summary').set('authorization', orgA).expect(200);
  const summaryBBefore = await request(app).get('/api/dashboard/summary').set('authorization', orgB).expect(200);
  const employee = await request(app)
    .post('/api/employees')
    .set('authorization', orgB)
    .send({ fullName: 'کارمند سازمان دوم', personnelCode: `ORG2-${Date.now()}`, compensationType: 'full_time_attendance', organizationId: organizationA })
    .expect(201);
  assert.equal(employee.body.data.organizationId, organizationB);

  const summaryAAfter = await request(app).get('/api/dashboard/summary').set('authorization', orgA).expect(200);
  const summaryBAfter = await request(app).get('/api/dashboard/summary').set('authorization', orgB).expect(200);
  assert.equal(summaryAAfter.body.data.employees, summaryABefore.body.data.employees);
  assert.equal(summaryBAfter.body.data.employees, summaryBBefore.body.data.employees + 1);

  await request(app).delete(`/api/employees/${employee.body.data.id}`).set('authorization', orgA).expect(404);
  await request(app).delete(`/api/employees/${employee.body.data.id}`).set('authorization', orgB).expect(204);
});

test('file metadata and content cannot be reached or mutated across organizations', async () => {
  const orgA = await login('admin@trileez.ir');
  const orgB = await login('admin.org2@trileez.ir');

  const uploaded = await request(app)
    .post('/api/files')
    .set('authorization', orgB)
    .field('organizationId', organizationA)
    .attach('file', Buffer.from('organization B secret'), { filename: 'org-b.txt', contentType: 'text/plain' })
    .expect(201);
  const fileId = uploaded.body.data.id as string;
  assert.equal(uploaded.body.data.organizationId, organizationB);
  assert.ok(String(uploaded.body.data.objectKey).startsWith(`${organizationB}/`));

  const filesA = await request(app).get('/api/files').set('authorization', orgA).expect(200);
  assert.ok(!filesA.body.data.some((file: { id: string }) => file.id === fileId));
  await request(app).get(`/api/files/${fileId}`).set('authorization', orgA).expect(404);
  await request(app).get(`/api/files/${fileId}/content`).set('authorization', orgA).expect(404);
  await request(app).patch(`/api/files/${fileId}`).set('authorization', orgA).send({ name: 'stolen.txt' }).expect(404);
  await request(app).delete(`/api/files/${fileId}`).set('authorization', orgA).expect(404);

  const content = await request(app).get(`/api/files/${fileId}/content`).set('authorization', orgB).expect(200);
  assert.equal(content.text, 'organization B secret');
  await request(app).delete(`/api/files/${fileId}`).set('authorization', orgB).expect(204);
});
