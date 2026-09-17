import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Task, TimesheetEntry, User, WageRecord } from '../src/types/index.ts';
import type { WageRepositories } from '../src/services/wageService.ts';
import { calculateWageLine, eligibleTimesheets, issueWage } from '../src/services/wageService.ts';
import type { Repository } from '../src/services/mockRepository.ts';

function repository<T extends { id: string }>(seed: T[]): Repository<T> {
  let items = [...seed];
  return {
    list: () => [...items],
    get: (id) => items.find((item) => item.id === id),
    create: (input) => {
      const item = { ...input, id: input.id ?? `test-${items.length + 1}` } as T;
      items = [item, ...items];
      return item;
    },
    update: (id, patch) => {
      const index = items.findIndex((item) => item.id === id);
      if (index < 0) return undefined;
      items[index] = { ...items[index], ...patch, id } as T;
      return items[index];
    },
    remove: (id) => {
      const next = items.filter((item) => item.id !== id);
      const changed = next.length !== items.length;
      items = next;
      return changed;
    },
    subscribe: () => () => undefined,
  };
}

const admin: User = { id: 'admin', name: 'مدیر', email: 'admin@example.test', role: 'admin', status: 'online', isActive: true, title: 'مدیر' };
const manager: User = { id: 'manager', name: 'سرپرست', email: 'manager@example.test', role: 'manager', status: 'online', isActive: true, title: 'سرپرست' };
const taskA: Task = { id: 'task-a', title: 'وظیفه الف', status: 'in_progress', priority: 'medium', assigneeId: 'employee-1', projectId: 'project-1', dueDate: '2026-09-30', startDate: '2026-09-01', hourlyRate: 500_000, createdAt: '2026-09-01', updatedAt: '2026-09-01', tags: [] };
const taskB: Task = { ...taskA, id: 'task-b', title: 'وظیفه ب', hourlyRate: 800_000 };
const entry = (id: string, taskId: string, date: string, hours: number, status: TimesheetEntry['status'] = 'approved'): TimesheetEntry => ({
  id, employeeId: 'employee-1', projectId: 'project-1', taskId, date, hours, billable: true, description: 'کار', status, createdAt: date,
});

function repositories(entries: TimesheetEntry[], wages: WageRecord[] = []): WageRepositories {
  return { tasks: repository([taskA, taskB]), timesheets: repository(entries), wages: repository(wages) };
}

test('calculates amount from task hourly rate', () => {
  assert.equal(calculateWageLine(entry('e1', taskA.id, '2026-09-03', 10), taskA).amount, 5_000_000);
});

test('filters by employee, month, financial queue and processed state', () => {
  const repos = repositories([
    entry('eligible', taskA.id, '2026-09-03', 10),
    entry('other-month', taskA.id, '2026-08-30', 4),
    { ...entry('not-queued', taskA.id, '2026-09-04', 2, 'rejected'), billingStatus: 'suspended' },
    { ...entry('queued', taskA.id, '2026-09-05', 1), paymentStatus: 'queued', billingStatus: 'purchase_invoice_registered', wageRecordId: 'w1' },
  ]);
  assert.deepEqual(eligibleTimesheets('employee-1', '2026-09', repos).map((item) => item.id), ['eligible']);
});

test('issues one wage for multiple tasks and queues included entries', () => {
  const repos = repositories([{ ...entry('e1', taskA.id, '2026-09-03', 10), paymentStatus: 'queued', billingStatus: 'payment_queued' }, entry('e2', taskB.id, '2026-09-04', 6)]);
  const record = issueWage({ actor: admin, employeeId: 'employee-1', period: '2026-09', timeEntryIds: ['e1', 'e2'] }, repos);
  assert.equal(record.totalAmount, 9_800_000);
  assert.equal(record.lineItems.length, 2);
  assert.equal(repos.timesheets.get('e1')?.paymentStatus, 'queued');
  assert.equal(repos.timesheets.get('e1')?.billingStatus, 'purchase_invoice_registered');
  assert.equal(repos.timesheets.get('e2')?.wageRecordId, record.id);
  assert.throws(() => issueWage({ actor: admin, employeeId: 'employee-1', period: '2026-09', timeEntryIds: ['e1'] }, repos));
});

test('accepts rows waiting for payment and rejects rows already invoiced', () => {
  const waiting = { ...entry('waiting', taskA.id, '2026-09-06', 3), billingStatus: 'payment_queued' as const };
  const pendingReview = { ...entry('pending-review', taskA.id, '2026-09-06', 2, 'pending_review'), billingStatus: 'payment_queued' as const };
  const invoiced = { ...entry('invoiced', taskA.id, '2026-09-06', 2), billingStatus: 'purchase_invoice_registered' as const };
  const repos = repositories([waiting, pendingReview, invoiced]);
  assert.deepEqual(eligibleTimesheets('employee-1', '2026-09', repos).map((item) => item.id), ['waiting']);
  const record = issueWage({ actor: admin, employeeId: 'employee-1', period: '2026-09', timeEntryIds: ['waiting'] }, repos);
  assert.deepEqual(record.lineItems.map((line) => line.timeEntryId), ['waiting']);
  assert.equal(repos.timesheets.get('waiting')?.billingStatus, 'purchase_invoice_registered');
});

test('rejects unauthorized wage issuance', () => {
  const repos = repositories([entry('e1', taskA.id, '2026-09-03', 1)]);
  assert.throws(() => issueWage({ actor: manager, employeeId: 'employee-1', period: '2026-09', timeEntryIds: ['e1'] }, repos), /مجوز/);
});
