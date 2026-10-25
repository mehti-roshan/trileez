import { readLegacyRowsForMigration, removeLegacyRowAfterMigration } from './legacy.js';
import { models } from '../models/index.js';
import type { ResourceName } from '../types/entities.js';
import { logger } from '../observability/logger.js';

const migratedResources = {
  customers: 'Customer', contracts: 'Contract', invoices: 'Invoice', payments: 'Payment', installments: 'Installment',
  expenses: 'Expense', 'bank-accounts': 'BankAccount', suppliers: 'Supplier', 'project-sales': 'ProjectSale',
  payroll: 'PayrollRecord', 'employee-contracts': 'EmployeeContract', attendance: 'AttendanceRecord',
} as const satisfies Record<string, ResourceName>;

function attendanceMigration(row: Record<string, unknown>): Record<string, unknown> {
  const date = new Date(String(row.date));
  const dateKey = Number.isNaN(date.getTime()) ? String(row.date) : date.toISOString().slice(0, 10);
  const clock = (value: unknown) => typeof value === 'string' && /^\d{2}:\d{2}/.test(value)
    ? `${dateKey}T${value.length === 5 ? `${value}:00` : value}+03:30`
    : value;
  const workedMinutes = Math.max(0, Math.round(Number(row.workedMinutes ?? Number(row.workedHours ?? row.hours ?? 0) * 60)));
  return {
    ...row, date: dateKey, clockIn: clock(row.clockIn), clockOut: clock(row.clockOut),
    approvalStatus: row.approvalStatus || 'approved', expectedMinutes: Number(row.expectedMinutes ?? workedMinutes),
    workedMinutes, regularMinutes: Number(row.regularMinutes ?? workedMinutes), overtimeMinutes: Number(row.overtimeMinutes ?? 0),
    absenceMinutes: Number(row.absenceMinutes ?? 0), approvedLeaveMinutes: Number(row.approvedLeaveMinutes ?? 0),
    source: row.source || 'manual', notes: row.notes ?? row.note,
  };
}

export async function migrateSensitiveLegacyRecords(): Promise<void> {
  for (const [legacyResource, modelName] of Object.entries(migratedResources)) {
    const rows = await readLegacyRowsForMigration(legacyResource);
    for (const row of rows) {
      try {
        const model = models[modelName];
        if (!await model.exists({ _id: row.id, organizationId: row.organizationId })) {
          const { id, ...record } = row;
          await model.create({
            ...(legacyResource === 'attendance' ? attendanceMigration(record) : record),
            _id: id,
            createdBy: typeof row.createdBy === 'string' ? row.createdBy : 'system:migration',
          });
        }
        await removeLegacyRowAfterMigration(row.organizationId, legacyResource, row.id);
      } catch (error) {
        logger.warn('legacy_migration_record_failed', { resource: legacyResource, recordId: row.id, organizationId: row.organizationId, preserved: true, error });
      }
    }
  }
}
