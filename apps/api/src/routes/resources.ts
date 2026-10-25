import { Router } from 'express';
import { database } from '../db/database.js';
import { requireAuth, requireResourceAccess } from '../middleware/auth.js';
import { relationshipIssue, validateRequest } from '../middleware/validate.js';
import { dedicatedMutationSchemas, idParamsSchema } from '../config/requestValidation.js';
import type { Request, Router as ExpressRouter } from 'express';
import type { ResourceAccessName } from '../config/resourceAccess.js';
import type { RecordFilter, ResourceName } from '../types/entities.js';
import { auditService } from '../services/audit.js';
import { employeeListConfig, employeeListQuerySchema } from '../config/listQueries.js';
import { pageQuery } from '../db/query.js';
import { HttpError } from '../utils/httpError.js';
import type { ValueSchema } from '../middleware/validate.js';
import type { ListQueryConfig } from '../db/query.js';

interface RelationshipRule { field: string; resource: ResourceName; many?: boolean }
interface ResourceOptions {
  listFilter?: (request: Request) => RecordFilter;
  relationships?: RelationshipRule[];
  immutableRelationships?: string[];
  systemCreate?: (request: Request) => Record<string, unknown>;
  beforeDelete?: (request: Request, id: string) => Promise<void>;
  listQuery?: { schema: ValueSchema<Record<string, unknown>>; config: ListQueryConfig };
  validateMutation?: (request: Request, input: Record<string, unknown>, current?: Record<string, unknown>) => Promise<void>;
}

const resource = (name: ResourceName, accessName: ResourceAccessName, options: ResourceOptions = {}): ExpressRouter => {
  const schemas = dedicatedMutationSchemas[name];
  if (!schemas) throw new Error(`Missing request validation schema for ${name}`);
  const router = Router();
  router.get('/', requireAuth, requireResourceAccess(accessName, 'read'), ...(options.listQuery ? [validateRequest({ query: options.listQuery.schema })] : []), async (req, res, next) => { try {
    const db = database.forOrganization(req.user!.organizationId);
    if (options.listQuery) return res.json(await db.page(name, pageQuery(req.validatedQuery || {}, options.listQuery.config, accessName)));
    res.json({ data: await db.list(name, options.listFilter?.(req) || {}) });
  } catch (error) { next(error); } });
  router.get('/:id', requireAuth, requireResourceAccess(accessName, 'read'), validateRequest({ params: idParamsSchema }), async (req, res, next) => { try { const data = await database.forOrganization(req.user!.organizationId).get(name, req.params.id as string); if (!data) return res.status(404).json({ error: `${name} not found` }); res.json({ data }); } catch (error) { next(error); } });
  router.post('/', requireAuth, requireResourceAccess(accessName, 'create'), validateRequest({ body: schemas.create }), async (req, res, next) => {
    try {
      const db = database.forOrganization(req.user!.organizationId);
      for (const relation of options.relationships || []) {
        const values = relation.many ? req.body[relation.field] : [req.body[relation.field]];
        for (const value of Array.isArray(values) ? values : []) if (value && !await db.get(relation.resource, String(value))) throw relationshipIssue(`body.${relation.field}`);
      }
      const input = { ...req.body, createdBy: req.user!.id, ...options.systemCreate?.(req) } as Record<string, unknown>;
      await options.validateMutation?.(req, input);
      const data = await db.create(name, input);
      await auditService.record({ organizationId: req.user!.organizationId, actorId: req.user!.id, action: `${accessName}.created`, entityType: name, entityId: data.id, after: data });
      res.status(201).json({ data });
    } catch (error) { next(error); }
  });
  router.patch('/:id', requireAuth, requireResourceAccess(accessName, 'update'), validateRequest({ params: idParamsSchema, body: schemas.update }), async (req, res, next) => {
    try {
      const db = database.forOrganization(req.user!.organizationId);
      const current = await db.get(name, req.params.id as string);
      if (!current) return res.status(404).json({ error: `${name} not found` });
      const patch = { ...req.body } as Record<string, unknown>;
      for (const relation of (options.relationships || []).filter((item) => !options.immutableRelationships?.includes(item.field) && item.field in patch)) {
        const values = relation.many ? patch[relation.field] : [patch[relation.field]];
        for (const value of Array.isArray(values) ? values : []) if (value && !await db.get(relation.resource, String(value))) throw relationshipIssue(`body.${relation.field}`);
      }
      await options.validateMutation?.(req, { ...current, ...patch }, current);
      const data = await db.update(name, req.params.id as string, patch);
      if (!data) return res.status(404).json({ error: `${name} not found` });
      await auditService.record({ organizationId: req.user!.organizationId, actorId: req.user!.id, action: `${accessName}.updated`, entityType: name, entityId: data.id, before: current, after: data });
      res.json({ data });
    } catch (error) { next(error); }
  });
  router.delete('/:id', requireAuth, requireResourceAccess(accessName, 'delete'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
    try {
      await options.beforeDelete?.(req, req.params.id as string);
      const db = database.forOrganization(req.user!.organizationId);
      const current = await db.get(name, req.params.id as string);
      const data = await db.remove(name, req.params.id as string);
      if (!data) return res.status(404).json({ error: `${name} not found` });
      await auditService.record({ organizationId: req.user!.organizationId, actorId: req.user!.id, action: `${accessName}.deleted`, entityType: name, entityId: req.params.id as string, before: current });
      res.status(204).send();
    } catch (error) { next(error); }
  });
  return router;
};

