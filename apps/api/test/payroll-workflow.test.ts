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

async function employee(authorization: string, suffix: string, kind: 'hourly' | 'fulltime') {
  return request(app).post('/api/employees').set('authorization', authorization).send({
    id: `payroll-employee-${kind}-${suffix}`, personnelCode: `PAY-${kind}-${suffix}`, fullName: `Payroll ${kind} ${suffix}`,
    employmentType: kind === 'hourly' ? 'project' : 'full_time', compensationType: kind === 'hourly' ? 'hourly_task' : 'full_time_attendance', employmentStatus: 'active',
  }).expect(201);
}

test('hourly payroll uses approved task time, snapshots inputs, adjustments, lifecycle, and audit history', async () => {
  const admin = await login();
  const manager = await login('manager@trileez.ir', 'Manager123!');
  const suffix = Date.now().toString();
  const person = await employee(admin, suffix, 'hourly');
  const compensation = await request(app).post('/api/data/compensations').set('authorization', admin).send({
    id: `payroll-hourly-comp-${suffix}`, employeeId: person.body.data.id, paymentMethod: 'hourly_task',
    effectiveFrom: '2026-10-01', hourlyRate: 400_000,
  }).expect(201);
  await database.forOrganization('org1').create('TimeEntry', {
    id: `payroll-approved-time-${suffix}`, employeeId: person.body.data.id, projectId: 'p1', taskId: 't1',
    date: '2026-10-05', hours: 2.5, status: 'approved', billable: true, createdBy: 'u1',
  });
  await database.forOrganization('org1').create('TimeEntry', {
    id: `payroll-pending-time-${suffix}`, employeeId: person.body.data.id, projectId: 'p1', taskId: 't1',
    date: '2026-10-06', hours: 10, status: 'pending_review', billable: true, createdBy: 'u1',
  });

  const draft = await request(app).post('/api/data/payroll').set('authorization', admin).send({
    id: `payroll-hourly-${suffix}`, employeeId: person.body.data.id, month: `1405-07-hourly-${suffix}`,
    periodStart: '2026-10-01', periodEnd: '2026-10-31', status: 'paid', netSalary: 999_999_999,
  }).expect(201);
  assert.equal(draft.body.data.status, 'draft');
  assert.equal(draft.body.data.netSalary, 0);
  assert.equal(draft.body.data.compensationId, compensation.body.data.id);

  await request(app).post(`/api/data/payroll/${draft.body.data.id}/adjustments`).set('authorization', admin).send({
    type: 'bonus', amount: 100_000, reason: 'Exceptional delivery', adjustmentDate: '2026-10-10', createdBy: 'forged',
  }).expect(201);
  await request(app).post(`/api/data/payroll/${draft.body.data.id}/adjustments`).set('authorization', admin).send({
    type: 'deduction', amount: 50_000, reason: 'Approved equipment deduction', adjustmentDate: '2026-10-11',
  }).expect(201);
  await request(app).post(`/api/data/payroll/${draft.body.data.id}/calculate`).set('authorization', manager).send({}).expect(403);

  const calculated = await request(app).post(`/api/data/payroll/${draft.body.data.id}/calculate`).set('authorization', admin).send({ reason: 'October calculation' }).expect(200);
  assert.equal(calculated.body.data.status, 'calculated');
  assert.equal(calculated.body.data.taskTimeMinutes, 150);
  assert.equal(calculated.body.data.attendanceMinutes, 0);
  assert.equal(calculated.body.data.grossBaseAmount, 1_000_000);
  assert.equal(calculated.body.data.bonusAmount, 100_000);
  assert.equal(calculated.body.data.deductionAmount, 50_000);
  assert.equal(calculated.body.data.grossAmount, 1_100_000);
  assert.equal(calculated.body.data.finalPayableAmount, 1_050_000);
  assert.equal(calculated.body.data.netSalary, 1_050_000);
  assert.equal(calculated.body.data.taskLines.length, 1);
  assert.equal(calculated.body.data.compensationSnapshot.hourlyRate, 400_000);
  assert.equal(calculated.body.data.adjustmentSnapshots.length, 2);

  await request(app).patch(`/api/data/compensations/${compensation.body.data.id}`).set('authorization', admin).send({ hourlyRate: 900_000 }).expect(200);
  const historical = await request(app).get(`/api/data/payroll/${draft.body.data.id}`).set('authorization', admin).expect(200);
  assert.equal(historical.body.data.finalPayableAmount, 1_050_000);
  assert.equal(historical.body.data.compensationSnapshot.hourlyRate, 400_000);
  await request(app).post(`/api/data/payroll/${draft.body.data.id}/adjustments`).set('authorization', admin).send({
    type: 'bonus', amount: 1, reason: 'Too late', adjustmentDate: '2026-10-12',
  }).expect(409);
  await request(app).post(`/api/data/payroll/${draft.body.data.id}/approve`).set('authorization', admin).send({}).expect(409);

  await request(app).post(`/api/data/payroll/${draft.body.data.id}/review`).set('authorization', admin).send({ reason: 'Checked against task logs' }).expect(200);
  await request(app).post(`/api/data/payroll/${draft.body.data.id}/approve`).set('authorization', admin).send({ reason: 'Approved by payroll administrator' }).expect(200);
  const paid = await request(app).post(`/api/data/payroll/${draft.body.data.id}/pay`).set('authorization', admin).send({
    paidAt: '2026-10-01T10:00:00Z', paymentNote: 'Recorded as paid without banking integration', reason: 'Payment confirmed',
    settlementMethod: 'bank_transfer', paymentReference: `BANK-REF-${suffix}`,
  }).expect(200);
  assert.equal(paid.body.data.status, 'paid');
  assert.equal(paid.body.data.paidBy, 'u1');
  assert.ok(paid.body.data.calculatedAt);
  assert.ok(paid.body.data.reviewedAt);
  assert.ok(paid.body.data.approvedAt);
  assert.ok(paid.body.data.paidAt);
  assert.equal(paid.body.data.accountingSubmissionStatus, 'not_submitted');
  assert.equal(paid.body.data.paymentReference, `BANK-REF-${suffix}`);
  assert.ok(paid.body.data.paymentRecordId);
  assert.ok(paid.body.data.paymentDocumentId);
  assert.ok(paid.body.data.paymentDocumentNumber);

  const payment = await database.forOrganization('org1').get('PayrollPayment', paid.body.data.paymentRecordId);
  assert.equal(payment?.payrollId, draft.body.data.id);
  assert.equal(payment?.employeeId, person.body.data.id);
  assert.equal(payment?.amount, 1_050_000);
  assert.equal(payment?.settlementMethod, 'bank_transfer');
  assert.equal(payment?.reference, `BANK-REF-${suffix}`);
  assert.equal(payment?.status, 'recorded');
  assert.equal(payment?.accountingSubmissionStatus, 'not_submitted');
  assert.equal(payment?.externalSystem, undefined);
  assert.equal(payment?.externalId, undefined);

  const paymentDocument = await database.forOrganization('org1').get('PayrollPaymentDocument', paid.body.data.paymentDocumentId);
  assert.equal(paymentDocument?.payrollId, draft.body.data.id);
  assert.equal(paymentDocument?.paymentId, payment?.id);
  assert.equal(paymentDocument?.employeeId, person.body.data.id);
  assert.equal(paymentDocument?.amount, 1_050_000);
  assert.equal(paymentDocument?.documentNumber, paid.body.data.paymentDocumentNumber);
  assert.equal(paymentDocument?.status, 'issued');
  assert.equal(paymentDocument?.accountingSubmissionStatus, 'not_submitted');
  assert.equal((paymentDocument?.snapshot as Record<string, unknown>).finalPayableAmount, 1_050_000);

  const artifacts = await request(app).get(`/api/data/payroll/${draft.body.data.id}/payment-artifacts`).set('authorization', admin).expect(200);
  assert.equal(artifacts.body.data.payment.id, payment?.id);
  assert.equal(artifacts.body.data.document.id, paymentDocument?.id);
  await request(app).post(`/api/data/payroll/${draft.body.data.id}/pay`).set('authorization', admin).send({}).expect(409);
  assert.equal(await database.forOrganization('org1').count('PayrollPayment', { payrollId: draft.body.data.id }), 1);
  assert.equal(await database.forOrganization('org1').count('PayrollPaymentDocument', { payrollId: draft.body.data.id }), 1);
  await request(app).delete(`/api/data/payroll/${draft.body.data.id}`).set('authorization', admin).expect(409);
  await request(app).post('/api/data/payroll').set('authorization', admin).send({
    employeeId: person.body.data.id, month: `overlap-${suffix}`,
    periodStart: '2026-10-15', periodEnd: '2026-11-15',
  }).expect(409);

  const actions = (await database.forOrganization('org1').list('AuditLog', { entityId: draft.body.data.id })).map((row) => row.action);
  for (const action of ['payroll.created', 'payroll.calculated', 'payroll.reviewed', 'payroll.approved', 'payroll.paid']) assert.ok(actions.includes(action), `missing audit ${action}`);
  const allActions = (await database.forOrganization('org1').list('AuditLog')).map((row) => row.action);
  for (const action of ['payroll.payment_record.created', 'payroll.payment_document.issued']) assert.ok(allActions.includes(action), `missing audit ${action}`);
});

