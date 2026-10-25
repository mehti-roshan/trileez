import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initializeDatabase } from '../src/db/database.js';

await initializeDatabase();
const app = createApp();

async function login(email: string, password: string): Promise<string> {
  const response = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  assert.ok(response.body.token);
  return `Bearer ${response.body.token}`;
}

test('protected resources reject unauthenticated reads and mutations', async () => {
  await request(app).get('/api/employees').expect(401);
  await request(app).post('/api/projects').send({ name: 'unauthorized project' }).expect(401);
  await request(app).post('/api/data/goals').send({ title: 'unauthorized goal' }).expect(401);
});

test('a valid JWT does not grant actions missing from the server-owned policy', async () => {
  const member = await login('member@trileez.ir', 'Manager123!');

  const employeeRead = await request(app).get('/api/employees').set('authorization', member).expect(403);
  assert.equal(employeeRead.body.resource, 'employees');
  assert.equal(employeeRead.body.action, 'read');

  const projectCreate = await request(app)
    .post('/api/projects')
    .set('authorization', member)
    .send({ name: 'member must not create this project' })
    .expect(403);
  assert.equal(projectCreate.body.resource, 'projects');
  assert.equal(projectCreate.body.action, 'create');

  await request(app).get('/api/data/payroll').set('authorization', member).expect(403);
});

test('authorized roles retain access to dedicated backend resources', async () => {
  const manager = await login('manager@trileez.ir', 'Manager123!');
  const member = await login('member@trileez.ir', 'Manager123!');

  await request(app).get('/api/employees').set('authorization', manager).expect(200);

  const project = await request(app)
    .post('/api/projects')
    .set('authorization', manager)
    .send({ name: `Authorized project ${Date.now()}` })
    .expect(201);
  assert.equal(project.body.data.createdBy, 'u2');

  await request(app).get('/api/projects').set('authorization', member).expect(200);

  const task = await request(app)
    .post('/api/tasks')
    .set('authorization', member)
    .send({ title: 'Authorized member task', projectId: project.body.data.id, createdBy: 'u1' })
    .expect(201);
  assert.equal(task.body.data.createdBy, 'u3');
});

test('legacy resource policy distinguishes read, create, update and delete', async () => {
  const admin = await login('admin@trileez.ir', 'Admin123!');
  const manager = await login('manager@trileez.ir', 'Manager123!');
  const member = await login('member@trileez.ir', 'Manager123!');
  const recordId = `authorization-goal-${Date.now()}`;

  const created = await request(app)
    .post('/api/data/goals')
    .set('authorization', manager)
    .send({ id: recordId, title: 'Manager-created goal', createdBy: 'u1' })
    .expect(201);
  assert.equal(created.body.data.createdBy, 'u2');

  await request(app).get(`/api/data/goals/${recordId}`).set('authorization', member).expect(200);

  const deniedCreate = await request(app)
    .post('/api/data/goals')
    .set('authorization', member)
    .send({ title: 'forbidden create' })
    .expect(403);
  assert.equal(deniedCreate.body.action, 'create');

  const deniedUpdate = await request(app)
    .patch(`/api/data/goals/${recordId}`)
    .set('authorization', member)
    .send({ title: 'forbidden update' })
    .expect(403);
  assert.equal(deniedUpdate.body.action, 'update');

  const deniedDelete = await request(app)
    .delete(`/api/data/goals/${recordId}`)
    .set('authorization', member)
    .expect(403);
  assert.equal(deniedDelete.body.action, 'delete');

  await request(app)
    .patch(`/api/data/goals/${recordId}`)
    .set('authorization', manager)
    .send({ title: 'Authorized update' })
    .expect(200);
  await request(app).delete(`/api/data/goals/${recordId}`).set('authorization', admin).expect(204);
});

test('client-supplied role and permissions cannot elevate a forbidden request', async () => {
  const member = await login('member@trileez.ir', 'Manager123!');

  await request(app)
    .post('/api/data/payroll')
    .set('authorization', member)
    .send({
      employeeId: 'e2',
      role: 'admin',
      permissions: ['finance:pay', 'hr:manage-users'],
      permissionOverrides: { additions: ['finance:pay'], removals: [] },
    })
    .expect(403);
});

test('unregistered legacy resources are rejected instead of becoming open CRUD stores', async () => {
  const admin = await login('admin@trileez.ir', 'Admin123!');
  const unknown = `unregistered-${Date.now()}`;

  await request(app).get(`/api/data/${unknown}`).set('authorization', admin).expect(404);
  await request(app).post(`/api/data/${unknown}`).set('authorization', admin).send({ value: true }).expect(404);
});
