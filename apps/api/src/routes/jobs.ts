import { Router } from 'express';
import { database } from '../db/database.js';
import { jobListConfig, jobListQuerySchema, recurringTaskListConfig, recurringTaskListQuerySchema } from '../config/listQueries.js';
import { reportJobSchema, recurringTaskCreateSchema, recurringTaskUpdateSchema } from '../config/jobValidation.js';
import { idParamsSchema } from '../config/requestValidation.js';
import { pageQuery } from '../db/query.js';
import { requireAuth, requireResourceAccess } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { auditService } from '../services/audit.js';
import { jobQueue } from '../jobs/queue.js';
import { recurringTasks } from '../jobs/recurring.js';
import type { BackgroundJobRecord, RecurringTaskRecord } from '../jobs/types.js';

const router = Router();

router.get('/stats', requireAuth, requireResourceAccess('jobs', 'read'), async (req, res, next) => {
  try {
    const db = database.forOrganization(req.user!.organizationId);
    const statuses = ['queued', 'running', 'retry_wait', 'completed', 'failed', 'cancelled'] as const;
    const counts = await Promise.all(statuses.map((status) => db.count('BackgroundJob', { status })));
    const recurring = await db.count('RecurringTask', { enabled: true });
    res.json({ data: { ...Object.fromEntries(statuses.map((status, index) => [status, counts[index]])), recurring } });
  } catch (error) { next(error); }
});

router.get('/recurring', requireAuth, requireResourceAccess('jobs', 'read'), validateRequest({ query: recurringTaskListQuerySchema }), async (req, res, next) => {
  try { res.json(await database.forOrganization(req.user!.organizationId).page<RecurringTaskRecord>('RecurringTask', pageQuery(req.validatedQuery || {}, recurringTaskListConfig, 'jobs:recurring'))); } catch (error) { next(error); }
});

router.post('/recurring', requireAuth, requireResourceAccess('jobs', 'create'), validateRequest({ body: recurringTaskCreateSchema }), async (req, res, next) => {
  try {
    const data = await recurringTasks.create({ organizationId: req.user!.organizationId, actorId: req.user!.id, name: req.body.name, jobType: req.body.jobType, payload: req.body.payload || {}, intervalMinutes: req.body.intervalMinutes, nextRunAt: req.body.nextRunAt, enabled: req.body.enabled });
    await auditService.record({ organizationId: req.user!.organizationId, actorId: req.user!.id, action: 'jobs.recurring.created', entityType: 'RecurringTask', entityId: data.id, after: data });
    res.status(201).json({ data });
  } catch (error) { next(error); }
});

router.patch('/recurring/:id', requireAuth, requireResourceAccess('jobs', 'update'), validateRequest({ params: idParamsSchema, body: recurringTaskUpdateSchema }), async (req, res, next) => {
  try {
    const db = database.forOrganization(req.user!.organizationId); const before = await db.get('RecurringTask', req.params.id as string);
    const data = await recurringTasks.update(req.user!.organizationId, req.params.id as string, req.user!.id, req.body);
    await auditService.record({ organizationId: req.user!.organizationId, actorId: req.user!.id, action: 'jobs.recurring.updated', entityType: 'RecurringTask', entityId: data.id, before, after: data });
    res.json({ data });
  } catch (error) { next(error); }
});

router.post('/reports', requireAuth, requireResourceAccess('jobs', 'create'), validateRequest({ body: reportJobSchema }), async (req, res, next) => {
  try {
    const data = await jobQueue.enqueue({ organizationId: req.user!.organizationId, type: 'report.generate', payload: req.body, createdBy: req.user!.id,
      ...(req.requestId ? { requestId: req.requestId } : {}), idempotencyKey: `report:${req.user!.id}:${req.requestId}` });
    await auditService.record({ organizationId: req.user!.organizationId, actorId: req.user!.id, action: 'jobs.report.requested', entityType: 'BackgroundJob', entityId: data.id, metadata: { resource: req.body.resource, format: req.body.format } });
    res.status(202).json({ data });
  } catch (error) { next(error); }
});

router.get('/', requireAuth, requireResourceAccess('jobs', 'read'), validateRequest({ query: jobListQuerySchema }), async (req, res, next) => {
  try { res.json(await database.forOrganization(req.user!.organizationId).page<BackgroundJobRecord>('BackgroundJob', pageQuery(req.validatedQuery || {}, jobListConfig, 'jobs'))); } catch (error) { next(error); }
});

router.get('/:id', requireAuth, requireResourceAccess('jobs', 'read'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try { const data = await database.forOrganization(req.user!.organizationId).get('BackgroundJob', req.params.id as string); if (!data) return res.status(404).json({ error: 'Background job not found' }); res.json({ data }); } catch (error) { next(error); }
});

router.post('/:id/retry', requireAuth, requireResourceAccess('jobs', 'update'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try { const data = await jobQueue.retry(req.user!.organizationId, req.params.id as string); await auditService.record({ organizationId: req.user!.organizationId, actorId: req.user!.id, action: 'jobs.retried', entityType: 'BackgroundJob', entityId: data.id, after: data }); res.json({ data }); } catch (error) { next(error); }
});

router.delete('/:id', requireAuth, requireResourceAccess('jobs', 'delete'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try { const data = await jobQueue.cancel(req.user!.organizationId, req.params.id as string); await auditService.record({ organizationId: req.user!.organizationId, actorId: req.user!.id, action: 'jobs.cancelled', entityType: 'BackgroundJob', entityId: data.id, after: data }); res.status(204).send(); } catch (error) { next(error); }
});

export default router;
