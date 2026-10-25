import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initializeDatabase, database } from '../src/db/database.js';
import { legacyDatabase } from '../src/db/legacy.js';

await initializeDatabase();
const app = createApp();

async function login(email: string, password = 'Admin123!'): Promise<string> {
  const response = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  return `Bearer ${response.body.token}`;
}

async function createCustomer(authorization: string, id: string, assignedTo = 'u1') {
  return request(app).post('/api/data/customers').set('authorization', authorization).send({
    id, entityType: 'company', name: `Customer ${id}`, company: `Company ${id}`, currency: 'IRR', assignedTo,
  }).expect(201);
}

test('sensitive resources persist in dedicated collections while legacy resources keep working', async () => {
  const authorization = await login('admin@trileez.ir');
  const suffix = Date.now().toString();
  const customerId = `sensitive-customer-${suffix}`;
  const contractId = `sensitive-contract-${suffix}`;
  const invoiceId = `sensitive-invoice-${suffix}`;
  const bankId = `sensitive-bank-${suffix}`;
  const supplierId = `sensitive-supplier-${suffix}`;

  const bulkCustomers = await request(app).post('/api/data/customers/bulk').set('authorization', authorization).send({ items: [
    { id: customerId, entityType: 'company', name: `Customer ${customerId}`, company: `Company ${customerId}`, currency: 'IRR', assignedTo: 'u1' },
  ] }).expect(201);
  assert.equal(bulkCustomers.body.data[0].id, customerId);
  await request(app).post('/api/data/bank-accounts').set('authorization', authorization).send({ id: bankId, bankName: 'بانک تست', label: 'حساب تست', maskedNumber: '****1234', accountType: 'جاری' }).expect(201);
  await request(app).post('/api/data/suppliers').set('authorization', authorization).send({ id: supplierId, name: 'تامین‌کننده تست', type: 'supplier' }).expect(201);
  await request(app).post('/api/data/contracts').set('authorization', authorization).send({ id: contractId, number: `C-${suffix}`, customerId, projectId: 'p1', title: 'Dedicated contract', amount: 1000, startDate: '2026-09-01', endDate: '2027-09-01', ownerId: 'u1', paymentTerms: 'monthly', externalSystem: 'quickbooks-online', syncStatus: 'pending' }).expect(201);
  await request(app).post('/api/data/invoices').set('authorization', authorization).send({ id: invoiceId, number: `I-${suffix}`, customerId, projectId: 'p1', contractId, amount: 1000, issuedAt: '2026-09-01', dueDate: '2026-10-01', items: [] }).expect(201);
  await request(app).post('/api/data/payments').set('authorization', authorization).send({ id: `sensitive-payment-${suffix}`, receiptNumber: `R-${suffix}`, customerId, invoiceId, projectId: 'p1', bankAccountId: bankId, amount: 500, method: 'انتقال بانکی', paidAt: '2026-09-02', reference: 'REF-1' }).expect(201);
  await request(app).post('/api/data/installments').set('authorization', authorization).send({ id: `sensitive-installment-${suffix}`, contractId, invoiceId, customerId, projectId: 'p1', number: 1, dueDate: '2026-10-01', amount: 1000 }).expect(201);
  await request(app).post('/api/data/expenses').set('authorization', authorization).send({ id: `sensitive-expense-${suffix}`, title: 'Expense', category: 'operations', projectId: 'p1', supplierId, bankAccountId: bankId, amount: 200, date: '2026-09-03', paymentMethod: 'cash' }).expect(201);
  await request(app).post('/api/data/project-sales').set('authorization', authorization).send({ id: `sensitive-sale-${suffix}`, projectId: 'p1', customerId, title: 'Sale', amount: 1200, type: 'project', status: 'confirmed', date: '2026-09-04', documentNumber: `S-${suffix}` }).expect(201);
  await request(app).post('/api/data/payroll').set('authorization', authorization).send({ id: `sensitive-payroll-${suffix}`, employeeId: 'e1', month: `1405-07-${suffix}`, periodStart: '2026-09-01', periodEnd: '2026-09-30' }).expect(201);
  await request(app).post('/api/data/employee-contracts').set('authorization', authorization).send({ id: `sensitive-employee-contract-${suffix}`, employeeId: 'e1', type: 'تمام‌وقت', startDate: '2026-01-01', description: 'Employment contract' }).expect(201);
  await request(app).post('/api/data/project-accesses').set('authorization', authorization).send({ id: `sensitive-access-${suffix}`, projectId: 'p1', content: 'Project dashboard', scope: 'project', notes: 'Internal access' }).expect(201);

  const checks = [
    ['customers', 'Customer', customerId], ['contracts', 'Contract', contractId], ['invoices', 'Invoice', invoiceId],
    ['payments', 'Payment', `sensitive-payment-${suffix}`], ['installments', 'Installment', `sensitive-installment-${suffix}`],
    ['expenses', 'Expense', `sensitive-expense-${suffix}`], ['bank-accounts', 'BankAccount', bankId], ['suppliers', 'Supplier', supplierId],
    ['project-sales', 'ProjectSale', `sensitive-sale-${suffix}`], ['payroll', 'PayrollRecord', `sensitive-payroll-${suffix}`],
    ['employee-contracts', 'EmployeeContract', `sensitive-employee-contract-${suffix}`],
    ['project-accesses', 'ProjectAccess', `sensitive-access-${suffix}`],
  ] as const;
  for (const [legacyName, model, id] of checks) {
    assert.ok(await database.forOrganization('org1').get(model, id), `${model} should use its dedicated collection`);
    assert.equal(await legacyDatabase.get('org1', legacyName, id), undefined, `${legacyName} must not use LegacyEntity`);
  }
  assert.equal((await database.forOrganization('org1').get('Contract', contractId))?.externalSystem, 'quickbooks-online');

  const legacyId = `still-legacy-${suffix}`;
  await request(app).post('/api/data/goals').set('authorization', authorization).send({ id: legacyId, title: 'Still on legacy bridge' }).expect(201);
  assert.ok(await legacyDatabase.get('org1', 'goals', legacyId));
});

