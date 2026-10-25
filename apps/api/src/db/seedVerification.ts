import mongoose from 'mongoose';
import { models } from '../models/index.js';
import type { ResourceName } from '../types/entities.js';
import { legacyDatabase } from './legacy.js';

type Row = Record<string, unknown>;

export interface SeedGraph {
  organizationId: string;
  userIds: string[];
  employeeIds: string[];
  customerIds: string[];
  projectIds: string[];
  compensationIds: string[];
  taskIds: string[];
  fileIds: string[];
}

const idOf = (row: Row): string => String(row._id);
const values = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
  : typeof value === 'string' && value.length > 0 ? [value] : [];

async function rows(name: ResourceName, filter: Row): Promise<Row[]> {
  return models[name].find(filter).lean() as unknown as Promise<Row[]>;
}

function indexById(items: Row[]): Map<string, Row> {
  return new Map(items.map((item) => [idOf(item), item]));
}

function assertReference(
  errors: string[], source: string, row: Row, field: string, targets: Map<string, Row>, optional = false,
): void {
  const references = values(row[field]);
  if (references.length === 0 && !optional) errors.push(`${source}.${field} is missing`);
  for (const reference of references) {
    if (!targets.has(reference)) errors.push(`${source}.${field} references missing record ${reference}`);
  }
}

function assertSameProject(errors: string[], source: string, row: Row, field: string, targets: Map<string, Row>): void {
  for (const reference of values(row[field])) {
    const target = targets.get(reference);
    if (target && String(target.projectId || '') !== String(row.projectId || '')) {
      errors.push(`${source}.${field} references a record from another project`);
    }
  }
}

/**
 * Validates the connected portion of the database written by the application seed.
 * Existing unrelated organization data is not treated as part of the seed graph.
 */
