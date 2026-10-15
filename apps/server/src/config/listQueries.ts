import { listQuerySchema } from '../db/query.js';
import { v } from '../middleware/validate.js';
import type { ListQueryConfig } from '../db/query.js';
import type { ResourceName } from '../types/entities.js';

const optionalId = v.optional(v.id);
const optionalShort = v.optional(v.string({ min: 1, max: 250 }));
const optionalBoolean = v.optional(v.boolean({ coerce: true }));

export const employeeListConfig: ListQueryConfig = {
  filters: { userId: optionalId, managerId: optionalId, employmentStatus: optionalShort, department: optionalShort },
  searchFields: ['fullName', 'personnelCode', 'email', 'phone', 'jobTitle'],
  sortFields: ['createdAt', 'fullName'], defaultSort: 'createdAt', defaultDirection: 'desc',
};

export const userListConfig: ListQueryConfig = {
  filters: { role: optionalShort, status: optionalShort, isActive: optionalBoolean, customerId: optionalId },
  searchFields: ['name', 'firstName', 'lastName', 'email', 'phone', 'title'], sortFields: ['createdAt', 'name', 'email'],
};

export const projectListConfig: ListQueryConfig = {
  filters: { customerId: optionalId, managerId: optionalId, status: optionalShort },
  ranges: { startFrom: { field: 'startDate', bound: 'gte' }, startTo: { field: 'startDate', bound: 'lte' }, endFrom: { field: 'endDate', bound: 'gte' }, endTo: { field: 'endDate', bound: 'lte' } },
  searchFields: ['name', 'code', 'description'], sortFields: ['createdAt', 'name'],
};

export const taskListConfig: ListQueryConfig = {
  filters: { projectId: optionalId, phaseId: optionalId, activityId: optionalId, assigneeId: optionalId, status: optionalShort, priority: optionalShort },
  ranges: { dueFrom: { field: 'dueDate', bound: 'gte' }, dueTo: { field: 'dueDate', bound: 'lte' } },
  searchFields: ['title', 'description'], sortFields: ['createdAt', 'title'],
};

export const meetingListConfig: ListQueryConfig = {
  filters: { projectId: optionalId, customerId: optionalId, organizerId: optionalId, status: optionalShort, departmentId: optionalId },
  filterMap: { departmentId: 'departments' },
  ranges: { from: { field: 'startAt', bound: 'gte' }, to: { field: 'startAt', bound: 'lte' } },
  searchFields: ['title', 'agenda', 'description', 'notes', 'outcome'], sortFields: ['startAt', 'createdAt', 'title'], defaultSort: 'startAt',
};

export const projectEventListConfig: ListQueryConfig = {
  filters: { projectId: optionalId, type: optionalShort, relatedEmployeeId: optionalId, projectMemberId: optionalId, customerVisible: optionalBoolean },
  filterMap: { type: 'eventType', relatedEmployeeId: 'personId' },
  ranges: { from: { field: 'date', bound: 'gte' }, to: { field: 'date', bound: 'lte' } },
  searchFields: ['title', 'description'], sortFields: ['date', 'createdAt', 'title'], defaultSort: 'date',
};

export const performanceEventListConfig: ListQueryConfig = {
  filters: { employeeId: optionalId, projectId: optionalId, periodKey: optionalShort, category: optionalShort },
  ranges: { from: { field: 'date', bound: 'gte' }, to: { field: 'date', bound: 'lte' } },
  searchFields: ['reason', 'description'], sortFields: ['date', 'createdAt', 'pointsChange'], defaultSort: 'date',
};

export const performancePeriodListConfig: ListQueryConfig = {
  filters: { employeeId: optionalId, periodKey: optionalShort, status: optionalShort },
  ranges: { from: { field: 'startedAt', bound: 'gte' }, to: { field: 'startedAt', bound: 'lte' } },
  sortFields: ['startedAt', 'createdAt', 'score'], defaultSort: 'startedAt',
};

export const auditListConfig: ListQueryConfig = {
  filters: { actorId: optionalId, entityType: optionalShort, entityId: optionalId, action: optionalShort, requestId: v.optional(v.string({ min: 1, max: 200 })) },
  ranges: { from: { field: 'createdAt', bound: 'gte' }, to: { field: 'createdAt', bound: 'lte' } },
  searchFields: ['action', 'entityType', 'reason'], sortFields: ['createdAt'], defaultLimit: 100,
};

export const fileListConfig: ListQueryConfig = {
  filters: {
    projectId: optionalId, customerId: optionalId, employeeId: optionalId, folderId: optionalId,
    contextKind: optionalShort, contextId: optionalId, visibility: optionalShort, customerVisible: optionalBoolean, mimeType: optionalShort,
    processingStatus: optionalShort,
  },
  ranges: { from: { field: 'createdAt', bound: 'gte' }, to: { field: 'createdAt', bound: 'lte' } },
  searchFields: ['name', 'originalName', 'description', 'tags'], sortFields: ['createdAt', 'name', 'sizeBytes'],
};

export const projectAccessListConfig: ListQueryConfig = {
  filters: { projectId: optionalId, roleId: optionalId, projectMemberId: optionalId, scope: optionalShort, status: optionalShort, resource: optionalShort, permission: optionalShort },
  ranges: { startsFrom: { field: 'startDate', bound: 'gte' }, expiresTo: { field: 'expiryDate', bound: 'lte' } },
  searchFields: ['content', 'system', 'resource', 'permission', 'username', 'notes'], sortFields: ['createdAt'],
};

