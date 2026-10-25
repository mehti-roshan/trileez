import { Router } from 'express';
import { requireAuth, requireResourceAccess } from '../middleware/auth.js';
import { relationshipIssue, validateRequest, v } from '../middleware/validate.js';
import { idParamsSchema } from '../config/requestValidation.js';
import { database } from '../db/database.js';
import { legacyDatabase } from '../db/legacy.js';
import { listQuerySchema, pageQuery } from '../db/query.js';
import type { DatabasePageOptions, ListQueryConfig } from '../db/query.js';
import { ProjectDomainService } from '../services/projectDomain.js';
import {
  assignedTaskScope, associationOf, authorizedMeetingScope, linkedEmployee, ownEmployeeRecordScope, selfIdentity,
} from '../services/employeeIdentity.js';
import type { OwnerScope } from '../services/employeeIdentity.js';
import { notificationListOptions, ownedNotification } from './notifications.js';
import type { AppRecord } from '../types/entities.js';

const router = Router();
const service = new ProjectDomainService();
const optionalId = v.optional(v.id);
const optionalShort = v.optional(v.string({ min: 1, max: 250 }));

const taskListConfig: ListQueryConfig = {
  filters: { projectId: optionalId, status: optionalShort, priority: optionalShort },
  ranges: { dueFrom: { field: 'dueDate', bound: 'gte' }, dueTo: { field: 'dueDate', bound: 'lte' } },
  searchFields: ['title', 'description'], sortFields: ['createdAt', 'dueDate', 'title'], defaultSort: 'createdAt',
};
const meetingListConfig: ListQueryConfig = {
  filters: { projectId: optionalId, status: optionalShort },
  ranges: { from: { field: 'startAt', bound: 'gte' }, to: { field: 'startAt', bound: 'lte' } },
  searchFields: ['title', 'agenda'], sortFields: ['startAt', 'createdAt', 'title'], defaultSort: 'startAt',
};
const attendanceListConfig: ListQueryConfig = {
  filters: { status: optionalShort, approvalStatus: optionalShort },
  ranges: { from: { field: 'date', bound: 'gte' }, to: { field: 'date', bound: 'lte' } },
  sortFields: ['date', 'createdAt'], defaultSort: 'date', defaultDirection: 'desc',
};
const timesheetListConfig: ListQueryConfig = {
  filters: { projectId: optionalId, taskId: optionalId, status: optionalShort },
  ranges: { from: { field: 'date', bound: 'gte' }, to: { field: 'date', bound: 'lte' } },
  searchFields: ['description'], sortFields: ['date', 'createdAt', 'hours'], defaultSort: 'date',
};
const selfTimeSchema = v.object({
  projectId: v.id,
  taskId: v.id,
  date: v.date,
  hours: v.number({ min: 0.01, max: 24 }),
  description: v.optional(v.string({ max: 10_000 })),
  billable: v.optional(v.boolean()),
}, {
  strip: ['status', 'hourlyRate', 'calculatedCost', 'billingStatus', 'organizationId', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'reviewedBy', 'reviewedAt', 'reviewReason', 'id'],
});

function scoped(options: DatabasePageOptions, scope: OwnerScope): DatabasePageOptions {
  options.accessFilter = scope.accessFilter;
  options.accessPredicate = scope.accessPredicate;
  return options;
}

async function readScoped(organizationId: string, model: 'Task' | 'Meeting' | 'AttendanceRecord' | 'TimeEntry', id: string, scope: OwnerScope): Promise<AppRecord | undefined> {
  const row = await database.forOrganization(organizationId).get(model, id);
  return row && scope.accessPredicate(row) ? row : undefined;
}

router.get('/tasks', requireAuth, requireResourceAccess('tasks', 'read'), validateRequest({ query: listQuerySchema(taskListConfig) }), async (req, res, next) => {
  try {
    const identity = await selfIdentity(req.user!.organizationId, req.user!.id);
    const options = scoped(pageQuery(req.validatedQuery || {}, taskListConfig, `me-tasks:${req.user!.id}`), assignedTaskScope(identity.aliases));
    res.json(await database.forOrganization(req.user!.organizationId).page('Task', options));
  } catch (error) { next(error); }
});

router.get('/tasks/:id', requireAuth, requireResourceAccess('tasks', 'read'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const identity = await selfIdentity(req.user!.organizationId, req.user!.id);
    const data = await readScoped(req.user!.organizationId, 'Task', req.params.id as string, assignedTaskScope(identity.aliases));
    if (!data) return res.status(404).json({ error: 'Task not found' });
    res.json({ data });
  } catch (error) { next(error); }
});