test('full-time payroll uses approved attendance and separates regular, overtime, leave, adjustments, and deductions', async () => {
  const admin = await login();
  const suffix = Date.now().toString();
  const person = await employee(admin, suffix, 'fulltime');
  const compensation = await request(app).post('/api/data/compensations').set('authorization', admin).send({
    id: `payroll-fulltime-comp-${suffix}`, employeeId: person.body.data.id, paymentMethod: 'full_time_attendance',
    effectiveFrom: '2026-10-01', monthlySalary: 90_000_000, overtimeEnabled: true, overtimeRateMultiplier: 1.5,
    expectedSchedule: { timezone: 'Asia/Tehran', weeklyExpectedMinutes: 480, days: [{ weekday: 6, expectedMinutes: 480 }] },
  }).expect(201);
  const attendance = await request(app).post('/api/data/attendance').set('authorization', admin).send({
    id: `payroll-attendance-${suffix}`, employeeId: person.body.data.id, date: '2026-10-03', status: 'present',
    clockIn: '2026-10-03T08:00:00+03:30', clockOut: '2026-10-03T18:00:00+03:30',
  }).expect(201);
  await request(app).patch(`/api/data/attendance/${attendance.body.data.id}/review`).set('authorization', admin).send({ approvalStatus: 'approved' }).expect(200);
  const draft = await request(app).post('/api/data/payroll').set('authorization', admin).send({
    id: `payroll-fulltime-${suffix}`, employeeId: person.body.data.id, month: `1405-07-fulltime-${suffix}`,
    periodStart: '2026-10-03', periodEnd: '2026-10-03',
  }).expect(201);
  for (const adjustment of [
    { type: 'bonus', amount: 1_000_000, reason: 'Performance bonus' },
    { type: 'adjustment_credit', amount: 200_000, reason: 'Expense correction' },
    { type: 'adjustment_debit', amount: 100_000, reason: 'Prior overpayment correction' },
    { type: 'deduction', amount: 500_000, reason: 'Approved deduction' },
  ]) await request(app).post(`/api/data/payroll/${draft.body.data.id}/adjustments`).set('authorization', admin).send({
    ...adjustment, adjustmentDate: '2026-10-03',
  }).expect(201);

  const calculated = await request(app).post(`/api/data/payroll/${draft.body.data.id}/calculate`).set('authorization', admin).send({}).expect(200);
  assert.equal(calculated.body.data.compensationId, compensation.body.data.id);
  assert.equal(calculated.body.data.paymentMethod, 'full_time_attendance');
  assert.equal(calculated.body.data.taskTimeMinutes, 0);
  assert.equal(calculated.body.data.expectedMinutes, 480);
  assert.equal(calculated.body.data.attendanceMinutes, 600);
  assert.equal(calculated.body.data.regularMinutes, 480);
  assert.equal(calculated.body.data.overtimeMinutes, 120);
  assert.equal(calculated.body.data.absenceMinutes, 0);
  assert.equal(calculated.body.data.approvedLeaveMinutes, 0);
  assert.equal(calculated.body.data.grossBaseAmount, 90_000_000);
  assert.equal(calculated.body.data.overtimeAmount, 33_750_000);
  assert.equal(calculated.body.data.bonusAmount, 1_000_000);
  assert.equal(calculated.body.data.adjustmentCreditAmount, 200_000);
  assert.equal(calculated.body.data.adjustmentDebitAmount, 100_000);
  assert.equal(calculated.body.data.deductionAmount, 500_000);
  assert.equal(calculated.body.data.grossAmount, 124_950_000);
  assert.equal(calculated.body.data.finalPayableAmount, 124_350_000);
  assert.equal(calculated.body.data.attendanceLines.length, 1);
  assert.equal(calculated.body.data.attendanceLines[0].clockIn, '2026-10-03T08:00:00+03:30');
  assert.equal(calculated.body.data.attendanceLines[0].clockOut, '2026-10-03T18:00:00+03:30');

  await request(app).patch(`/api/data/attendance/${attendance.body.data.id}`).set('authorization', admin).send({
    clockOut: '2026-10-03T17:00:00+03:30',
  }).expect(200);
  const historical = await request(app).get(`/api/data/payroll/${draft.body.data.id}`).set('authorization', admin).expect(200);
  assert.equal(historical.body.data.finalPayableAmount, 124_350_000);
  assert.equal(historical.body.data.attendanceLines[0].workedMinutes, 600);
  assert.equal(historical.body.data.attendanceLines[0].clockOut, '2026-10-03T18:00:00+03:30');
});
