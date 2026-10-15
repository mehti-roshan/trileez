import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initializeDatabase, database } from '../src/db/database.js';
import { legacyDatabase } from '../src/db/legacy.js';

await initializeDatabase();
const app = createApp();

async function login(email = 'admin@trileez.ir', password = 'Admin123!'): Promise<string> {
  const response = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  return `Bearer ${response.body.token}`;
}

async function employee(authorization: string, suffix: string, kind: 'hourly' | 'fulltime') {
  return request(app).post('/api/employees').set('authorization', authorization).send({
    id: `comp-employee-${kind}-${suffix}`, personnelCode: `COMP-${kind}-${suffix}`, fullName: `Compensation ${kind} ${suffix}`,
    employmentType: kind === 'hourly' ? 'project' : 'full_time', compensationType: kind === 'hourly' ? 'hourly_task' : 'full_time_attendance', employmentStatus: 'active', hourlyRate: kind === 'hourly' ? 500_000 : 0,
  }).expect(201);
}

test('compensation methods are explicit, effective-dated, isolated, and cannot overlap', async () => {
  const admin = await login();
  const foreign = await login('admin.org2@trileez.ir');
  const suffix = Date.now().toString();
  const hourlyEmployee = await employee(admin, suffix, 'hourly');

  const hourly = await request(app).post('/api/data/compensations').set('authorization', admin).send({
    id: `hourly-comp-${suffix}`, employeeId: hourlyEmployee.body.data.id, paymentMethod: 'hourly_task',
    effectiveFrom: '2026-10-01', hourlyRate: 500_000, currency: 'IRR', payPeriod: 'monthly',
  }).expect(201);
  assert.equal(hourly.body.data.paymentMethod, 'hourly_task');
  assert.equal(hourly.body.data.hourlyRate, 500_000);
  assert.equal(hourly.body.data.monthlySalary, undefined);

  await database.forOrganization('org1').create('TimeEntry', {
    id: `approved-time-${suffix}`, employeeId: hourlyEmployee.body.data.id, projectId: 'p1', taskId: 't1', date: '2026-10-05',
    hours: 2, status: 'approved', billable: true, createdBy: 'u1',
  });
  await database.forOrganization('org1').create('TimeEntry', {
    id: `pending-time-${suffix}`, employeeId: hourlyEmployee.body.data.id, projectId: 'p1', taskId: 't1', date: '2026-10-06',
    hours: 9, status: 'pending_review', billable: true, createdBy: 'u1',
  });
  await database.forOrganization('org1').create('TimeEntry', {
    id: `before-effective-time-${suffix}`, employeeId: hourlyEmployee.body.data.id, projectId: 'p1', taskId: 't1', date: '2026-09-30',
    hours: 4, status: 'approved', billable: true, createdBy: 'u1',
  });
  const payInputs = await request(app).get(`/api/data/compensations/${hourly.body.data.id}/pay-inputs?from=2026-09-01&to=2026-10-31`).set('authorization', admin).expect(200);
  assert.equal(payInputs.body.data.taskTime.approvedMinutes, 120);
  assert.equal(payInputs.body.data.taskTime.approvedHours, 2);
  assert.equal(payInputs.body.data.taskTime.amount, 1_000_000);
  assert.deepEqual(payInputs.body.data.taskTime.approvedEntryIds, [`approved-time-${suffix}`]);
  assert.equal(payInputs.body.data.attendanceTime.workedMinutes, 0);

  const invalidMix = await request(app).post('/api/data/compensations').set('authorization', admin).send({
    employeeId: hourlyEmployee.body.data.id, paymentMethod: 'hourly_task', effectiveFrom: '2027-01-01',
    hourlyRate: 500_000, monthlySalary: 90_000_000,
  }).expect(400);
  assert.ok(invalidMix.body.issues.some((issue: { path: string }) => issue.path === 'body.monthlySalary'));

  const overlap = await request(app).post('/api/data/compensations').set('authorization', admin).send({
    employeeId: hourlyEmployee.body.data.id, paymentMethod: 'hourly_task', effectiveFrom: '2026-11-01', hourlyRate: 550_000,
  }).expect(400);
  assert.ok(overlap.body.issues.some((issue: { path: string }) => issue.path === 'body.effectiveFrom'));

  await request(app).get(`/api/data/compensations/${hourly.body.data.id}`).set('authorization', foreign).expect(404);
  assert.ok(await database.forOrganization('org1').get('EmploymentCompensation', hourly.body.data.id));
  assert.equal(await legacyDatabase.get('org1', 'compensations', hourly.body.data.id), undefined);
});

