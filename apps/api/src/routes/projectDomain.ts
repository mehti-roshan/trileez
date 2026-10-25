import { Router } from 'express';
import type { Request } from 'express';
import { requireAuth, requireResourceAccess } from '../middleware/auth.js';
import { validateRequest, v } from '../middleware/validate.js';
import { dedicatedMutationSchemas, idParamsSchema } from '../config/requestValidation.js';
import { activitySchemas, memberSchemas, phaseSchemas, roleSchemas, timeEntryBillingSchema, timeEntryReviewSchema, timeEntrySchemas } from '../config/projectValidation.js';
import { database } from '../db/database.js';
import { ProjectDomainService, recalculateProject } from '../services/projectDomain.js';
import type { ResourceAccessName } from '../config/resourceAccess.js';
import type { ValueSchema } from '../middleware/validate.js';
import { listQuerySchema, pageQuery } from '../db/query.js';
import type { DatabasePageOptions } from '../db/query.js';
import { memberRecordScope } from '../services/employeeIdentity.js';
import type { OwnerScope } from '../services/employeeIdentity.js';
import { projectListConfig, projectListQuerySchema, taskListConfig, taskListQuerySchema } from '../config/listQueries.js';
import type { ListQueryConfig } from '../db/query.js';
import type { ResourceName } from '../types/entities.js';

const service = new ProjectDomainService();

export const projectRoutes = Router();
const projectSchemas = dedicatedMutationSchemas.Project!;
projectRoutes.get('/', requireAuth, requireResourceAccess('projects', 'read'), validateRequest({ query: projectListQuerySchema }), async (req, res, next) => { try {
  const db = database.forOrganization(req.user!.organizationId);
  const result = await db.page('Project', pageQuery(req.validatedQuery || {}, projectListConfig, 'projects'));
  await Promise.all(result.data.map((project) => recalculateProject(req.user!.organizationId, project.id)));
  result.data = (await Promise.all(result.data.map((project) => db.get('Project', project.id)))).filter((project) => Boolean(project)) as typeof result.data;
  res.json(result);
} catch (error) { next(error); } });
projectRoutes.get('/:id', requireAuth, requireResourceAccess('projects', 'read'), validateRequest({ params: idParamsSchema }), async (req, res, next) => { try { await recalculateProject(req.user!.organizationId, req.params.id as string); const data = await database.forOrganization(req.user!.organizationId).get('Project', req.params.id as string); if (!data) return res.status(404).json({ error: 'Project not found' }); res.json({ data }); } catch (error) { next(error); } });
projectRoutes.post('/', requireAuth, requireResourceAccess('projects', 'create'), validateRequest({ body: projectSchemas.create }), async (req, res, next) => { try { res.status(201).json({ data: await service.createProject(req.user!.organizationId, req.user!.id, req.body, req.ip) }); } catch (error) { next(error); } });
projectRoutes.patch('/:id', requireAuth, requireResourceAccess('projects', 'update'), validateRequest({ params: idParamsSchema, body: projectSchemas.update }), async (req, res, next) => { try { const data = await service.updateProject(req.user!.organizationId, req.user!.id, req.params.id as string, req.body, req.ip); if (!data) return res.status(404).json({ error: 'Project not found' }); res.json({ data }); } catch (error) { next(error); } });
projectRoutes.delete('/:id', requireAuth, requireResourceAccess('projects', 'delete'), validateRequest({ params: idParamsSchema }), async (req, res, next) => { try { if (!await service.removeProject(req.user!.organizationId, req.user!.id, req.params.id as string, req.ip)) return res.status(404).json({ error: 'Project not found' }); res.status(204).send(); } catch (error) { next(error); } });

