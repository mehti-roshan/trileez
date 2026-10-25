import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initializeDatabase } from '../src/db/database.js';

await initializeDatabase();
const app = createApp();

async function login(email = 'admin@trileez.ir', password = 'Admin123!'): Promise<string> {
  const response = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  return `Bearer ${response.body.token}`;
}

test('list endpoints enforce limits and traverse signed cursors without duplicates', async () => {
  const authorization = await login();
  const suffix = Date.now();
  const prefix = `Cursor ${suffix}`;
  for (const [index, name] of ['Alpha', 'Beta', 'Gamma'].entries()) {
    await request(app).post('/api/employees').set('authorization', authorization).send({
      fullName: `${prefix} ${name}`, personnelCode: `CUR-${suffix}-${index}`, compensationType: 'full_time_attendance',
    }).expect(201);
  }

  const first = await request(app).get('/api/employees').query({ search: prefix, sort: 'fullName', direction: 'asc', limit: 2 }).set('authorization', authorization).expect(200);
  assert.equal(first.body.data.length, 2);
  assert.equal(first.body.page.limit, 2);
  assert.equal(first.body.page.hasMore, true);
  assert.ok(first.body.page.nextCursor);

  const second = await request(app).get('/api/employees').query({ search: prefix, sort: 'fullName', direction: 'asc', limit: 2, cursor: first.body.page.nextCursor }).set('authorization', authorization).expect(200);
  assert.equal(second.body.data.length, 1);
  assert.equal(second.body.page.hasMore, false);
  const ids = [...first.body.data, ...second.body.data].map((row: { id: string }) => row.id);
  assert.equal(new Set(ids).size, 3);

  await request(app).get('/api/employees').query({ limit: 201 }).set('authorization', authorization).expect(400);
  await request(app).get('/api/employees').query({ search: prefix, sort: 'fullName', direction: 'asc', limit: 2, cursor: `${first.body.page.nextCursor}x` }).set('authorization', authorization).expect(400);
  await request(app).get('/api/employees').query({ sort: 'salary' }).set('authorization', authorization).expect(400);
});

test('cursors are organization-bound and filters do not cross workspaces', async () => {
  const primary = await login();
  const secondary = await login('admin.org2@trileez.ir');
  const suffix = Date.now();
  const prefix = `Org cursor ${suffix}`;
  for (let index = 0; index < 2; index += 1) {
    await request(app).post('/api/employees').set('authorization', primary).send({ fullName: `${prefix} ${index}`, personnelCode: `ORG-A-${suffix}-${index}`, compensationType: 'full_time_attendance' }).expect(201);
  }
  await request(app).post('/api/employees').set('authorization', secondary).send({ fullName: `${prefix} secondary`, personnelCode: `ORG-B-${suffix}`, compensationType: 'full_time_attendance' }).expect(201);
  const page = await request(app).get('/api/employees').query({ search: prefix, limit: 1 }).set('authorization', primary).expect(200);
  assert.ok(page.body.page.nextCursor);
  await request(app).get('/api/employees').query({ search: prefix, limit: 1, cursor: page.body.page.nextCursor }).set('authorization', secondary).expect(400);
  const secondaryRows = await request(app).get('/api/employees').query({ search: prefix }).set('authorization', secondary).expect(200);
  assert.deepEqual(secondaryRows.body.data.map((row: { personnelCode: string }) => row.personnelCode), [`ORG-B-${suffix}`]);
});