router.get('/meetings', requireAuth, requireResourceAccess('meetings', 'read'), validateRequest({ query: listQuerySchema(meetingListConfig) }), async (req, res, next) => {
  try {
    const identity = await selfIdentity(req.user!.organizationId, req.user!.id);
    const options = scoped(pageQuery(req.validatedQuery || {}, meetingListConfig, `me-meetings:${req.user!.id}`), authorizedMeetingScope(identity.aliases));
    res.json(await database.forOrganization(req.user!.organizationId).page('Meeting', options));
  } catch (error) { next(error); }
});

router.get('/meetings/:id', requireAuth, requireResourceAccess('meetings', 'read'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const identity = await selfIdentity(req.user!.organizationId, req.user!.id);
    const data = await readScoped(req.user!.organizationId, 'Meeting', req.params.id as string, authorizedMeetingScope(identity.aliases));
    if (!data) return res.status(404).json({ error: 'Meeting not found' });
    res.json({ data });
  } catch (error) { next(error); }
});

router.get('/notifications', requireAuth, requireResourceAccess('notifications', 'read'), validateRequest({ query: listQuerySchema({ sortFields: ['createdAt'], defaultSort: 'createdAt', defaultDirection: 'desc' }) }), async (req, res, next) => {
  try {
    res.json(await legacyDatabase.page(req.user!.organizationId, 'notifications', notificationListOptions(req.user!.id, req.validatedQuery || {})));
  } catch (error) { next(error); }
});

router.get('/notifications/:id', requireAuth, requireResourceAccess('notifications', 'read'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const data = await ownedNotification(req.user!.organizationId, req.user!.id, req.params.id as string);
    if (!data) return res.status(404).json({ error: 'Notification not found' });
    res.json({ data });
  } catch (error) { next(error); }
});

router.get('/attendance', requireAuth, validateRequest({ query: listQuerySchema(attendanceListConfig) }), async (req, res, next) => {
  try {
    const identity = await selfIdentity(req.user!.organizationId, req.user!.id);
    const options = scoped(pageQuery(req.validatedQuery || {}, attendanceListConfig, `me-attendance:${req.user!.id}`), ownEmployeeRecordScope(identity.employee?.id));
    const page = await database.forOrganization(req.user!.organizationId).page('AttendanceRecord', options);
    res.json({ ...page, employee: identity.association });
  } catch (error) { next(error); }
});

router.get('/attendance/:id', requireAuth, validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const identity = await selfIdentity(req.user!.organizationId, req.user!.id);
    const data = await readScoped(req.user!.organizationId, 'AttendanceRecord', req.params.id as string, ownEmployeeRecordScope(identity.employee?.id));
    if (!data) return res.status(404).json({ error: 'AttendanceRecord not found' });
    res.json({ data, employee: identity.association });
  } catch (error) { next(error); }
});

router.get('/timesheets', requireAuth, requireResourceAccess('timesheets', 'read'), validateRequest({ query: listQuerySchema(timesheetListConfig) }), async (req, res, next) => {
  try {
    const identity = await selfIdentity(req.user!.organizationId, req.user!.id);
    const options = scoped(pageQuery(req.validatedQuery || {}, timesheetListConfig, `me-timesheets:${req.user!.id}`), ownEmployeeRecordScope(identity.employee?.id));
    const page = await database.forOrganization(req.user!.organizationId).page('TimeEntry', options);
    res.json({ ...page, employee: identity.association });
  } catch (error) { next(error); }
});

router.get('/timesheets/:id', requireAuth, requireResourceAccess('timesheets', 'read'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const identity = await selfIdentity(req.user!.organizationId, req.user!.id);
    const data = await readScoped(req.user!.organizationId, 'TimeEntry', req.params.id as string, ownEmployeeRecordScope(identity.employee?.id));
    if (!data) return res.status(404).json({ error: 'Time entry not found' });
    res.json({ data, employee: identity.association });
  } catch (error) { next(error); }
});

router.post('/timesheets', requireAuth, requireResourceAccess('timesheets', 'create'), validateRequest({ body: selfTimeSchema }), async (req, res, next) => {
  try {
    const employee = await linkedEmployee(req.user!.organizationId, req.user!.id);
    const association = associationOf(employee);
    if (association.state !== 'active' || !employee) {
      throw relationshipIssue('body.employeeId', 'Time can only be recorded for an active employee record linked to the signed-in user');
    }
    const data = await service.create(req.user!.organizationId, req.user!.id, 'timeEntry', { ...req.body, employeeId: employee.id }, req.ip);
    res.status(201).json({ data });
  } catch (error) { next(error); }
});

export default router;
