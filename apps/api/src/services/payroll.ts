import { createHash } from 'node:crypto';
import { database } from '../db/database.js';
import { legacyDatabase } from '../db/legacy.js';
import { RequestValidationError, relationshipIssue } from '../middleware/validate.js';
import { auditService } from './audit.js';
import type { SensitiveResourceConfig } from './sensitiveResourceService.js';
import type { AppRecord, RecordInput } from '../types/entities.js';
import type { DatabasePageOptions, PageResult } from '../db/query.js';
import { HttpError } from '../utils/httpError.js';

const paymentMethods = ['hourly_task', 'full_time_attendance'] as const;
type PaymentMethod = (typeof paymentMethods)[number];
type PayrollAdjustmentType = 'adjustment_credit' | 'adjustment_debit' | 'bonus' | 'deduction';
type PayrollSettlementMethod = 'bank_transfer' | 'cash' | 'cheque' | 'other';

const payrollLocks = new Map<string, Promise<void>>();

async function withPayrollLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = payrollLocks.get(key) || Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => gate);
  payrollLocks.set(key, queued);
  await previous;
  try { return await task(); } finally {
    release();
    if (payrollLocks.get(key) === queued) payrollLocks.delete(key);
  }
}

function invalid(path: string, message: string): never {
  throw new RequestValidationError([{ location: 'body', path, code: 'invalid_value', message }]);
}

async function requireMatchingEmployeeCompensation(
  organizationId: string,
  employeeId: string,
  paymentMethod: unknown,
  path = 'body.paymentMethod',
): Promise<AppRecord> {
  const employee = await database.forOrganization(organizationId).get('Employee', employeeId);
  if (!employee) throw relationshipIssue('body.employeeId');
  if (employee.compensationType !== paymentMethod) {
    invalid(path, 'روش پرداخت با نوع جبران خدمت ثبت‌شده در پروفایل کارمند مطابقت ندارد');
  }
  return employee;
}

function time(value: unknown, fallback = Number.NaN): number {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value ?? ''));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function endTime(value: unknown): number { return value ? time(value) : Number.POSITIVE_INFINITY; }

function dayTime(value: unknown): number {
  const parsed = value instanceof Date ? value : new Date(String(value ?? ''));
  if (Number.isNaN(parsed.getTime())) return Number.NaN;
  return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
}

function numberValue(record: Record<string, unknown>, field: string, fallback = 0): number {
  return typeof record[field] === 'number' && Number.isFinite(record[field]) ? record[field] as number : fallback;
}

function payrollArtifactCode(payrollId: string, periodStart: unknown): string {
  const period = String(periodStart || '').slice(0, 10).replaceAll('-', '') || 'PERIOD';
  const digest = createHash('sha256').update(payrollId).digest('hex').slice(0, 10).toUpperCase();
  return `${period}-${digest}`;
}

function scheduleFor(input: Record<string, unknown>): { timezone: string; days: Array<{ weekday: number; expectedMinutes: number }>; weeklyExpectedMinutes: number } {
  const raw = input.expectedSchedule && typeof input.expectedSchedule === 'object' ? input.expectedSchedule as Record<string, unknown> : {};
  const days = Array.isArray(raw.days) ? raw.days.map((day) => ({
    weekday: Number((day as Record<string, unknown>).weekday),
    expectedMinutes: Number((day as Record<string, unknown>).expectedMinutes),
  })) : [];
  return {
    timezone: typeof raw.timezone === 'string' ? raw.timezone : 'Asia/Tehran',
    days,
    weeklyExpectedMinutes: Number(raw.weeklyExpectedMinutes ?? days.reduce((sum, day) => sum + day.expectedMinutes, 0)),
  };
}

export async function effectiveCompensation(organizationId: string, employeeId: string, at: string | Date): Promise<Record<string, unknown> | undefined> {
  const point = time(at);
  return (await database.forOrganization(organizationId).list('EmploymentCompensation', { employeeId }))
    .filter((item) => item.status === 'active' && time(item.effectiveFrom) <= point && endTime(item.effectiveTo) >= point)
    .sort((left, right) => time(right.effectiveFrom) - time(left.effectiveFrom))[0];
}

