import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { database, initializeDatabase } from '../src/db/database.js';
import { hashPassword } from '../src/utils/password.js';

await initializeDatabase();
const app = createApp();

async function login(email: string, password: string): Promise<string> {
  const response = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  return `Bearer ${response.body.token}`;
}

test('every audited business surface rejects an unauthenticated request', async () => {
  const paths = [
    '/api/users', '/api/employees', '/api/projects', '/api/tasks', '/api/meetings', '/api/project-events',
    '/api/performance/events', '/api/performance/periods', '/api/dashboard/summary', '/api/files', '/api/audit',
    '/api/jobs', '/api/data/customers', '/api/data/invoices', '/api/data/payroll', '/api/data/employee-contracts',
    '/api/data/documents-v2', '/api/data/project-accesses', '/api/data/project-accesses/effective?projectId=p1',
  ];
  for (const path of paths) {
    const response = await request(app).get(path);
    assert.equal(response.status, 401, `${path} returned ${response.status}`);
  }
});

test('external customer accounts cannot enumerate organization-wide unscoped resources', async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const customer = await database.forOrganization('org1').create('Customer', {
    id: `audit-customer-${suffix}`, entityType: 'company', name: 'Audit customer', company: 'Audit customer', currency: 'IRR', status: 'active', createdBy: 'u1',
  });
  const email = `external-audit-${suffix}@example.com`;
  const password = 'External#Audit9876';
  await database.forOrganization('org1').create('User', {
    name: 'External audit user', email, role: 'customer', customerId: customer.id, status: 'offline', isActive: true,
    title: 'Customer', passwordHash: await hashPassword(password), permissionOverrides: { additions: [], removals: [] },
  });
  const authorization = await login(email, password);
  const denied = [
    '/api/dashboard/summary', '/api/users', '/api/projects', '/api/tasks', '/api/meetings', '/api/project-events',
    '/api/data/notifications', '/api/data/tickets', '/api/data/documents-v2', '/api/data/customers',
  ];
  for (const path of denied) {
    const response = await request(app).get(path).set('authorization', authorization);
    assert.equal(response.status, 403, `${path} returned ${response.status}`);
  }
  await request(app).get('/api/files').set('authorization', authorization).expect(200);
});

test('non-members cannot use effective project access as a project-existence oracle', async () => {
  const admin = await login('admin@trileez.ir', 'Admin123!');
  const member = await login('member@trileez.ir', 'Manager123!');
  const project = await request(app).post('/api/projects').set('authorization', admin).send({ name: `Unrelated access project ${Date.now()}` }).expect(201);
  await request(app)
    .get(`/api/data/project-accesses/effective?projectId=${project.body.data.id}`)
    .set('authorization', member)
    .expect(403);
});