export async function validateSeedGraph(graph: SeedGraph): Promise<number> {
  const { organizationId, userIds, projectIds, employeeIds, customerIds, compensationIds, taskIds, fileIds } = graph;
  const projectFilter = { organizationId, projectId: { $in: projectIds } };
  const employeeFilter = { organizationId, employeeId: { $in: employeeIds } };

  const [
    users, employees, customers, projects, roles, activities, members, phases, tasks, timeEntries,
    meetings, events, contracts, invoices, payments, installments, expenses, suppliers, bankAccounts,
    projectSales, compensations, attendance, payroll, adjustments, payrollPayments, payrollPaymentDocuments, employeeContracts,
    performanceEvents, performancePeriods, files, projectAccesses,
  ] = await Promise.all([
    rows('User', { organizationId }), rows('Employee', { organizationId }), rows('Customer', { organizationId }),
    rows('Project', { organizationId }), rows('ProjectRole', projectFilter), rows('ProjectActivity', projectFilter),
    rows('ProjectMember', projectFilter), rows('ProjectPhase', projectFilter), rows('Task', projectFilter),
    rows('TimeEntry', projectFilter), rows('Meeting', projectFilter), rows('ProjectEvent', projectFilter),
    rows('Contract', projectFilter), rows('Invoice', projectFilter), rows('Payment', projectFilter),
    rows('Installment', projectFilter), rows('Expense', projectFilter), rows('Supplier', { organizationId }),
    rows('BankAccount', { organizationId }), rows('ProjectSale', projectFilter),
    rows('EmploymentCompensation', { organizationId, _id: { $in: compensationIds } }),
    rows('AttendanceRecord', employeeFilter), rows('PayrollRecord', employeeFilter), rows('PayrollAdjustment', employeeFilter),
    rows('PayrollPayment', employeeFilter), rows('PayrollPaymentDocument', employeeFilter),
    rows('EmployeeContract', employeeFilter), rows('PerformanceEvent', employeeFilter),
    rows('PerformancePeriod', employeeFilter), rows('FileRecord', { organizationId, _id: { $in: fileIds } }),
    rows('ProjectAccess', projectFilter),
  ]);

  const maps = {
    users: indexById(users), employees: indexById(employees), customers: indexById(customers), projects: indexById(projects),
    roles: indexById(roles), activities: indexById(activities), members: indexById(members), phases: indexById(phases),
    tasks: indexById(tasks), timeEntries: indexById(timeEntries), contracts: indexById(contracts), invoices: indexById(invoices),
    suppliers: indexById(suppliers), bankAccounts: indexById(bankAccounts), compensations: indexById(compensations),
    payroll: indexById(payroll), payrollPayments: indexById(payrollPayments), payrollPaymentDocuments: indexById(payrollPaymentDocuments), files: indexById(files),
  };
  const errors: string[] = [];
  let checked = 0;
  for (const [label, expectedIds, target] of [
    ['User', userIds, maps.users], ['Employee', employeeIds, maps.employees], ['Customer', customerIds, maps.customers],
    ['Project', projectIds, maps.projects], ['Task', taskIds, maps.tasks],
    ['EmploymentCompensation', compensationIds, maps.compensations], ['FileRecord', fileIds, maps.files],
  ] as const) {
    for (const expectedId of expectedIds) {
      checked += 1;
      if (!target.has(expectedId)) errors.push(`${label}:${expectedId} was not persisted in the seed organization`);
    }
  }
  const check = (source: string, row: Row, field: string, target: Map<string, Row>, optional = false) => {
    checked += Math.max(1, values(row[field]).length);
    assertReference(errors, source, row, field, target, optional);
  };

  for (const row of employees.filter((item) => employeeIds.includes(idOf(item)))) check(`Employee:${idOf(row)}`, row, 'userId', maps.users);
  for (const row of projects.filter((item) => projectIds.includes(idOf(item)))) {
    check(`Project:${idOf(row)}`, row, 'customerId', maps.customers);
    check(`Project:${idOf(row)}`, row, 'managerId', maps.users);
    check(`Project:${idOf(row)}`, row, 'members', maps.users);
  }
  for (const row of roles) check(`ProjectRole:${idOf(row)}`, row, 'projectId', maps.projects);
  for (const row of activities) {
    check(`ProjectActivity:${idOf(row)}`, row, 'projectId', maps.projects);
    check(`ProjectActivity:${idOf(row)}`, row, 'roleId', maps.roles);
    assertSameProject(errors, `ProjectActivity:${idOf(row)}`, row, 'roleId', maps.roles);
  }
  for (const row of members) {
    check(`ProjectMember:${idOf(row)}`, row, 'projectId', maps.projects);
    check(`ProjectMember:${idOf(row)}`, row, 'personId', maps.users);
    check(`ProjectMember:${idOf(row)}`, row, 'roleIds', maps.roles);
    assertSameProject(errors, `ProjectMember:${idOf(row)}`, row, 'roleIds', maps.roles);
  }
  for (const row of phases) check(`ProjectPhase:${idOf(row)}`, row, 'projectId', maps.projects);
  // Projects remain usable after seeding, so they can contain later user-created
  // tasks with optional phase or assignment fields. Only apply the seed fixture
  // invariants below to the task identities explicitly returned by the seed.
  for (const row of tasks.filter((item) => taskIds.includes(idOf(item)))) {
    const source = `Task:${idOf(row)}`;
    check(source, row, 'projectId', maps.projects);
    check(source, row, 'phaseId', maps.phases);
    check(source, row, 'activityId', maps.activities, true);
    check(source, row, 'assigneeId', maps.users);
    check(source, row, 'assigneeMemberIds', maps.members);
    assertSameProject(errors, source, row, 'phaseId', maps.phases);
    assertSameProject(errors, source, row, 'activityId', maps.activities);
    assertSameProject(errors, source, row, 'assigneeMemberIds', maps.members);
  }
  for (const row of timeEntries) {
    const source = `TimeEntry:${idOf(row)}`;
    check(source, row, 'employeeId', maps.employees);
    check(source, row, 'projectId', maps.projects);
    check(source, row, 'taskId', maps.tasks);
    assertSameProject(errors, source, row, 'taskId', maps.tasks);
  }
  for (const row of meetings) {
    const source = `Meeting:${idOf(row)}`;
    check(source, row, 'projectId', maps.projects);
    check(source, row, 'organizerId', maps.users);
    check(source, row, 'participantIds', maps.users);
    check(source, row, 'employeeIds', maps.employees, true);
    check(source, row, 'customerId', maps.customers, true);
    check(source, row, 'taskIds', maps.tasks, true);
    assertSameProject(errors, source, row, 'taskIds', maps.tasks);
  }
  for (const row of events) {
    check(`ProjectEvent:${idOf(row)}`, row, 'projectId', maps.projects);
    check(`ProjectEvent:${idOf(row)}`, row, 'createdBy', maps.users);
  }
  for (const row of contracts) {
    check(`Contract:${idOf(row)}`, row, 'projectId', maps.projects);
    check(`Contract:${idOf(row)}`, row, 'customerId', maps.customers);
  }
  for (const row of invoices) {
    check(`Invoice:${idOf(row)}`, row, 'projectId', maps.projects);
    check(`Invoice:${idOf(row)}`, row, 'customerId', maps.customers);
    check(`Invoice:${idOf(row)}`, row, 'contractId', maps.contracts, true);
  }
  for (const row of payments) {
    check(`Payment:${idOf(row)}`, row, 'projectId', maps.projects);
    check(`Payment:${idOf(row)}`, row, 'customerId', maps.customers);
    check(`Payment:${idOf(row)}`, row, 'invoiceId', maps.invoices);
  }
  for (const row of installments) {
    check(`Installment:${idOf(row)}`, row, 'projectId', maps.projects);
    check(`Installment:${idOf(row)}`, row, 'customerId', maps.customers);
    check(`Installment:${idOf(row)}`, row, 'contractId', maps.contracts);
    check(`Installment:${idOf(row)}`, row, 'invoiceId', maps.invoices, true);
  }
  for (const row of expenses) {
    check(`Expense:${idOf(row)}`, row, 'projectId', maps.projects, true);
    check(`Expense:${idOf(row)}`, row, 'supplierId', maps.suppliers, true);
    check(`Expense:${idOf(row)}`, row, 'bankAccountId', maps.bankAccounts, true);
  }
  for (const row of projectSales) {
    check(`ProjectSale:${idOf(row)}`, row, 'projectId', maps.projects);
    check(`ProjectSale:${idOf(row)}`, row, 'customerId', maps.customers);
  }
  for (const row of compensations) check(`EmploymentCompensation:${idOf(row)}`, row, 'employeeId', maps.employees);
  for (const row of attendance) {
    check(`AttendanceRecord:${idOf(row)}`, row, 'employeeId', maps.employees);
    check(`AttendanceRecord:${idOf(row)}`, row, 'compensationId', maps.compensations);
  }
  for (const row of payroll) {
    check(`PayrollRecord:${idOf(row)}`, row, 'employeeId', maps.employees);
    check(`PayrollRecord:${idOf(row)}`, row, 'compensationId', maps.compensations);
    check(`PayrollRecord:${idOf(row)}`, row, 'paymentRecordId', maps.payrollPayments, row.status !== 'paid');
    check(`PayrollRecord:${idOf(row)}`, row, 'paymentDocumentId', maps.payrollPaymentDocuments, row.status !== 'paid');
    for (const line of Array.isArray(row.taskLines) ? row.taskLines as Row[] : []) {
      check(`PayrollRecord:${idOf(row)}.taskLine`, line, 'timeEntryId', maps.timeEntries);
      check(`PayrollRecord:${idOf(row)}.taskLine`, line, 'projectId', maps.projects);
      check(`PayrollRecord:${idOf(row)}.taskLine`, line, 'taskId', maps.tasks);
    }
  }
  for (const row of adjustments) {
    check(`PayrollAdjustment:${idOf(row)}`, row, 'employeeId', maps.employees);
    check(`PayrollAdjustment:${idOf(row)}`, row, 'payrollId', maps.payroll);
  }
  for (const row of payrollPayments) {
    check(`PayrollPayment:${idOf(row)}`, row, 'employeeId', maps.employees);
    check(`PayrollPayment:${idOf(row)}`, row, 'payrollId', maps.payroll);
  }
  for (const row of payrollPaymentDocuments) {
    check(`PayrollPaymentDocument:${idOf(row)}`, row, 'employeeId', maps.employees);
    check(`PayrollPaymentDocument:${idOf(row)}`, row, 'payrollId', maps.payroll);
    check(`PayrollPaymentDocument:${idOf(row)}`, row, 'paymentId', maps.payrollPayments);
  }
  for (const row of employeeContracts) check(`EmployeeContract:${idOf(row)}`, row, 'employeeId', maps.employees);
  for (const row of performanceEvents) {
    check(`PerformanceEvent:${idOf(row)}`, row, 'employeeId', maps.employees);
    check(`PerformanceEvent:${idOf(row)}`, row, 'projectId', maps.projects, true);
    check(`PerformanceEvent:${idOf(row)}`, row, 'taskId', maps.tasks, true);
  }
  for (const row of performancePeriods) check(`PerformancePeriod:${idOf(row)}`, row, 'employeeId', maps.employees);
  for (const row of files) {
    check(`FileRecord:${idOf(row)}`, row, 'uploadedBy', maps.users);
    check(`FileRecord:${idOf(row)}`, row, 'projectId', maps.projects, true);
    check(`FileRecord:${idOf(row)}`, row, 'customerId', maps.customers, true);
    check(`FileRecord:${idOf(row)}`, row, 'employeeId', maps.employees, true);
  }
  for (const row of projectAccesses) {
    check(`ProjectAccess:${idOf(row)}`, row, 'projectId', maps.projects);
    check(`ProjectAccess:${idOf(row)}`, row, 'roleId', maps.roles, true);
  }

  for (const [resource, id] of [
    ['documents-v2', 'seed-document-sales-acceptance'], ['documents-v2', 'seed-document-employee-handbook'],
    ['tickets', 'seed-ticket-sales-sync'], ['tickets', 'seed-ticket-bank-report'],
  ] as const) {
    const record = await legacyDatabase.get(organizationId, resource, id);
    if (!record) errors.push(`Legacy:${resource}:${id} is missing`);
    for (const fileId of values(record?.fileRecordIds)) if (!maps.files.has(fileId)) errors.push(`Legacy:${resource}:${id} references missing file ${fileId}`);
    for (const projectId of values(record?.projectId)) if (!maps.projects.has(projectId)) errors.push(`Legacy:${resource}:${id} references missing project ${projectId}`);
    for (const customerId of values(record?.customerId)) if (!maps.customers.has(customerId)) errors.push(`Legacy:${resource}:${id} references missing customer ${customerId}`);
    for (const employeeId of values(record?.employeeId)) if (!maps.employees.has(employeeId)) errors.push(`Legacy:${resource}:${id} references missing employee ${employeeId}`);
  }

  if (errors.length > 0) throw new Error(`Seed relationship validation failed:\n- ${errors.join('\n- ')}`);
  return checked;
}

/** Captures organization-owned record identities for repeat-run idempotency checks. */
export async function snapshotOrganizationRecordIds(organizationId: string): Promise<Record<string, string[]>> {
  const snapshot: Record<string, string[]> = {};
  for (const [name, model] of Object.entries(models)) {
    const documents = await model.find({ organizationId }).select({ _id: 1 }).lean() as unknown as Row[];
    snapshot[name] = documents.map(idOf).sort();
  }
  const database = mongoose.connection.db;
  if (!database) throw new Error('MongoDB is not connected');
  const legacy = await database.collection('legacyentities').find({ organizationId }, { projection: { _id: 1 } }).toArray();
  snapshot.LegacyEntity = legacy.map((item) => String(item._id)).sort();
  return snapshot;
}