test('domain filters cover project, task, performance month, meeting date, audit, and files', async () => {
  const authorization = await login();
  const suffix = Date.now();
  const employee = await request(app).post('/api/employees').set('authorization', authorization).send({ fullName: `Filter Employee ${suffix}`, personnelCode: `FLT-${suffix}`, compensationType: 'full_time_attendance' }).expect(201);
  const customer = await request(app).post('/api/data/customers').set('authorization', authorization).send({
    code: `FLT-C-${suffix}`, entityType: 'company', name: `Filter Customer ${suffix}`, company: 'Filter Co', currency: 'IRR',
  }).expect(201);
  const project = await request(app).post('/api/projects').set('authorization', authorization).send({ name: `Filter Project ${suffix}`, code: `FLT-P-${suffix}`, customerId: customer.body.data.id }).expect(201);
  const projectRows = await request(app).get('/api/projects').query({ customerId: customer.body.data.id, search: `Filter Project ${suffix}` }).set('authorization', authorization).expect(200);
  assert.deepEqual(projectRows.body.data.map((row: { id: string }) => row.id), [project.body.data.id]);

  const task = await request(app).post('/api/tasks').set('authorization', authorization).send({ title: `Filter Task ${suffix}`, projectId: project.body.data.id, dueDate: '2026-10-20' }).expect(201);
  const tasks = await request(app).get('/api/tasks').query({ projectId: project.body.data.id, dueFrom: '2026-10-01', dueTo: '2026-10-31' }).set('authorization', authorization).expect(200);
  assert.ok(tasks.body.data.some((row: { id: string }) => row.id === task.body.data.id));
  await request(app).get('/api/tasks').query({ projectId: project.body.data.id, dueFrom: '2026-10-31', dueTo: '2026-10-01' }).set('authorization', authorization).expect(400);

  const adjustment = await request(app).post('/api/performance/events').set('authorization', authorization).send({ employeeId: employee.body.data.id, reason: `Filter reason ${suffix}`, points: 4, date: '2026-09-10' }).expect(201);
  const performance = await request(app).get('/api/performance/events').query({ employeeId: employee.body.data.id, periodKey: adjustment.body.data.periodKey }).set('authorization', authorization).expect(200);
  assert.equal(performance.body.data.length, 1);

  await request(app).post('/api/meetings').set('authorization', authorization).send({ title: `Meeting outside ${suffix}`, startAt: '2026-08-10T10:00:00.000Z', durationMinutes: 30, organizerId: 'u1' }).expect(201);
  const inside = await request(app).post('/api/meetings').set('authorization', authorization).send({ title: `Meeting inside ${suffix}`, startAt: '2026-09-20T10:00:00.000Z', durationMinutes: 30, organizerId: 'u1', projectId: project.body.data.id }).expect(201);
  const meetings = await request(app).get('/api/meetings').query({ projectId: project.body.data.id, from: '2026-09-01', to: '2026-09-30T23:59:59.999Z' }).set('authorization', authorization).expect(200);
  assert.deepEqual(meetings.body.data.map((row: { id: string }) => row.id), [inside.body.data.id]);

  const uploaded = await request(app).post('/api/files').set('authorization', authorization).field('projectId', project.body.data.id).field('name', `Filter file ${suffix}`).attach('file', Buffer.from('filter'), { filename: `filter-${suffix}.txt`, contentType: 'text/plain' }).expect(201);
  const files = await request(app).get('/api/files').query({ projectId: project.body.data.id, search: `Filter file ${suffix}` }).set('authorization', authorization).expect(200);
  assert.deepEqual(files.body.data.map((row: { id: string }) => row.id), [uploaded.body.data.id]);

  const audits = await request(app).get('/api/audit').query({ entityType: 'FileRecord', entityId: uploaded.body.data.id, limit: 1 }).set('authorization', authorization).expect(200);
  assert.equal(audits.body.data.length, 1);
  assert.equal(audits.body.page.limit, 1);
});

test('duplicate, date, relationship, and referenced-delete rules are enforced', async () => {
  const authorization = await login();
  const secondary = await login('admin.org2@trileez.ir');
  const suffix = Date.now();
  await request(app).post('/api/employees').set('authorization', authorization).send({ fullName: `Duplicate A ${suffix}`, personnelCode: `DUP-${suffix}`, compensationType: 'full_time_attendance' }).expect(201);
  await request(app).post('/api/employees').set('authorization', authorization).send({ fullName: `Duplicate B ${suffix}`, personnelCode: `DUP-${suffix}`, compensationType: 'full_time_attendance' }).expect(400);
  await request(app).post('/api/projects').set('authorization', authorization).send({ name: 'Invalid dates', startDate: '2026-10-10', endDate: '2026-10-01' }).expect(400);

  const foreignCustomer = await request(app).post('/api/data/customers').set('authorization', secondary).send({
    code: `FOREIGN-${suffix}`, entityType: 'company', name: 'Foreign customer', company: 'Foreign', currency: 'IRR',
  }).expect(201);
  await request(app).post('/api/projects').set('authorization', authorization).send({ name: 'Cross org project', customerId: foreignCustomer.body.data.id }).expect(400);

  const customer = await request(app).post('/api/data/customers').set('authorization', authorization).send({
    code: `REF-${suffix}`, entityType: 'company', name: 'Referenced customer', company: 'Referenced', currency: 'IRR',
  }).expect(201);
  await request(app).post('/api/projects').set('authorization', authorization).send({ name: `Referenced project ${suffix}`, code: `REF-P-${suffix}`, customerId: customer.body.data.id }).expect(201);
  await request(app).delete(`/api/data/customers/${customer.body.data.id}`).set('authorization', authorization).expect(400);

  await request(app).post('/api/data/invoices').set('authorization', authorization).send({
    number: `INV-DATE-${suffix}`, customerId: customer.body.data.id, amount: 100, issuedAt: '2026-10-20', dueDate: '2026-10-10', items: [],
  }).expect(400);
});