async function validateCompensation(organizationId: string, input: Record<string, unknown>, current?: Record<string, unknown>): Promise<void> {
  const method = input.paymentMethod as PaymentMethod;
  if (!paymentMethods.includes(method)) invalid('body.paymentMethod', 'Unsupported payment method');
  await requireMatchingEmployeeCompensation(organizationId, String(input.employeeId), method);
  const start = time(input.effectiveFrom); const end = endTime(input.effectiveTo);
  if (end < start) invalid('body.effectiveTo', 'Effective end must be on or after effective start');
  const schedule = scheduleFor(input);
  if (new Set(schedule.days.map((day) => day.weekday)).size !== schedule.days.length) invalid('body.expectedSchedule.days', 'Each weekday may appear only once');
  if (schedule.weeklyExpectedMinutes !== schedule.days.reduce((sum, day) => sum + day.expectedMinutes, 0)) invalid('body.expectedSchedule.weeklyExpectedMinutes', 'Weekly expected minutes must equal the schedule day total');
  if (method === 'hourly_task') {
    if (!(Number(input.hourlyRate) > 0)) invalid('body.hourlyRate', 'Hourly/task compensation requires a positive hourly rate');
    if (input.monthlySalary !== undefined && Number(input.monthlySalary) !== 0) invalid('body.monthlySalary', 'Hourly/task compensation cannot define a monthly salary');
  } else {
    if (!(Number(input.monthlySalary) > 0)) invalid('body.monthlySalary', 'Full-time attendance compensation requires a positive monthly salary');
    if (!schedule.days.length || schedule.weeklyExpectedMinutes <= 0) invalid('body.expectedSchedule', 'Full-time attendance compensation requires an expected working schedule');
    if (input.hourlyRate !== undefined && Number(input.hourlyRate) !== 0) invalid('body.hourlyRate', 'Full-time attendance compensation cannot define a task hourly rate');
  }
  const overlapping = (await database.forOrganization(organizationId).list('EmploymentCompensation', { employeeId: input.employeeId }))
    .find((item) => item.id !== current?.id && item.status === 'active' && input.status !== 'inactive'
      && time(item.effectiveFrom) <= end && endTime(item.effectiveTo) >= start);
  if (overlapping) invalid('body.effectiveFrom', 'Compensation period overlaps another active configuration for this employee');
}