test('dedicated validation rejects malformed data and protects server-owned financial and audit fields', async () => {
  const authorization = await login('admin@trileez.ir');
  const suffix = Date.now().toString();
  const customerId = `validation-customer-${suffix}`;
  const created = await request(app).post('/api/data/customers').set('authorization', authorization).send({
    id: customerId, entityType: 'company', name: 'Validated customer', company: 'Validated company', currency: 'IRR',
    organizationId: 'org2', createdBy: 'u-org2-admin', unexpected: true,
  }).expect(400);
  assert.ok(created.body.issues.some((issue: { path: string }) => issue.path === 'body.unexpected'));

  const safeCustomer = await request(app).post('/api/data/customers').set('authorization', authorization).send({
    id: customerId, entityType: 'company', name: 'Validated customer', company: 'Validated company', currency: 'IRR',
    organizationId: 'org2', createdBy: 'u-org2-admin',
  }).expect(201);
  assert.equal(safeCustomer.body.data.organizationId, 'org1');
  assert.equal(safeCustomer.body.data.createdBy, 'u1');

  const invoice = await request(app).post('/api/data/invoices').set('authorization', authorization).send({
    id: `validation-invoice-${suffix}`, number: `VI-${suffix}`, customerId, amount: 1000, paidAmount: 900, status: 'paid',
    issuedAt: '2026-09-01', dueDate: '2026-10-01', items: [],
  }).expect(201);
  assert.equal(invoice.body.data.paidAmount, 0);
  assert.equal(invoice.body.data.status, 'draft');
  await request(app).patch(`/api/data/invoices/${invoice.body.data.id}`).set('authorization', authorization).send({ paidAmount: 1000, status: 'paid' }).expect(400);

  const payroll = await request(app).post('/api/data/payroll').set('authorization', authorization).send({
    id: `validation-payroll-${suffix}`, employeeId: 'e1', month: `validation-${suffix}`, periodStart: '2026-10-01', periodEnd: '2026-10-31', baseSalary: 1000,
    overtime: 100, benefits: 50, adjustments: -25, deductions: 75, tax: 50, netSalary: 999999, status: 'paid', paidAt: '2026-10-26',
  }).expect(201);
  assert.equal(payroll.body.data.netSalary, 0);
  assert.equal(payroll.body.data.status, 'draft');
  assert.equal(payroll.body.data.paidAt, undefined);

  const access = await request(app).post('/api/data/project-accesses').set('authorization', authorization).send({
    id: `validation-access-${suffix}`, projectId: 'p1', content: 'Internal', scope: 'project', grantedBy: 'u-org2-admin',
  }).expect(201);
  assert.equal(access.body.data.grantedBy, 'u1');
});

