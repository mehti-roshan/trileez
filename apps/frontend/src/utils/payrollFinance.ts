import type { AccountingSubmissionStatus, PayrollRecord } from '../types/index.ts';

export const accountingSubmissionLabels: Record<AccountingSubmissionStatus, string> = {
  not_submitted: 'ارسال‌نشده',
  queued: 'در صف ارسال',
  submitted: 'ارسال‌شده',
  synced: 'همگام‌شده',
  error: 'خطا',
};

export const payrollPaidAmount = (record: PayrollRecord) => Number(record.finalPayableAmount ?? record.netSalary ?? 0);
const payrollGrossAmount = (record: PayrollRecord) => Number(record.grossAmount ?? payrollPaidAmount(record) + Number(record.deductionAmount ?? record.deductions ?? 0));
const payrollDeductionAmount = (record: PayrollRecord) => Number(record.deductionAmount ?? record.deductions ?? 0);

export function summarizePaidPayroll(records: PayrollRecord[]) {
  const paidRecords = records.filter((record) => record.status === 'paid');
  const periods = new Map<string, { period: string; sortKey: string; gross: number; deductions: number; net: number; records: number }>();
  const statusCounts = new Map<AccountingSubmissionStatus, number>();

  paidRecords.forEach((record) => {
    const period = record.month || record.periodStart?.slice(0, 7) || 'بدون دوره';
    const current = periods.get(period) ?? { period, sortKey: record.periodStart ?? period, gross: 0, deductions: 0, net: 0, records: 0 };
    current.gross += payrollGrossAmount(record);
    current.deductions += payrollDeductionAmount(record);
    current.net += payrollPaidAmount(record);
    current.records += 1;
    if (record.periodStart && record.periodStart < current.sortKey) current.sortKey = record.periodStart;
    periods.set(period, current);

    const status = record.accountingSubmissionStatus ?? 'not_submitted';
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
  });

  const accountingStatuses = (Object.keys(accountingSubmissionLabels) as AccountingSubmissionStatus[])
    .map((status) => ({ status, label: accountingSubmissionLabels[status], count: statusCounts.get(status) ?? 0 }))
    .filter((item) => item.count > 0);

  return {
    paidRecords,
    totalGross: paidRecords.reduce((sum, record) => sum + payrollGrossAmount(record), 0),
    totalDeductions: paidRecords.reduce((sum, record) => sum + payrollDeductionAmount(record), 0),
    totalNet: paidRecords.reduce((sum, record) => sum + payrollPaidAmount(record), 0),
    pendingAccounting: paidRecords.filter((record) => ['not_submitted', 'queued'].includes(record.accountingSubmissionStatus ?? 'not_submitted')).length,
    syncedAccounting: paidRecords.filter((record) => record.accountingSubmissionStatus === 'synced').length,
    periods: Array.from(periods.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey)),
    accountingStatuses,
  };
}