export const jobListConfig: ListQueryConfig = {
  filters: { type: optionalShort, status: optionalShort, queue: optionalShort, createdBy: optionalId, recurringTaskId: optionalId },
  ranges: { from: { field: 'createdAt', bound: 'gte' }, to: { field: 'createdAt', bound: 'lte' }, runFrom: { field: 'runAt', bound: 'gte' }, runTo: { field: 'runAt', bound: 'lte' } },
  sortFields: ['createdAt', 'runAt', 'priority'], defaultSort: 'createdAt',
};

export const recurringTaskListConfig: ListQueryConfig = {
  filters: { jobType: optionalShort, enabled: optionalBoolean },
  ranges: { dueFrom: { field: 'nextRunAt', bound: 'gte' }, dueTo: { field: 'nextRunAt', bound: 'lte' } },
  searchFields: ['name'], sortFields: ['createdAt', 'nextRunAt', 'name'], defaultSort: 'nextRunAt', defaultDirection: 'asc',
};

const sharedSensitive: ListQueryConfig = { sortFields: ['createdAt'], defaultSort: 'createdAt' };
export const sensitiveListConfigs: Partial<Record<ResourceName, ListQueryConfig>> = {
  Customer: { filters: { status: optionalShort, assignedTo: optionalId }, searchFields: ['name', 'code', 'email', 'phone', 'company'], sortFields: ['createdAt', 'name', 'value'] },
  Contract: { filters: { customerId: optionalId, projectId: optionalId, status: optionalShort, ownerId: optionalId }, ranges: { from: { field: 'startDate', bound: 'gte' }, to: { field: 'endDate', bound: 'lte' } }, searchFields: ['title', 'number'], sortFields: ['createdAt', 'startDate', 'endDate', 'title'] },
  Invoice: { filters: { customerId: optionalId, projectId: optionalId, contractId: optionalId, status: optionalShort }, ranges: { dueFrom: { field: 'dueDate', bound: 'gte' }, dueTo: { field: 'dueDate', bound: 'lte' } }, searchFields: ['number', 'title'], sortFields: ['createdAt', 'issuedAt', 'dueDate'] },
  Payment: { filters: { customerId: optionalId, projectId: optionalId, invoiceId: optionalId, status: optionalShort }, ranges: { from: { field: 'paidAt', bound: 'gte' }, to: { field: 'paidAt', bound: 'lte' } }, searchFields: ['receiptNumber', 'reference'], sortFields: ['createdAt', 'paidAt', 'amount'] },
  Installment: { filters: { customerId: optionalId, projectId: optionalId, contractId: optionalId, invoiceId: optionalId, status: optionalShort }, ranges: { dueFrom: { field: 'dueDate', bound: 'gte' }, dueTo: { field: 'dueDate', bound: 'lte' } }, sortFields: ['createdAt', 'dueDate', 'number'] },
  Expense: { filters: { projectId: optionalId, supplierId: optionalId, status: optionalShort }, ranges: { from: { field: 'date', bound: 'gte' }, to: { field: 'date', bound: 'lte' } }, searchFields: ['title', 'category', 'description'], sortFields: ['createdAt', 'date', 'amount'] },
  ProjectSale: { filters: { projectId: optionalId, customerId: optionalId, status: optionalShort }, ranges: { from: { field: 'date', bound: 'gte' }, to: { field: 'date', bound: 'lte' } }, searchFields: ['title', 'documentNumber'], sortFields: ['createdAt', 'date', 'amount'] },
  EmploymentCompensation: { filters: { employeeId: optionalId, paymentMethod: optionalShort, status: optionalShort }, ranges: { effectiveFrom: { field: 'effectiveFrom', bound: 'gte' }, effectiveTo: { field: 'effectiveTo', bound: 'lte' } }, sortFields: ['createdAt', 'effectiveFrom'] },
  AttendanceRecord: { filters: { employeeId: optionalId, compensationId: optionalId, status: optionalShort, approvalStatus: optionalShort }, ranges: { from: { field: 'date', bound: 'gte' }, to: { field: 'date', bound: 'lte' } }, searchFields: ['notes'], sortFields: ['createdAt', 'date'], defaultSort: 'date', defaultDirection: 'desc' },
  PayrollRecord: { filters: { employeeId: optionalId, compensationId: optionalId, paymentMethod: optionalShort, month: optionalShort, status: optionalShort }, ranges: { from: { field: 'periodStart', bound: 'gte' }, to: { field: 'periodEnd', bound: 'lte' } }, sortFields: ['createdAt', 'month', 'periodStart', 'netSalary'] },
  EmployeeContract: { filters: { employeeId: optionalId, status: optionalShort, type: optionalShort }, ranges: { from: { field: 'startDate', bound: 'gte' }, to: { field: 'endDate', bound: 'lte' } }, searchFields: ['description'], sortFields: ['createdAt', 'startDate'] },
};

export function sensitiveListConfig(model: ResourceName): ListQueryConfig { return sensitiveListConfigs[model] || sharedSensitive; }

export const employeeListQuerySchema = listQuerySchema(employeeListConfig);
export const userListQuerySchema = listQuerySchema(userListConfig);
export const projectListQuerySchema = listQuerySchema(projectListConfig);
export const taskListQuerySchema = listQuerySchema(taskListConfig);
export const meetingListQuerySchema = listQuerySchema(meetingListConfig);
export const projectEventListQuerySchema = listQuerySchema(projectEventListConfig);
export const performanceEventListQuerySchema = listQuerySchema(performanceEventListConfig);
export const performancePeriodListQuerySchema = listQuerySchema(performancePeriodListConfig);
export const auditListQuerySchema = listQuerySchema(auditListConfig);
export const filePageQuerySchema = listQuerySchema(fileListConfig);
export const projectAccessListQuerySchema = listQuerySchema(projectAccessListConfig);
export const jobListQuerySchema = listQuerySchema(jobListConfig);
export const recurringTaskListQuerySchema = listQuerySchema(recurringTaskListConfig);