function parseClock(value: unknown): number | undefined {
  if (!value) return undefined;
  const parsed = time(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

async function attendanceValues(organizationId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const compensation = await effectiveCompensation(organizationId, String(input.employeeId), String(input.date));
  if (!compensation) throw relationshipIssue('body.employeeId', 'Employee has no active compensation configuration for this date');
  await requireMatchingEmployeeCompensation(organizationId, String(input.employeeId), compensation.paymentMethod, 'body.employeeId');
  if (compensation.paymentMethod !== 'full_time_attendance') invalid('body.employeeId', 'Attendance payroll is only available for full-time attendance-based employees');
  const clockIn = parseClock(input.clockIn); const clockOut = parseClock(input.clockOut);
  if ((clockIn === undefined) !== (clockOut === undefined)) invalid(clockIn === undefined ? 'body.clockIn' : 'body.clockOut', 'Clock-in and clock-out must be supplied together');
  if (clockIn !== undefined && clockOut !== undefined && clockOut <= clockIn) invalid('body.clockOut', 'Clock-out must be after clock-in');
  const workedMinutes = clockIn !== undefined && clockOut !== undefined ? Math.round((clockOut - clockIn) / 60_000) : 0;
  if (workedMinutes > 1_440) invalid('body.clockOut', 'An attendance shift cannot exceed 24 hours');
  const schedule = scheduleFor(compensation);
  const weekday = new Date(String(input.date)).getUTCDay();
  const expectedMinutes = schedule.days.find((day) => day.weekday === weekday)?.expectedMinutes ?? 0;
  const status = String(input.status);
  if (['present', 'late', 'remote'].includes(status) && workedMinutes === 0) invalid('body.clockIn', 'A worked attendance status requires clock-in and clock-out');
  let approvedLeaveMinutes = 0;
  if (status === 'leave') {
    if (!input.leaveRequestId) invalid('body.leaveRequestId', 'Leave attendance requires an approved leave request');
    const leave = await legacyDatabase.get(organizationId, 'leave-requests', String(input.leaveRequestId));
    if (!leave || leave.employeeId !== input.employeeId || leave.status !== 'approved') throw relationshipIssue('body.leaveRequestId', 'Leave request must exist, belong to the employee, and be approved');
    const date = time(input.date); if (date < time(leave.startDate) || date > time(leave.endDate)) invalid('body.date', 'Attendance date is outside the approved leave period');
    approvedLeaveMinutes = expectedMinutes;
  }
  const overtimeEnabled = compensation.overtimeEnabled === true;
  const regularMinutes = expectedMinutes > 0 ? Math.min(workedMinutes, expectedMinutes) : workedMinutes;
  const overtimeMinutes = overtimeEnabled ? Math.max(0, workedMinutes - expectedMinutes) : 0;
  const absenceMinutes = ['absent', 'leave'].includes(status) ? expectedMinutes : Math.max(0, expectedMinutes - regularMinutes);
  return { compensationId: compensation.id, expectedMinutes, workedMinutes, regularMinutes, overtimeMinutes, absenceMinutes, approvedLeaveMinutes };
}

async function validateAttendance(organizationId: string, input: Record<string, unknown>): Promise<void> {
  Object.assign(input, await attendanceValues(organizationId, input));
}

export const payrollConfigs: readonly SensitiveResourceConfig[] = [
  {
    model: 'EmploymentCompensation', resource: 'compensations', relationships: [{ field: 'employeeId', resource: 'Employee' }],
    prepareCreate: (input) => ({
      currency: 'IRR', payPeriod: 'monthly', overtimeEnabled: false, overtimeRateMultiplier: 1.4, status: 'active',
      ...input, expectedSchedule: scheduleFor(input),
    }),
    prepareUpdate: (current, patch) => ({
      ...patch,
      ...('expectedSchedule' in patch ? { expectedSchedule: scheduleFor({ ...current, ...patch }) } : {}),
    }),
    validate: validateCompensation,
    validateDelete: async (organizationId, current) => {
      const db = database.forOrganization(organizationId);
      if (await db.count('AttendanceRecord', { compensationId: current.id }) || await db.count('PayrollRecord', { compensationId: current.id })) {
        throw relationshipIssue('params.id', 'Compensation is referenced by attendance or payroll history');
      }
    },
  },
  {
    model: 'AttendanceRecord', resource: 'attendance', relationships: [
      { field: 'employeeId', resource: 'Employee' },
      { field: 'leaveRequestId', resource: 'leave-requests', storage: 'legacy' },
    ],
    prepareCreate: async (input, _actorId, organizationId) => ({
      ...input, source: input.source || 'manual', approvalStatus: 'pending',
      ...await attendanceValues(organizationId, input),
    }),
    prepareUpdate: async (current, patch, _actorId, organizationId) => {
      const affectsApproval = ['clockIn', 'clockOut', 'status', 'leaveRequestId'].some((field) => field in patch);
      const status = String(patch.status ?? current.status);
      const clearsClock = !['present', 'late', 'remote'].includes(status) && (('status' in patch) || current.clockIn || current.clockOut);
      const combined = { ...current, ...patch, ...(clearsClock ? { clockIn: undefined, clockOut: undefined } : {}) };
      return {
        ...patch,
        ...(clearsClock ? { clockIn: null, clockOut: null } : {}),
        ...(affectsApproval ? { approvalStatus: 'pending', approvedBy: undefined, approvedAt: undefined, rejectionReason: undefined } : {}),
        ...await attendanceValues(organizationId, combined),
      };
    },
    validate: validateAttendance,
    unique: [{ fields: ['employeeId', 'date'], message: 'Attendance already exists for this employee and date' }],
  },
] as const;

export async function reviewAttendance(
  organizationId: string,
  actorId: string,
  id: string,
  input: { approvalStatus: 'approved' | 'rejected'; reason?: string },
  ip?: string,
) {
  if (input.approvalStatus === 'rejected' && !input.reason?.trim()) invalid('body.reason', 'A rejection reason is required');
  const db = database.forOrganization(organizationId);
  const current = await db.get('AttendanceRecord', id);
  if (!current) return undefined;
  const patch = input.approvalStatus === 'approved'
    ? { approvalStatus: 'approved', approvedBy: actorId, approvedAt: new Date().toISOString(), rejectionReason: undefined }
    : { approvalStatus: 'rejected', approvedBy: actorId, approvedAt: new Date().toISOString(), rejectionReason: input.reason!.trim() };
  const updated = await db.update('AttendanceRecord', id, patch);
  if (updated) await auditService.record({
    organizationId, actorId, action: `attendance.${input.approvalStatus}`, entityType: 'AttendanceRecord', entityId: id,
    before: current, after: updated, metadata: { reason: input.reason }, ...(ip ? { ip } : {}),
  });
  return updated;
}

export async function compensationPayInputs(organizationId: string, compensationId: string, from: string, to: string) {
  const start = time(from); const end = time(to);
  if (end < start) invalid('query.to', 'Pay-input period end must be on or after its start');
  const db = database.forOrganization(organizationId);
  const compensation = await db.get('EmploymentCompensation', compensationId);
  if (!compensation) return undefined;
  await requireMatchingEmployeeCompensation(organizationId, String(compensation.employeeId), compensation.paymentMethod, 'params.id');
  const effectiveStart = Math.max(start, time(compensation.effectiveFrom));
  const effectiveEnd = Math.min(end, endTime(compensation.effectiveTo));
  if (effectiveStart > effectiveEnd) invalid('query.from', 'Requested period is outside the compensation effective dates');
  const within = (value: unknown) => { const point = time(value); return point >= effectiveStart && point <= effectiveEnd; };
  const base = {
    compensationId, employeeId: compensation.employeeId, paymentMethod: compensation.paymentMethod,
    periodStart: from, periodEnd: to,
  };
  if (compensation.paymentMethod === 'hourly_task') {
    const entries = (await db.list('TimeEntry', { employeeId: compensation.employeeId }))
      .filter((entry) => entry.status === 'approved' && within(entry.date));
    const approvedMinutes = entries.reduce((sum, entry) => sum + Math.round(Number(entry.hours) * 60), 0);
    const hourlyRate = Number(compensation.hourlyRate || 0);
    return {
      ...base,
      taskTime: { approvedEntryIds: entries.map((entry) => entry.id), approvedMinutes, approvedHours: approvedMinutes / 60, hourlyRate, amount: approvedMinutes / 60 * hourlyRate },
      attendanceTime: { approvedRecordIds: [], expectedMinutes: 0, workedMinutes: 0, regularMinutes: 0, overtimeMinutes: 0, absenceMinutes: 0, approvedLeaveMinutes: 0 },
      payrollInputMinutes: approvedMinutes,
    };
  }
  const records = (await db.list('AttendanceRecord', { employeeId: compensation.employeeId }))
    .filter((record) => record.compensationId === compensationId && record.approvalStatus === 'approved' && within(record.date));
  const sum = (field: string) => records.reduce((total, record) => total + Number(record[field] || 0), 0);
  const attendanceTime = {
    approvedRecordIds: records.map((record) => record.id), expectedMinutes: sum('expectedMinutes'), workedMinutes: sum('workedMinutes'),
    regularMinutes: sum('regularMinutes'), overtimeMinutes: sum('overtimeMinutes'), absenceMinutes: sum('absenceMinutes'),
    approvedLeaveMinutes: sum('approvedLeaveMinutes'),
  };
  return {
    ...base,
    taskTime: { approvedEntryIds: [], approvedMinutes: 0, approvedHours: 0, hourlyRate: 0, amount: 0 },
    attendanceTime,
    payrollInputMinutes: attendanceTime.regularMinutes + attendanceTime.overtimeMinutes + attendanceTime.approvedLeaveMinutes,
  };
}

interface PayrollDraftInput extends RecordInput {
  employeeId: string;
  month: string;
  periodStart: string;
  periodEnd: string;
}

interface PayrollAdjustmentInput {
  type: PayrollAdjustmentType;
  amount: number;
  reason: string;
  adjustmentDate: string;
}

function assertPeriod(periodStart: string, periodEnd: string): { start: number; end: number } {
  const start = dayTime(periodStart); const end = dayTime(periodEnd);
  if (end < start) invalid('body.periodEnd', 'Payroll period end must be on or after its start');
  if (end - start > 35 * 86_400_000) invalid('body.periodEnd', 'A monthly payroll period cannot exceed 36 calendar days');
  return { start, end };
}

function coversPeriod(compensation: AppRecord, start: number, end: number): boolean {
  return dayTime(compensation.effectiveFrom) <= start && endTime(compensation.effectiveTo) >= end;
}

function payrollDefaults(): Record<string, unknown> {
  return {
    taskTimeMinutes: 0, attendanceMinutes: 0, payrollMinutes: 0, expectedMinutes: 0,
    regularMinutes: 0, overtimeMinutes: 0, absenceMinutes: 0, approvedLeaveMinutes: 0,
    baseSalary: 0, workedHours: 0, hourlyRate: 0, overtime: 0, overtimeHours: 0,
    benefits: 0, adjustments: 0, deductions: 0, tax: 0, netSalary: 0,
    grossBaseAmount: 0, overtimeAmount: 0, bonusAmount: 0, adjustmentCreditAmount: 0,
    adjustmentDebitAmount: 0, deductionAmount: 0, grossAmount: 0, finalPayableAmount: 0,
    taskLines: [], attendanceLines: [], adjustmentSnapshots: [], calculationVersion: 0, status: 'draft',
  };
}

async function payrollCompensation(organizationId: string, payroll: AppRecord): Promise<AppRecord> {
  const db = database.forOrganization(organizationId);
  const compensation = payroll.compensationId ? await db.get('EmploymentCompensation', String(payroll.compensationId)) : undefined;
  if (!compensation || compensation.employeeId !== payroll.employeeId) throw relationshipIssue('payroll.compensationId', 'Payroll compensation no longer exists or belongs to another employee');
  const { start, end } = assertPeriod(String(payroll.periodStart), String(payroll.periodEnd));
  if (!coversPeriod(compensation, start, end)) invalid('body.periodStart', 'One compensation configuration must cover the entire payroll period');
  return compensation;
}

function periodExpectedMinutes(compensation: AppRecord, start: number, end: number): number {
  const schedule = scheduleFor(compensation);
  const byWeekday = new Map(schedule.days.map((day) => [day.weekday, day.expectedMinutes]));
  let expected = 0;
  for (let cursor = start; cursor <= end; cursor += 86_400_000) expected += byWeekday.get(new Date(cursor).getUTCDay()) || 0;
  return expected;
}

function compensationSnapshotOf(compensation: AppRecord): Record<string, unknown> {
  return {
    compensationId: compensation.id, paymentMethod: compensation.paymentMethod, currency: compensation.currency || 'IRR',
    payPeriod: compensation.payPeriod || 'monthly', hourlyRate: compensation.hourlyRate, monthlySalary: compensation.monthlySalary,
    overtimeEnabled: compensation.overtimeEnabled === true, overtimeRateMultiplier: numberValue(compensation, 'overtimeRateMultiplier', 1.4),
    expectedSchedule: scheduleFor(compensation),
  };
}

function adjustmentTotals(adjustments: AppRecord[]) {
  const total = (type: PayrollAdjustmentType) => adjustments
    .filter((adjustment) => adjustment.type === type)
    .reduce((sum, adjustment) => sum + numberValue(adjustment, 'amount'), 0);
  return {
    bonusAmount: total('bonus'), adjustmentCreditAmount: total('adjustment_credit'),
    adjustmentDebitAmount: total('adjustment_debit'), deductionAmount: total('deduction'),
  };
}

export const payrollWorkflow = {
  list(organizationId: string, options: DatabasePageOptions): Promise<PageResult<AppRecord>> {
    return database.forOrganization(organizationId).page('PayrollRecord', options);
  },

  get(organizationId: string, id: string): Promise<AppRecord | undefined> {
    return database.forOrganization(organizationId).get('PayrollRecord', id);
  },

  async createDraft(organizationId: string, actorId: string, input: PayrollDraftInput, ip?: string): Promise<AppRecord> {
    return withPayrollLock(`${organizationId}:employee:${input.employeeId}`, async () => {
      const db = database.forOrganization(organizationId);
      if (!await db.get('Employee', input.employeeId)) throw relationshipIssue('body.employeeId');
      const { start, end } = assertPeriod(input.periodStart, input.periodEnd);
      const compensation = await effectiveCompensation(organizationId, input.employeeId, input.periodStart);
      if (!compensation || !coversPeriod(compensation as AppRecord, start, end)) {
        throw relationshipIssue('body.employeeId', 'One active compensation configuration must cover the entire payroll period');
      }
      await requireMatchingEmployeeCompensation(organizationId, input.employeeId, compensation.paymentMethod, 'body.employeeId');
      const existingPayrolls = await db.list('PayrollRecord', { employeeId: input.employeeId });
      if (existingPayrolls.some((payroll) => payroll.month === input.month
        || (dayTime(payroll.periodStart) <= end && dayTime(payroll.periodEnd) >= start))) {
        throw new HttpError(409, 'Payroll already exists or overlaps this employee and pay period');
      }
      const payroll = await db.create('PayrollRecord', {
        ...input, compensationId: compensation.id, paymentMethod: compensation.paymentMethod,
        ...payrollDefaults(), createdBy: actorId,
      });
      await auditService.record({ organizationId, actorId, action: 'payroll.created', entityType: 'PayrollRecord', entityId: payroll.id,
        after: payroll, metadata: { employeeId: input.employeeId, month: input.month, periodStart: input.periodStart, periodEnd: input.periodEnd }, ...(ip ? { ip } : {}) });
      return payroll;
    });
  },

  async calculate(organizationId: string, actorId: string, id: string, reason?: string, ip?: string): Promise<AppRecord | undefined> {
    return withPayrollLock(`${organizationId}:${id}`, async () => {
      const db = database.forOrganization(organizationId);
      const current = await db.get('PayrollRecord', id);
      if (!current) return undefined;
      if (current.status !== 'draft') throw new HttpError(409, 'Only a draft payroll can be calculated');
      const compensation = await payrollCompensation(organizationId, current);
      await requireMatchingEmployeeCompensation(organizationId, String(current.employeeId), compensation.paymentMethod, 'payroll.compensationId');
      const { start, end } = assertPeriod(String(current.periodStart), String(current.periodEnd));
      const within = (value: unknown) => { const point = dayTime(value); return point >= start && point <= end; };
      const adjustments = (await db.list('PayrollAdjustment', { payrollId: id })).sort((left, right) => dayTime(left.adjustmentDate) - dayTime(right.adjustmentDate));
      const totals = adjustmentTotals(adjustments);
      const adjustmentSnapshots = adjustments.map((adjustment) => ({
        adjustmentId: adjustment.id, type: adjustment.type, amount: adjustment.amount, reason: adjustment.reason,
        adjustmentDate: adjustment.adjustmentDate, createdBy: adjustment.createdBy,
      }));
      let taskLines: Record<string, unknown>[] = [];
      let attendanceLines: Record<string, unknown>[] = [];
      let taskTimeMinutes = 0; let attendanceMinutes = 0; let payrollMinutes = 0; let expectedMinutes = 0;
      let regularMinutes = 0; let overtimeMinutes = 0; let absenceMinutes = 0; let approvedLeaveMinutes = 0;
      let grossBaseAmount = 0; let overtimeAmount = 0; let hourlyRate = 0;

      if (compensation.paymentMethod === 'hourly_task') {
        hourlyRate = numberValue(compensation, 'hourlyRate');
        const entries = (await db.list('TimeEntry', { employeeId: current.employeeId }))
          .filter((entry) => entry.status === 'approved' && within(entry.date))
          .sort((left, right) => dayTime(left.date) - dayTime(right.date));
        taskLines = entries.map((entry) => {
          const minutes = Math.round(numberValue(entry, 'hours') * 60);
          return { timeEntryId: entry.id, projectId: entry.projectId, taskId: entry.taskId, date: entry.date, minutes, hourlyRate, amount: Math.round(minutes / 60 * hourlyRate) };
        });
        taskTimeMinutes = taskLines.reduce((sum, line) => sum + Number(line.minutes), 0);
        payrollMinutes = taskTimeMinutes;
        grossBaseAmount = taskLines.reduce((sum, line) => sum + Number(line.amount), 0);
      } else {
        expectedMinutes = periodExpectedMinutes(compensation, start, end);
        if (expectedMinutes <= 0) invalid('body.periodStart', 'The compensation schedule has no expected working time in this payroll period');
        const records = (await db.list('AttendanceRecord', { employeeId: current.employeeId }))
          .filter((record) => record.compensationId === compensation.id && record.approvalStatus === 'approved' && within(record.date))
          .sort((left, right) => dayTime(left.date) - dayTime(right.date));
        attendanceLines = records.map((record) => ({
          attendanceRecordId: record.id, date: record.date, status: record.status,
          clockIn: record.clockIn, clockOut: record.clockOut,
          expectedMinutes: numberValue(record, 'expectedMinutes'), workedMinutes: numberValue(record, 'workedMinutes'),
          regularMinutes: numberValue(record, 'regularMinutes'), overtimeMinutes: numberValue(record, 'overtimeMinutes'),
          absenceMinutes: numberValue(record, 'absenceMinutes'), approvedLeaveMinutes: numberValue(record, 'approvedLeaveMinutes'),
        }));
        const sum = (field: string) => attendanceLines.reduce((total, line) => total + Number(line[field] || 0), 0);
        attendanceMinutes = sum('workedMinutes');
        regularMinutes = Math.min(expectedMinutes, sum('regularMinutes'));
        overtimeMinutes = compensation.overtimeEnabled === true ? sum('overtimeMinutes') : 0;
        approvedLeaveMinutes = Math.min(Math.max(0, expectedMinutes - regularMinutes), sum('approvedLeaveMinutes'));
        const paidBaseMinutes = regularMinutes + approvedLeaveMinutes;
        absenceMinutes = Math.max(0, expectedMinutes - paidBaseMinutes);
        payrollMinutes = paidBaseMinutes + overtimeMinutes;
        const monthlySalary = numberValue(compensation, 'monthlySalary');
        grossBaseAmount = Math.round(monthlySalary * paidBaseMinutes / expectedMinutes);
        overtimeAmount = compensation.overtimeEnabled === true
          ? Math.round(monthlySalary / expectedMinutes * numberValue(compensation, 'overtimeRateMultiplier', 1.4) * overtimeMinutes)
          : 0;
      }

      const grossAmount = grossBaseAmount + overtimeAmount + totals.bonusAmount + totals.adjustmentCreditAmount;
      const totalDeductions = totals.adjustmentDebitAmount + totals.deductionAmount;
      const finalPayableAmount = Math.max(0, grossAmount - totalDeductions);
      const now = new Date().toISOString();
      const updated = await db.update('PayrollRecord', id, {
        compensationId: compensation.id, paymentMethod: compensation.paymentMethod, compensationSnapshot: compensationSnapshotOf(compensation),
        taskLines, attendanceLines, adjustmentSnapshots,
        taskTimeMinutes, attendanceMinutes, payrollMinutes, expectedMinutes, regularMinutes, overtimeMinutes, absenceMinutes, approvedLeaveMinutes,
        grossBaseAmount, overtimeAmount, ...totals, grossAmount, finalPayableAmount,
        baseSalary: grossBaseAmount, workedHours: payrollMinutes / 60, hourlyRate, overtime: overtimeAmount, overtimeHours: overtimeMinutes / 60,
        benefits: totals.bonusAmount, adjustments: totals.adjustmentCreditAmount - totals.adjustmentDebitAmount,
        deductions: totals.deductionAmount, tax: 0, netSalary: finalPayableAmount,
        status: 'calculated', calculatedAt: now, calculatedBy: actorId,
        calculationVersion: numberValue(current, 'calculationVersion') + 1, updatedBy: actorId,
      });
      if (updated) await auditService.record({ organizationId, actorId, action: 'payroll.calculated', entityType: 'PayrollRecord', entityId: id,
        before: current, after: updated, ...(reason ? { reason } : {}), metadata: { employeeId: current.employeeId, paymentMethod: compensation.paymentMethod, sourceTaskEntries: taskLines.length, sourceAttendanceRecords: attendanceLines.length, adjustments: adjustmentSnapshots.length, finalPayableAmount }, ...(ip ? { ip } : {}) });
      return updated;
    });
  },

  async transition(organizationId: string, actorId: string, id: string, expected: string, next: string, action: string, reason?: string, patch: Record<string, unknown> = {}, ip?: string): Promise<AppRecord | undefined> {
    return withPayrollLock(`${organizationId}:${id}`, async () => {
      const db = database.forOrganization(organizationId);
      const current = await db.get('PayrollRecord', id);
      if (!current) return undefined;
      if (current.status !== expected) throw new HttpError(409, `Payroll must be ${expected} before it can become ${next}`);
      const updated = await db.update('PayrollRecord', id, { status: next, ...patch, updatedBy: actorId });
      if (updated) await auditService.record({ organizationId, actorId, action, entityType: 'PayrollRecord', entityId: id,
        before: current, after: updated, ...(reason ? { reason } : {}), metadata: { employeeId: current.employeeId, previousStatus: expected, status: next, finalPayableAmount: current.finalPayableAmount }, ...(ip ? { ip } : {}) });
      return updated;
    });
  },

  review(organizationId: string, actorId: string, id: string, reason?: string, ip?: string) {
    const now = new Date().toISOString();
    return this.transition(organizationId, actorId, id, 'calculated', 'reviewed', 'payroll.reviewed', reason, { reviewedAt: now, reviewedBy: actorId }, ip);
  },

  approve(organizationId: string, actorId: string, id: string, reason?: string, ip?: string) {
    const now = new Date().toISOString();
    return this.transition(organizationId, actorId, id, 'reviewed', 'approved', 'payroll.approved', reason, { approvedAt: now, approvedBy: actorId }, ip);
  },

  pay(organizationId: string, actorId: string, id: string, input: { paidAt?: string; paymentNote?: string; reason?: string; settlementMethod?: PayrollSettlementMethod; paymentReference?: string }, ip?: string) {
    return withPayrollLock(`${organizationId}:${id}`, async () => {
      const db = database.forOrganization(organizationId);
      const current = await db.get('PayrollRecord', id);
      if (!current) return undefined;
      if (current.status !== 'approved') throw new HttpError(409, 'Payroll must be approved before payment can be recorded');
      const paidAt = input.paidAt || new Date().toISOString();
      if (time(paidAt) > Date.now() + 60_000) invalid('body.paidAt', 'Payment date cannot be in the future');
      const amount = numberValue(current, 'finalPayableAmount', numberValue(current, 'netSalary'));
      if (amount <= 0) invalid('body', 'Payroll must have a positive payable amount before payment can be recorded');
      const employee = await db.get('Employee', String(current.employeeId));
      if (!employee) throw relationshipIssue('body.employeeId');

      const artifactCode = payrollArtifactCode(id, current.periodStart);
      const paymentId = `payroll-payment-${id}`;
      const documentId = `payroll-payment-document-${id}`;
      const receiptNumber = `SAL-${artifactCode}`;
      const documentNumber = `SAL-DOC-${artifactCode}`;
      const settlementMethod = input.settlementMethod || 'bank_transfer';
      const paymentReference = input.paymentReference?.trim() || receiptNumber;
      const currency = typeof (current.compensationSnapshot as Record<string, unknown> | undefined)?.currency === 'string'
        ? String((current.compensationSnapshot as Record<string, unknown>).currency)
        : 'IRR';

      let payment = await db.get('PayrollPayment', paymentId);
      if (!payment) {
        payment = await db.create('PayrollPayment', {
          id: paymentId, payrollId: id, employeeId: current.employeeId, receiptNumber, amount, currency, paidAt,
          settlementMethod, reference: paymentReference, note: input.paymentNote, status: 'recorded',
          accountingSubmissionStatus: 'not_submitted', createdBy: actorId, updatedBy: actorId,
        });
        await auditService.record({ organizationId, actorId, action: 'payroll.payment_record.created', entityType: 'PayrollPayment', entityId: payment.id,
          after: payment, ...(input.reason ? { reason: input.reason } : {}), metadata: { payrollId: id, employeeId: current.employeeId, accountingSubmissionStatus: 'not_submitted' }, ...(ip ? { ip } : {}) });
      }

      let paymentDocument = await db.get('PayrollPaymentDocument', documentId);
      if (!paymentDocument) {
        paymentDocument = await db.create('PayrollPaymentDocument', {
          id: documentId, payrollId: id, paymentId: payment.id, employeeId: current.employeeId, documentNumber,
          title: `سند پرداخت حقوق ${String(employee.fullName || employee.personnelCode || current.employeeId)} - ${String(current.month)}`,
          payrollMonth: current.month, periodStart: current.periodStart, periodEnd: current.periodEnd, amount, currency, paidAt,
          settlementMethod, reference: paymentReference, status: 'issued', accountingSubmissionStatus: 'not_submitted',
          snapshot: {
            employeeId: current.employeeId, employeeName: employee.fullName, personnelCode: employee.personnelCode,
            compensationMethod: current.paymentMethod, compensationSnapshot: current.compensationSnapshot,
            grossBaseAmount: current.grossBaseAmount, overtimeAmount: current.overtimeAmount, bonusAmount: current.bonusAmount,
            adjustmentCreditAmount: current.adjustmentCreditAmount, adjustmentDebitAmount: current.adjustmentDebitAmount,
            deductionAmount: current.deductionAmount, grossAmount: current.grossAmount, finalPayableAmount: amount,
            taskLines: current.taskLines, attendanceLines: current.attendanceLines, adjustmentSnapshots: current.adjustmentSnapshots,
          },
          createdBy: actorId, updatedBy: actorId,
        });
        await auditService.record({ organizationId, actorId, action: 'payroll.payment_document.issued', entityType: 'PayrollPaymentDocument', entityId: paymentDocument.id,
          after: paymentDocument, ...(input.reason ? { reason: input.reason } : {}), metadata: { payrollId: id, paymentId: payment.id, employeeId: current.employeeId, accountingSubmissionStatus: 'not_submitted' }, ...(ip ? { ip } : {}) });
      }

      const updated = await db.update('PayrollRecord', id, {
        status: 'paid', paidAt, paidBy: actorId, paymentNote: input.paymentNote,
        paymentRecordId: payment.id, paymentDocumentId: paymentDocument.id, paymentReference,
        paymentDocumentNumber: documentNumber, accountingSubmissionStatus: 'not_submitted', updatedBy: actorId,
      });
      if (updated) await auditService.record({ organizationId, actorId, action: 'payroll.paid', entityType: 'PayrollRecord', entityId: id,
        before: current, after: updated, ...(input.reason ? { reason: input.reason } : {}),
        metadata: { employeeId: current.employeeId, previousStatus: 'approved', status: 'paid', finalPayableAmount: amount, paymentRecordId: payment.id, paymentDocumentId: paymentDocument.id, accountingSubmissionStatus: 'not_submitted' }, ...(ip ? { ip } : {}) });
      return updated;
    });
  },

  async paymentArtifacts(organizationId: string, id: string) {
    const db = database.forOrganization(organizationId);
    const payroll = await db.get('PayrollRecord', id);
    if (!payroll) return undefined;
    const [payment, document] = await Promise.all([
      payroll.paymentRecordId ? db.get('PayrollPayment', String(payroll.paymentRecordId)) : Promise.resolve(undefined),
      payroll.paymentDocumentId ? db.get('PayrollPaymentDocument', String(payroll.paymentDocumentId)) : Promise.resolve(undefined),
    ]);
    return { payment: payment ?? null, document: document ?? null };
  },

  async removeDraft(organizationId: string, actorId: string, id: string, ip?: string): Promise<boolean | undefined> {
    return withPayrollLock(`${organizationId}:${id}`, async () => {
      const db = database.forOrganization(organizationId);
      const current = await db.get('PayrollRecord', id);
      if (!current) return undefined;
      if (current.status !== 'draft') throw new HttpError(409, 'Only a draft payroll can be deleted');
      for (const adjustment of await db.list('PayrollAdjustment', { payrollId: id })) await db.remove('PayrollAdjustment', adjustment.id);
      const removed = await db.remove('PayrollRecord', id);
      if (removed) await auditService.record({ organizationId, actorId, action: 'payroll.deleted', entityType: 'PayrollRecord', entityId: id, before: current, ...(ip ? { ip } : {}) });
      return removed;
    });
  },

  adjustments(organizationId: string, payrollId: string): Promise<AppRecord[]> {
    return database.forOrganization(organizationId).list('PayrollAdjustment', { payrollId });
  },

  async createAdjustment(organizationId: string, actorId: string, payrollId: string, input: PayrollAdjustmentInput, ip?: string): Promise<AppRecord | undefined> {
    return withPayrollLock(`${organizationId}:${payrollId}`, async () => {
      const db = database.forOrganization(organizationId);
      const payroll = await db.get('PayrollRecord', payrollId);
      if (!payroll) return undefined;
      if (payroll.status !== 'draft') throw new HttpError(409, 'Adjustments can only be changed while payroll is in draft');
      const { start, end } = assertPeriod(String(payroll.periodStart), String(payroll.periodEnd));
      const adjustmentDate = dayTime(input.adjustmentDate);
      if (adjustmentDate < start || adjustmentDate > end) invalid('body.adjustmentDate', 'Adjustment date must be inside the payroll period');
      const adjustment = await db.create('PayrollAdjustment', { ...input, payrollId, employeeId: payroll.employeeId, createdBy: actorId });
      await auditService.record({ organizationId, actorId, action: 'payroll.adjustment.created', entityType: 'PayrollAdjustment', entityId: adjustment.id,
        after: adjustment, reason: input.reason, metadata: { payrollId, employeeId: payroll.employeeId, type: input.type, amount: input.amount }, ...(ip ? { ip } : {}) });
      return adjustment;
    });
  },

  async updateAdjustment(organizationId: string, actorId: string, payrollId: string, adjustmentId: string, patch: Partial<PayrollAdjustmentInput>, ip?: string): Promise<AppRecord | undefined> {
    return withPayrollLock(`${organizationId}:${payrollId}`, async () => {
      const db = database.forOrganization(organizationId);
      const payroll = await db.get('PayrollRecord', payrollId);
      if (!payroll) return undefined;
      if (payroll.status !== 'draft') throw new HttpError(409, 'Adjustments can only be changed while payroll is in draft');
      const current = await db.get('PayrollAdjustment', adjustmentId);
      if (!current || current.payrollId !== payrollId) return undefined;
      if (patch.adjustmentDate) {
        const { start, end } = assertPeriod(String(payroll.periodStart), String(payroll.periodEnd));
        const adjustmentDate = dayTime(patch.adjustmentDate);
        if (adjustmentDate < start || adjustmentDate > end) invalid('body.adjustmentDate', 'Adjustment date must be inside the payroll period');
      }
      const updated = await db.update('PayrollAdjustment', adjustmentId, { ...patch, updatedBy: actorId });
      if (updated) await auditService.record({ organizationId, actorId, action: 'payroll.adjustment.updated', entityType: 'PayrollAdjustment', entityId: adjustmentId,
        before: current, after: updated, reason: String(updated.reason), metadata: { payrollId, employeeId: payroll.employeeId }, ...(ip ? { ip } : {}) });
      return updated;
    });
  },

  async removeAdjustment(organizationId: string, actorId: string, payrollId: string, adjustmentId: string, ip?: string): Promise<boolean | undefined> {
    return withPayrollLock(`${organizationId}:${payrollId}`, async () => {
      const db = database.forOrganization(organizationId);
      const payroll = await db.get('PayrollRecord', payrollId);
      if (!payroll) return undefined;
      if (payroll.status !== 'draft') throw new HttpError(409, 'Adjustments can only be changed while payroll is in draft');
      const current = await db.get('PayrollAdjustment', adjustmentId);
      if (!current || current.payrollId !== payrollId) return undefined;
      const removed = await db.remove('PayrollAdjustment', adjustmentId);
      if (removed) await auditService.record({ organizationId, actorId, action: 'payroll.adjustment.deleted', entityType: 'PayrollAdjustment', entityId: adjustmentId,
        before: current, reason: String(current.reason), metadata: { payrollId, employeeId: payroll.employeeId }, ...(ip ? { ip } : {}) });
      return removed;
    });
  },
};
