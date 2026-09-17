import type { Repository } from './mockRepository.ts';
import type { Task, TimesheetEntry, User, WageLine, WageRecord } from '../types/index.ts';
import { taskRepository, timesheetRepository, wageRepository } from './repositories.ts';
import { hasPermission } from './accessControl.ts';
import { normalizeTimesheetBillingStatus, normalizeTimesheetStatus } from '../utils/format.ts';

export type WageRepositories = {
  tasks: Repository<Task>;
  timesheets: Repository<TimesheetEntry>;
  wages: Repository<WageRecord>;
};

const defaultRepositories: WageRepositories = {
  tasks: taskRepository,
  timesheets: timesheetRepository,
  wages: wageRepository,
};

export function wagePeriodOf(date: string): string {
  return date.slice(0, 7);
}

export function calculateWageLine(entry: TimesheetEntry, task: Task): WageLine {
  if (entry.taskId !== task.id || entry.projectId !== task.projectId) {
    throw new Error('ارتباط پروژه و وظیفه این ردیف ساعات معتبر نیست.');
  }
  if (!Number.isFinite(entry.hours) || entry.hours <= 0) {
    throw new Error('مدت ثبت‌شده برای محاسبه دستمزد معتبر نیست.');
  }
  const taskRate = Number(task.hourlyRate);
  if (!Number.isFinite(taskRate) || taskRate <= 0) {
    throw new Error(`برای وظیفه «${task.title}» نرخ ساعتی معتبر ثبت نشده است.`);
  }
  const taskHourlyRate = taskRate;
  return {
    timeEntryId: entry.id,
    projectId: entry.projectId,
    taskId: task.id,
    workDate: entry.date,
    hours: entry.hours,
    taskHourlyRate,
    amount: entry.hours * taskHourlyRate,
  };
}

function processedTimeEntryIds(wages: WageRecord[]): Set<string> {
  return new Set(wages.flatMap((record) => record.lineItems.map((line) => line.timeEntryId)));
}

export function isEligibleForWage(entry: TimesheetEntry, employeeId: string, period: string, task: Task | undefined, processedIds: Set<string>): boolean {
  return entry.employeeId === employeeId
    && wagePeriodOf(entry.date) === period
    && normalizeTimesheetStatus(entry.status) === 'approved'
    && normalizeTimesheetBillingStatus(entry.billingStatus ?? 'payment_queued') === 'payment_queued'
    && !entry.wageRecordId
    && !processedIds.has(entry.id)
    && Boolean(task)
    && task?.projectId === entry.projectId
    && Number.isFinite(Number(task?.hourlyRate))
    && Number(task?.hourlyRate) > 0;
}

export function eligibleTimesheets(employeeId: string, period: string, repositories: WageRepositories = defaultRepositories): TimesheetEntry[] {
  const processedIds = processedTimeEntryIds(repositories.wages.list());
  return repositories.timesheets.list().filter((entry) => (
    isEligibleForWage(entry, employeeId, period, repositories.tasks.get(entry.taskId), processedIds)
  ));
}

export function issueWage(input: { actor: User; employeeId: string; period: string; timeEntryIds: string[] }, repositories: WageRepositories = defaultRepositories): WageRecord {
  if (!hasPermission(input.actor, 'finance:pay')) {
    throw new Error('شما مجوز صدور دستمزد را ندارید.');
  }
  if (!/^\d{4}-\d{2}$/.test(input.period)) {
    throw new Error('دوره پرداخت معتبر نیست.');
  }
  const uniqueIds = [...new Set(input.timeEntryIds)];
  if (!uniqueIds.length) throw new Error('حداقل یک ردیف ساعات کاری باید انتخاب شود.');
  if (uniqueIds.length !== input.timeEntryIds.length) throw new Error('یک ردیف ساعات کاری بیش از یک‌بار انتخاب شده است.');

  const eligibleIds = new Set(eligibleTimesheets(input.employeeId, input.period, repositories).map((entry) => entry.id));
  const entries = uniqueIds.map((id) => {
    const entry = repositories.timesheets.get(id);
    if (!entry || !eligibleIds.has(id)) throw new Error('یکی از ردیف‌ها با وضعیت تایید و در صف پرداخت یافت نشد یا قبلاً پردازش شده است.');
    return entry;
  });
  const lineItems = entries.map((entry) => calculateWageLine(entry, repositories.tasks.get(entry.taskId)!));
  const totalHours = lineItems.reduce((sum, line) => sum + line.hours, 0);
  const totalAmount = lineItems.reduce((sum, line) => sum + line.amount, 0);
  const record = repositories.wages.create({
    employeeId: input.employeeId,
    period: input.period,
    lineItems,
    totalHours,
    totalAmount,
    status: 'queued',
    issuedAt: new Date().toISOString(),
    issuedBy: input.actor.id,
    externalSystem: 'hesabfa',
    syncStatus: 'pending',
  });
  entries.forEach((entry) => repositories.timesheets.update(entry.id, { paymentStatus: 'queued', billingStatus: 'purchase_invoice_registered', wageRecordId: record.id }));
  return record;
}