test('attendance is dedicated, server-calculated, approval-controlled, and linked to full-time compensation', async () => {
  const admin = await login();
  const foreign = await login('admin.org2@trileez.ir');
  const suffix = Date.now().toString();
  const fulltimeEmployee = await employee(admin, suffix, 'fulltime');
  const compensation = await request(app).post('/api/data/compensations').set('authorization', admin).send({
    id: `fulltime-comp-${suffix}`, employeeId: fulltimeEmployee.body.data.id, paymentMethod: 'full_time_attendance',
    effectiveFrom: '2026-10-01', monthlySalary: 90_000_000, overtimeEnabled: true, overtimeRateMultiplier: 1.5,
    expectedSchedule: {
      timezone: 'Asia/Tehran', weeklyExpectedMinutes: 2_400,
      days: [6, 0, 1, 2, 3].map((weekday) => ({ weekday, expectedMinutes: 480 })),
    },
  }).expect(201);

  const attendance = await request(app).post('/api/data/attendance').set('authorization', admin).send({
    id: `attendance-${suffix}`, employeeId: fulltimeEmployee.body.data.id, date: '2026-10-03', status: 'present',
    clockIn: '2026-10-03T08:00:00+03:30', clockOut: '2026-10-03T17:30:00+03:30',
    expectedMinutes: 1, workedMinutes: 1, regularMinutes: 1, overtimeMinutes: 1, approvalStatus: 'approved', approvedBy: 'u-org2-admin',
  }).expect(201);
  assert.equal(attendance.body.data.compensationId, compensation.body.data.id);
  assert.equal(attendance.body.data.approvalStatus, 'pending');
  assert.equal(attendance.body.data.expectedMinutes, 480);
  assert.equal(attendance.body.data.workedMinutes, 570);
  assert.equal(attendance.body.data.regularMinutes, 480);
  assert.equal(attendance.body.data.overtimeMinutes, 90);
  assert.equal(attendance.body.data.absenceMinutes, 0);

  const updated = await request(app).patch(`/api/data/attendance/${attendance.body.data.id}`).set('authorization', admin).send({
    clockOut: '2026-10-03T18:00:00+03:30',
  }).expect(200);
  assert.equal(updated.body.data.workedMinutes, 600);
  assert.equal(updated.body.data.overtimeMinutes, 120);

  await request(app).patch(`/api/data/attendance/${attendance.body.data.id}`).set('authorization', admin).send({ expectedMinutes: 999 }).expect(400);
  const reviewed = await request(app).patch(`/api/data/attendance/${attendance.body.data.id}/review`).set('authorization', admin).send({ approvalStatus: 'approved' }).expect(200);
  assert.equal(reviewed.body.data.approvalStatus, 'approved');
  assert.equal(reviewed.body.data.approvedBy, 'u1');
  const payInputs = await request(app).get(`/api/data/compensations/${compensation.body.data.id}/pay-inputs?from=2026-10-01&to=2026-10-31`).set('authorization', admin).expect(200);
  assert.equal(payInputs.body.data.taskTime.approvedMinutes, 0);
  assert.equal(payInputs.body.data.attendanceTime.expectedMinutes, 480);
  assert.equal(payInputs.body.data.attendanceTime.workedMinutes, 600);
  assert.equal(payInputs.body.data.attendanceTime.regularMinutes, 480);
  assert.equal(payInputs.body.data.attendanceTime.overtimeMinutes, 120);
  assert.equal(payInputs.body.data.payrollInputMinutes, 600);

  const corrected = await request(app).patch(`/api/data/attendance/${attendance.body.data.id}`).set('authorization', admin).send({
    clockOut: '2026-10-03T18:30:00+03:30',
  }).expect(200);
  assert.equal(corrected.body.data.approvalStatus, 'pending');
  assert.equal(corrected.body.data.approvedBy, undefined);
  const pendingInputs = await request(app).get(`/api/data/compensations/${compensation.body.data.id}/pay-inputs?from=2026-10-01&to=2026-10-31`).set('authorization', admin).expect(200);
  assert.equal(pendingInputs.body.data.attendanceTime.workedMinutes, 0);
  await request(app).patch(`/api/data/attendance/${attendance.body.data.id}/review`).set('authorization', admin).send({ approvalStatus: 'approved' }).expect(200);
  const correctedInputs = await request(app).get(`/api/data/compensations/${compensation.body.data.id}/pay-inputs?from=2026-10-01&to=2026-10-31`).set('authorization', admin).expect(200);
  assert.equal(correctedInputs.body.data.attendanceTime.regularMinutes, 480);
  assert.equal(correctedInputs.body.data.attendanceTime.overtimeMinutes, 150);
  assert.equal(correctedInputs.body.data.payrollInputMinutes, 630);

  const markedAbsent = await request(app).patch(`/api/data/attendance/${attendance.body.data.id}`).set('authorization', admin).send({ status: 'absent' }).expect(200);
  assert.equal(markedAbsent.body.data.approvalStatus, 'pending');
  assert.equal(markedAbsent.body.data.clockIn, null);
  assert.equal(markedAbsent.body.data.clockOut, null);
  assert.equal(markedAbsent.body.data.workedMinutes, 0);
  await request(app).patch(`/api/data/attendance/${attendance.body.data.id}/review`).set('authorization', admin).send({ approvalStatus: 'approved' }).expect(200);
  const absentInputs = await request(app).get(`/api/data/compensations/${compensation.body.data.id}/pay-inputs?from=2026-10-01&to=2026-10-31`).set('authorization', admin).expect(200);
  assert.equal(absentInputs.body.data.attendanceTime.workedMinutes, 0);
  assert.equal(absentInputs.body.data.attendanceTime.absenceMinutes, 480);

  await request(app).get(`/api/data/attendance/${attendance.body.data.id}`).set('authorization', foreign).expect(404);
  await request(app).delete(`/api/data/compensations/${compensation.body.data.id}`).set('authorization', admin).expect(400);
  assert.ok(await database.forOrganization('org1').get('AttendanceRecord', attendance.body.data.id));
  assert.equal(await legacyDatabase.get('org1', 'attendance', attendance.body.data.id), undefined);
});