test('dedicated relationship checks and permissions are enforced', async () => {
  const admin = await login('admin@trileez.ir');
  const manager = await login('manager@trileez.ir', 'Manager123!');
  const member = await login('member@trileez.ir', 'Manager123!');
  const suffix = Date.now().toString();

  await request(app).post('/api/data/customers').set('authorization', member).send({ entityType: 'company', name: 'Forbidden', company: 'Forbidden', currency: 'IRR' }).expect(403);
  await request(app).get('/api/data/customers').set('authorization', member).expect(200);
  await createCustomer(manager, `manager-customer-${suffix}`, 'u2');
  await request(app).post('/api/data/payroll').set('authorization', manager).send({ employeeId: 'e1', month: 'forbidden', baseSalary: 1, overtime: 0, benefits: 0, deductions: 0, tax: 0 }).expect(403);

  const orphan = await request(app).post('/api/data/employee-contracts').set('authorization', admin).send({
    employeeId: 'employee-does-not-exist', type: 'تمام‌وقت', startDate: '2026-01-01',
  }).expect(400);
  assert.ok(orphan.body.issues.some((issue: { path: string; location: string }) => issue.path === 'body.employeeId' && issue.location === 'relationship'));
});

test('customer user accounts enforce backend-owned customer relationships', async () => {
  const admin = await login('admin@trileez.ir');
  const suffix = Date.now().toString();
  const createCustomer = (entityType: 'company' | 'person', label: string) => request(app).post('/api/data/customers').set('authorization', admin).send({
    entityType, name: `${label}-${suffix}`, company: `${label}-${suffix}`, currency: 'IRR',
  }).expect(201);
  const company = await createCustomer('company', 'Company');
  const person = await createCustomer('person', 'Person');
  const createAccount = (customerId: string, index: number) => request(app).post('/api/users').set('authorization', admin).send({
    name: `Customer ${index}`, email: `customer-${suffix}-${index}@trileez.test`, role: 'customer', customerId,
    password: `Zx!9qP#4vN${suffix}${index}`,
  });
  await createAccount(company.body.data.id, 1).expect(201);
  await createAccount(company.body.data.id, 2).expect(201);
  await createAccount(person.body.data.id, 3).expect(201);
  await createAccount(person.body.data.id, 4).expect(409);
  await request(app).post('/api/users').set('authorization', admin).send({
    name: 'Invalid member customer link', email: `member-${suffix}@trileez.test`, role: 'member', customerId: company.body.data.id,
    password: `Zx!9qP#4vN${suffix}8`,
  }).expect(400);
});

test('sensitive records are isolated by organization even when IDs collide', async () => {
  const orgA = await login('admin@trileez.ir');
  const orgB = await login('admin.org2@trileez.ir');
  const id = `shared-sensitive-${Date.now()}`;
  await createCustomer(orgA, id, 'u1');
  await createCustomer(orgB, id, 'u-org2-admin');

  const readA = await request(app).get(`/api/data/customers/${id}`).set('authorization', orgA).expect(200);
  const readB = await request(app).get(`/api/data/customers/${id}`).set('authorization', orgB).expect(200);
  assert.equal(readA.body.data.organizationId, 'org1');
  assert.equal(readB.body.data.organizationId, 'org2');

  await request(app).patch(`/api/data/customers/${id}`).set('authorization', orgA).send({ name: 'Organization A only' }).expect(200);
  const unchangedB = await request(app).get(`/api/data/customers/${id}`).set('authorization', orgB).expect(200);
  assert.notEqual(unchangedB.body.data.name, 'Organization A only');
  await request(app).delete(`/api/data/customers/${id}`).set('authorization', orgA).expect(204);
  await request(app).get(`/api/data/customers/${id}`).set('authorization', orgA).expect(404);
  await request(app).get(`/api/data/customers/${id}`).set('authorization', orgB).expect(200);
});

test('create, update, and delete actions emit audit records without sensitive payloads', async () => {
  const authorization = await login('admin@trileez.ir');
  const id = `audit-customer-${Date.now()}`;
  await createCustomer(authorization, id);
  await request(app).patch(`/api/data/customers/${id}`).set('authorization', authorization).send({ name: 'Audited update' }).expect(200);
  await request(app).delete(`/api/data/customers/${id}`).set('authorization', authorization).expect(204);

  const audit = await database.forOrganization('org1').list('AuditLog', { entityType: 'Customer', entityId: id });
  assert.deepEqual(new Set(audit.map((row) => row.action)), new Set(['customers.created', 'customers.updated', 'customers.deleted']));
  assert.ok(audit.every((row) => !JSON.stringify(row.metadata).includes('Customer audit-customer')));
});