export const taskRoutes = Router();
const taskSchemas = dedicatedMutationSchemas.Task!;
taskRoutes.get('/', requireAuth, requireResourceAccess('tasks', 'read'), validateRequest({ query: taskListQuerySchema }), async (req, res, next) => { try { res.json(await database.forOrganization(req.user!.organizationId).page('Task', pageQuery(req.validatedQuery || {}, taskListConfig, 'tasks'))); } catch (error) { next(error); } });
taskRoutes.get('/:id', requireAuth, requireResourceAccess('tasks', 'read'), validateRequest({ params: idParamsSchema }), async (req, res, next) => { try { const data = await database.forOrganization(req.user!.organizationId).get('Task', req.params.id as string); if (!data) return res.status(404).json({ error: 'Task not found' }); res.json({ data }); } catch (error) { next(error); } });
taskRoutes.post('/', requireAuth, requireResourceAccess('tasks', 'create'), validateRequest({ body: taskSchemas.create }), async (req, res, next) => { try { res.status(201).json({ data: await service.createTask(req.user!.organizationId, req.user!.id, req.body, req.ip) }); } catch (error) { next(error); } });
taskRoutes.patch('/:id', requireAuth, requireResourceAccess('tasks', 'update'), validateRequest({ params: idParamsSchema, body: taskSchemas.update }), async (req, res, next) => { try { const data = await service.updateTask(req.user!.organizationId, req.user!.id, req.params.id as string, req.body, req.ip); if (!data) return res.status(404).json({ error: 'Task not found' }); res.json({ data }); } catch (error) { next(error); } });
taskRoutes.delete('/:id', requireAuth, requireResourceAccess('tasks', 'delete'), validateRequest({ params: idParamsSchema }), async (req, res, next) => { try { if (!await service.removeTask(req.user!.organizationId, req.user!.id, req.params.id as string, req.ip)) return res.status(404).json({ error: 'Task not found' }); res.status(204).send(); } catch (error) { next(error); } });