test('payroll drafts inherit their method from server-owned compensation configuration', async () => {
  const admin = await login();
  const suffix = Date.now().toString();
  const hourlyEmployee = await employee(admin, suffix, 'hourly');
  const compensation = await request(app).post('/api/data/compensations').set('authorization', admin).send({
    employeeId: hourlyEmployee.body.data.id, paymentMethod: 'hourly_task', effectiveFrom: '2026-10-01', hourlyRate: 600_000,
  }).expect(201);
  const payroll = await request(app).post('/api/data/payroll').set('authorization', admin).send({
    employeeId: hourlyEmployee.body.data.id, month: `1405-07-${suffix}`, periodStart: '2026-10-01', periodEnd: '2026-10-31',
    baseSalary: 0, overtime: 0, benefits: 0, deductions: 0, tax: 0,
    compensationId: 'client-forged', paymentMethod: 'full_time_attendance', taskTimeMinutes: 999_999, attendanceMinutes: 999_999,
  }).expect(201);
  assert.equal(payroll.body.data.compensationId, compensation.body.data.id);
  assert.equal(payroll.body.data.paymentMethod, 'hourly_task');
  assert.equal(payroll.body.data.taskTimeMinutes, 0);
  assert.equal(payroll.body.data.attendanceMinutes, 0);
  assert.equal(payroll.body.data.payrollMinutes, 0);
  assert.equal(payroll.body.data.status, 'draft');
});

test('employee compensation type is required, prevents conflicting configuration, and cannot change after history exists', async () => {
  const admin = await login();
  const suffix = `type-${Date.now()}`;

  await request(app).post('/api/employees').set('authorization', admin).send({
    fullName: `Missing type ${suffix}`, personnelCode: `MISSING-${suffix}`,
  }).expect(400);

  const mutable = await request(app).post('/api/employees').set('authorization', admin).send({
    fullName: `Mutable type ${suffix}`, personnelCode: `MUTABLE-${suffix}`, compensationType: 'full_time_attendance',
  }).expect(201);
  const changed = await request(app).patch(`/api/employees/${mutable.body.data.id}`).set('authorization', admin).send({
    compensationType: 'hourly_task',
  }).expect(200);
  assert.equal(changed.body.data.compensationType, 'hourly_task');

  await request(app).post('/api/data/compensations').set('authorization', admin).send({
    employeeId: mutable.body.data.id, paymentMethod: 'full_time_attendance', effectiveFrom: '2026-11-01', monthlySalary: 80_000_000,
    expectedSchedule: { timezone: 'Asia/Tehran', days: [{ weekday: 6, expectedMinutes: 480 }], weeklyExpectedMinutes: 480 },
  }).expect(400);

  await request(app).post('/api/data/compensations').set('authorization', admin).send({
    employeeId: mutable.body.data.id, paymentMethod: 'hourly_task', effectiveFrom: '2026-11-01', hourlyRate: 500_000,
  }).expect(201);

  const blocked = await request(app).patch(`/api/employees/${mutable.body.data.id}`).set('authorization', admin).send({
    compensationType: 'full_time_attendance',
  }).expect(409);
  assert.match(blocked.body.error, /تغییر مستقیم/);
});
