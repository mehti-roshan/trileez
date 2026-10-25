import test from 'node:test';
import assert from 'node:assert/strict';
import type { PayrollRecord } from '../src/types/index.ts';
import { payrollPaidAmount, summarizePaidPayroll } from '../src/utils/payrollFinance.ts';

const record = (overrides: Partial<PayrollRecord>): PayrollRecord => ({
  id: 'payroll-1', employeeId: 'e1', month: '1405-07', baseSalary: 0, overtime: 0, benefits: 0,
  deductions: 0, tax: 0, netSalary: 0, status: 'paid', ...overrides,
});

test('finance wage summary uses only authoritative paid payroll snapshots', () => {
  const summary = summarizePaidPayroll([
    record({ id: 'paid-1', finalPayableAmount: 900, grossAmount: 1_000, deductionAmount: 100, accountingSubmissionStatus: 'not_submitted' }),
    record({ id: 'paid-2', employeeId: 'e2', finalPayableAmount: 1_800, grossAmount: 2_000, deductionAmount: 200, accountingSubmissionStatus: 'synced' }),
    record({ id: 'approved', status: 'approved', finalPayableAmount: 9_999, accountingSubmissionStatus: 'synced' }),
  ]);

  assert.equal(summary.paidRecords.length, 2);
  assert.equal(summary.totalGross, 3_000);
  assert.equal(summary.totalDeductions, 300);
  assert.equal(summary.totalNet, 2_700);
  assert.equal(summary.pendingAccounting, 1);
  assert.equal(summary.syncedAccounting, 1);
  assert.deepEqual(summary.periods.map((item) => ({ period: item.period, net: item.net, records: item.records })), [{ period: '1405-07', net: 2_700, records: 2 }]);
});

test('paid amount falls back to the persisted net salary for older snapshots', () => {
  assert.equal(payrollPaidAmount(record({ finalPayableAmount: undefined, netSalary: 725 })), 725);
});
