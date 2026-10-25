import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { database, initializeDatabase } from '../src/db/database.js';

await initializeDatabase();
const app = createApp();

async function login(email: string, password: string): Promise<string> {
  const response = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  return `Bearer ${response.body.token}`;
}

async function createEmployee(authorization: string, label: string): Promise<string> {
  const response = await request(app).post('/api/employees').set('authorization', authorization).send({
    fullName: `Performance ${label}`, personnelCode: `PERF-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, compensationType: 'full_time_attendance',
  }).expect(201);
  return response.body.data.id as string;
}

function adjustment(authorization: string, employeeId: string, points: number, date: string, reason = 'Performance adjustment') {
  return request(app).post('/api/performance/events').set('authorization', authorization).send({
    employeeId, points, date, reason, category: points > 0 ? 'exceptional-work' : 'missed-commitment', description: `${reason} notes`,
  });
}

test('positive and negative adjustments create an authoritative monthly period and audit history', async () => {
  const admin = await login('admin@trileez.ir', 'Admin123!');
  const employeeId = await createEmployee(admin, 'adjustments');
  const positive = await adjustment(admin, employeeId, 12, '2026-09-05', 'Exceptional delivery').expect(201);
  assert.equal(positive.body.data.points, 12);
  assert.equal(positive.body.data.createdBy, 'u1');
  assert.equal(positive.body.data.category, 'exceptional-work');
  assert.equal(positive.body.period.score, 82);
  const negative = await adjustment(admin, employeeId, -7, '2026-09-08', 'Missed commitment').expect(201);
  assert.equal(negative.body.period.baselineScore, 70);
  assert.equal(negative.body.period.adjustmentTotal, 5);
  assert.equal(negative.body.period.score, 75);
  assert.equal(negative.body.period.status, 'open');
  assert.equal(negative.body.period.eventIds.length, 2);

  const audit = await database.forOrganization('org1').list('AuditLog', { entityType: 'PerformanceEvent' });
  assert.ok(audit.filter((row) => row.metadata && (row.metadata as Record<string, unknown>).employeeId === employeeId).length >= 2);
});

test('monthly calculation carries only the previous finalized score into the next Persian month', async () => {
  const admin = await login('admin@trileez.ir', 'Admin123!');
  const employeeId = await createEmployee(admin, 'monthly');
  await adjustment(admin, employeeId, 10, '2026-09-05').expect(201);
  const first = await request(app).post('/api/performance/periods/finalize').set('authorization', admin).send({ employeeId, period: '2026-09-05', notes: 'First month' }).expect(201);
  assert.equal(first.body.data.score, 80);
  assert.equal(first.body.data.status, 'finalized');

  const secondAdjustment = await adjustment(admin, employeeId, 5, '2026-09-25').expect(201);
  assert.equal(secondAdjustment.body.period.baselineScore, 80);
  assert.equal(secondAdjustment.body.period.adjustmentTotal, 5);
  assert.equal(secondAdjustment.body.period.score, 85);
  assert.notEqual(secondAdjustment.body.period.periodKey, first.body.data.periodKey);
});

test('server calculations clamp monthly scores to the 0–100 boundaries', async () => {
  const admin = await login('admin@trileez.ir', 'Admin123!');
  const highEmployee = await createEmployee(admin, 'high-boundary');
  const lowEmployee = await createEmployee(admin, 'low-boundary');
  const high = await adjustment(admin, highEmployee, 100, '2026-09-10').expect(201);
  const low = await adjustment(admin, lowEmployee, -100, '2026-09-10').expect(201);
  assert.equal(high.body.period.score, 100);
  assert.equal(low.body.period.score, 0);
  await adjustment(admin, highEmployee, 100, '2026-09-11').expect(201).then((response) => assert.equal(response.body.period.score, 100));
  await adjustment(admin, lowEmployee, -100, '2026-09-11').expect(201).then((response) => assert.equal(response.body.period.score, 0));
  await adjustment(admin, highEmployee, 0, '2026-09-12').expect(400);
  await adjustment(admin, highEmployee, 1.5, '2026-09-12').expect(400);
});

test('finalization locks the month, reopening requires admin permission, and refinalization recalculates it', async () => {
  const admin = await login('admin@trileez.ir', 'Admin123!');
  const manager = await login('manager@trileez.ir', 'Manager123!');
  const employeeId = await createEmployee(admin, 'finalize');
  await adjustment(manager, employeeId, 8, '2026-09-15').expect(201);
  const finalized = await request(app).post('/api/performance/periods/finalize').set('authorization', manager).send({ employeeId, period: '2026-09-15', notes: 'Manager finalization', score: 1 }).expect(201);
  assert.equal(finalized.body.data.score, 78);
  assert.equal(finalized.body.data.evaluatedBy, 'u2');

  await adjustment(manager, employeeId, 5, '2026-09-16').expect(409);
  await request(app).patch(`/api/performance/periods/${finalized.body.data.id}`).set('authorization', admin).send({ score: 1, status: 'open' }).expect(404);
  await request(app).post(`/api/performance/periods/${finalized.body.data.id}/reopen`).set('authorization', manager).send({ reason: 'Manager cannot reopen' }).expect(403);

  const reopened = await request(app).post(`/api/performance/periods/${finalized.body.data.id}/reopen`).set('authorization', admin).send({ reason: 'Approved correction' }).expect(200);
  assert.equal(reopened.body.data.status, 'open');
  assert.equal(reopened.body.data.reopenedBy, 'u1');
  await adjustment(manager, employeeId, 5, '2026-09-16').expect(201);
  const refinalized = await request(app).post('/api/performance/periods/finalize').set('authorization', manager).send({ employeeId, period: '2026-09-16' }).expect(201);
  assert.equal(refinalized.body.data.score, 83);
  assert.ok(refinalized.body.data.version > finalized.body.data.version);

  const audits = await database.forOrganization('org1').list('AuditLog', { entityType: 'PerformancePeriod', entityId: finalized.body.data.id });
  assert.ok(audits.some((row) => row.action === 'performance.period.finalized'));
  assert.ok(audits.some((row) => row.action === 'performance.period.reopened'));
  const auditHistory = await request(app).get(`/api/performance/periods/${finalized.body.data.id}/audit`).set('authorization', manager).expect(200);
  assert.ok(auditHistory.body.data.some((row: { action: string }) => row.action === 'performance.adjustment.created'));
  assert.ok(auditHistory.body.data.some((row: { action: string }) => row.action === 'performance.period.reopened'));
});

test('concurrent adjustments are serialized without losing score changes', async () => {
  const admin = await login('admin@trileez.ir', 'Admin123!');
  const employeeId = await createEmployee(admin, 'concurrent');
  const responses = await Promise.all(Array.from({ length: 20 }, (_, index) => adjustment(admin, employeeId, 1, '2026-09-18', `Concurrent ${index}`).expect(201)));
  assert.equal(responses.length, 20);
  const summary = await request(app).get(`/api/performance/summary/${employeeId}?period=2026-09-18`).set('authorization', admin).expect(200);
  assert.equal(summary.body.data.adjustmentTotal, 20);
  assert.equal(summary.body.data.score, 90);
  assert.equal(summary.body.data.eventIds.length, 20);
  const periods = await database.forOrganization('org1').list('PerformancePeriod', { employeeId });
  assert.equal(periods.length, 1);
  assert.equal(periods[0]!.score, 90);
});

test('a concurrent adjustment and finalization cannot modify a finalized snapshot out of order', async () => {
  const admin = await login('admin@trileez.ir', 'Admin123!');
  const employeeId = await createEmployee(admin, 'finalize-race');
  const [eventResponse, finalizeResponse] = await Promise.all([
    adjustment(admin, employeeId, 10, '2026-09-19', 'Racing adjustment'),
    request(app).post('/api/performance/periods/finalize').set('authorization', admin).send({ employeeId, period: '2026-09-19' }),
  ]);
  assert.equal(finalizeResponse.status, 201);
  assert.ok([201, 409].includes(eventResponse.status));
  const period = finalizeResponse.body.data as { id: string; score: number; eventIds: string[]; status: string };
  assert.equal(period.status, 'finalized');
  assert.equal(period.score, eventResponse.status === 201 ? 80 : 70);
  assert.equal(period.eventIds.length, eventResponse.status === 201 ? 1 : 0);
  await adjustment(admin, employeeId, 1, '2026-09-20', 'Post-finalization adjustment').expect(409);
  const stored = await database.forOrganization('org1').get('PerformancePeriod', period.id);
  assert.equal(stored?.score, period.score);
  assert.deepEqual(stored?.eventIds, period.eventIds);
});