export const employeeRoutes = resource('Employee', 'employees', {
  listQuery: { schema: employeeListQuerySchema, config: employeeListConfig },
  relationships: [{ field: 'userId', resource: 'User' }, { field: 'managerId', resource: 'User' }], immutableRelationships: ['userId'],
  validateMutation: async (req, input, current) => {
    const db = database.forOrganization(req.user!.organizationId);
    if (input.managerId && String(input.managerId) === String(current?.userId || input.userId || '')) throw relationshipIssue('body.managerId', 'Employee cannot manage themselves');
    if (input.userId) {
      const duplicate = (await db.list('Employee', { userId: input.userId })).find((employee) => employee.id !== current?.id);
      if (duplicate) throw relationshipIssue('body.userId', 'User is already linked to another employee');
    }
    if (input.personnelCode && (await db.list('Employee', { personnelCode: input.personnelCode })).some((employee) => employee.id !== current?.id)) {
      throw relationshipIssue('body.personnelCode', 'Personnel code is already in use');
    }
    if (current && input.compensationType !== current.compensationType) {
      const employeeId = String(current.id);
      const hasCompensationHistory = await db.count('EmploymentCompensation', { employeeId }) > 0;
      const hasPayrollHistory = await db.count('PayrollRecord', { employeeId }) > 0;
      if (hasCompensationHistory || hasPayrollHistory) {
        throw new HttpError(409, 'نوع جبران خدمت این کارمند دارای سابقه است و تغییر مستقیم آن مجاز نیست. ابتدا باید انتقال روش پرداخت در یک دوره مؤثر جدید و با حفظ سوابق انجام شود.');
      }
    }
  },
  beforeDelete: async (req, id) => {
    const db = database.forOrganization(req.user!.organizationId);
    const employee = await db.get('Employee', id);
    if (!employee) return;
    const aliases = new Set([id, ...(typeof employee.userId === 'string' ? [employee.userId] : [])]);
    const referencedMember = (await db.list('ProjectMember')).some((member) => aliases.has(String(member.personId)));
    const managesProject = (await db.list('Project')).some((project) => aliases.has(String(project.managerId)));
    const hasTime = (await db.list('TimeEntry')).some((entry) => aliases.has(String(entry.employeeId)));
    const hasTasks = (await db.list('Task')).some((task) => aliases.has(String(task.assigneeId)) || [task.assigneeIds, task.followerIds].some((values) => Array.isArray(values) && values.some((value) => aliases.has(String(value)))));
    const hasPerformance = await db.count('PerformanceEvent', { employeeId: id }) || await db.count('PerformancePeriod', { employeeId: id });
    const hasPayroll = await db.count('PayrollRecord', { employeeId: id }) || await db.count('EmployeeContract', { employeeId: id });
    const hasMeetings = (await db.list('Meeting')).some((meeting) => aliases.has(String(meeting.organizerId)) || [meeting.employeeIds, meeting.participantIds].some((values) => Array.isArray(values) && values.some((value) => aliases.has(String(value)))));
    const hasOtherReferences = (await db.list('ProjectPhase')).some((phase) => aliases.has(String(phase.managerId)))
      || (await db.list('ProjectEvent')).some((event) => aliases.has(String(event.personId)))
      || await db.count('FileRecord', { employeeId: id });
    if (referencedMember || managesProject || hasTime || hasTasks || hasPerformance || hasPayroll || hasMeetings || hasOtherReferences) throw relationshipIssue('params.id', 'Employee is referenced by projects, tasks, time entries, performance, payroll, contracts, events, files, or meetings');
  },
});
export const projectRoutes = resource('Project', 'projects', { relationships: [{ field: 'managerId', resource: 'User' }, { field: 'members', resource: 'User', many: true }] });
export const taskRoutes = resource('Task', 'tasks', { relationships: [{ field: 'projectId', resource: 'Project' }, { field: 'assigneeId', resource: 'User' }, { field: 'assigneeIds', resource: 'User', many: true }, { field: 'followerIds', resource: 'User', many: true }], immutableRelationships: ['projectId'] });