interface DomainSchemas { create: ValueSchema<Record<string, unknown>>; update: ValueSchema<Record<string, unknown>>; bulk: ValueSchema<Record<string, unknown>> }
type DomainKind = 'phase' | 'role' | 'activity' | 'member' | 'timeEntry';
const optionalId = v.optional(v.id); const optionalShort = v.optional(v.string({ min: 1, max: 250 }));
const domainList: Record<DomainKind, { model: ResourceName; config: ListQueryConfig }> = {
  phase: { model: 'ProjectPhase', config: { filters: { projectId: optionalId, managerId: optionalId, status: optionalShort }, ranges: { from: { field: 'startDate', bound: 'gte' }, to: { field: 'endDate', bound: 'lte' } }, searchFields: ['title', 'description'], sortFields: ['createdAt', 'startDate', 'endDate', 'title'], defaultSort: 'startDate' } },
  role: { model: 'ProjectRole', config: { filters: { projectId: optionalId }, searchFields: ['name', 'description'], sortFields: ['createdAt', 'name'] } },
  activity: { model: 'ProjectActivity', config: { filters: { projectId: optionalId, roleId: optionalId }, searchFields: ['title', 'description', 'objective'], sortFields: ['createdAt', 'title'] } },
  member: { model: 'ProjectMember', config: { filters: { projectId: optionalId, personId: optionalId, status: optionalShort }, ranges: { joinedFrom: { field: 'joinedAt', bound: 'gte' }, joinedTo: { field: 'joinedAt', bound: 'lte' } }, sortFields: ['createdAt', 'joinedAt'] } },
  timeEntry: { model: 'TimeEntry', config: { filters: { projectId: optionalId, taskId: optionalId, employeeId: optionalId, status: optionalShort }, ranges: { from: { field: 'date', bound: 'gte' }, to: { field: 'date', bound: 'lte' } }, searchFields: ['description'], sortFields: ['date', 'createdAt', 'hours'], defaultSort: 'date' } },
};
function applyScope(options: DatabasePageOptions, scope: OwnerScope | undefined): DatabasePageOptions {
  if (!scope) return options;
  options.accessFilter = scope.accessFilter;
  options.accessPredicate = scope.accessPredicate;
  return options;
}
function relationRouter(kind: DomainKind, resource: ResourceAccessName, schemas: DomainSchemas, ownScope?: (req: Request) => Promise<OwnerScope | undefined>): Router {
  const router = Router();
  const list = domainList[kind];
  router.get('/', requireAuth, requireResourceAccess(resource, 'read'), validateRequest({ query: listQuerySchema(list.config) }), async (req, res, next) => {
    try {
      const options = applyScope(pageQuery(req.validatedQuery || {}, list.config, resource), ownScope ? await ownScope(req) : undefined);
      res.json(await database.forOrganization(req.user!.organizationId).page(list.model, options));
    } catch (error) { next(error); }
  });
  router.get('/:id', requireAuth, requireResourceAccess(resource, 'read'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
    try {
      const data = await service.get(req.user!.organizationId, kind, req.params.id as string);
      const scope = ownScope ? await ownScope(req) : undefined;
      if (!data || (scope && !scope.accessPredicate(data))) return res.status(404).json({ error: 'Record not found' });
      res.json({ data });
    } catch (error) { next(error); }
  });
  router.post('/bulk', requireAuth, requireResourceAccess(resource, 'create'), validateRequest({ body: schemas.bulk }), async (req, res, next) => { try { const data = []; for (const item of req.body.items) data.push(await service.create(req.user!.organizationId, req.user!.id, kind, item, req.ip)); res.status(201).json({ data }); } catch (error) { next(error); } });
  router.post('/', requireAuth, requireResourceAccess(resource, 'create'), validateRequest({ body: schemas.create }), async (req, res, next) => { try { res.status(201).json({ data: await service.create(req.user!.organizationId, req.user!.id, kind, req.body, req.ip) }); } catch (error) { next(error); } });
  router.patch('/:id', requireAuth, requireResourceAccess(resource, 'update'), validateRequest({ params: idParamsSchema, body: schemas.update }), async (req, res, next) => { try { const data = await service.update(req.user!.organizationId, req.user!.id, kind, req.params.id as string, req.body, req.ip); if (!data) return res.status(404).json({ error: 'Record not found' }); res.json({ data }); } catch (error) { next(error); } });
  router.delete('/:id', requireAuth, requireResourceAccess(resource, 'delete'), validateRequest({ params: idParamsSchema }), async (req, res, next) => { try { if (!await service.remove(req.user!.organizationId, req.user!.id, kind, req.params.id as string, req.ip)) return res.status(404).json({ error: 'Record not found' }); res.status(204).send(); } catch (error) { next(error); } });
  return router;
}

const timesheetRoutes = relationRouter('timeEntry', 'timesheets', timeEntrySchemas, (req) => memberRecordScope(req.user!.organizationId, req.user!.id, req.user!.role));
timesheetRoutes.patch('/:id/review', requireAuth, requireResourceAccess('timesheets', 'update'), validateRequest({ params: idParamsSchema, body: timeEntryReviewSchema }), async (req, res, next) => {
  try { const data = await service.reviewTimeEntry(req.user!.organizationId, req.user!.id, req.params.id as string, req.body, req.ip); if (!data) return res.status(404).json({ error: 'Time entry not found' }); res.json({ data }); } catch (error) { next(error); }
});
timesheetRoutes.patch('/:id/billing', requireAuth, requireResourceAccess('timesheets', 'update'), validateRequest({ params: idParamsSchema, body: timeEntryBillingSchema }), async (req, res, next) => {
  try { const data = await service.updateTimeEntryBilling(req.user!.organizationId, req.user!.id, req.params.id as string, req.body, req.ip); if (!data) return res.status(404).json({ error: 'Time entry not found' }); res.json({ data }); } catch (error) { next(error); }
});

export const projectDomainDataRoutes = [
  ['project-phases', relationRouter('phase', 'project-phases', phaseSchemas)],
  ['project-roles', relationRouter('role', 'project-roles', roleSchemas)],
  ['project-activities', relationRouter('activity', 'project-activities', activitySchemas)],
  ['project-members', relationRouter('member', 'project-members', memberSchemas)],
  ['timesheets', timesheetRoutes],
] as const;
