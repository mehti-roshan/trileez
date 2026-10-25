import { Router } from 'express';
import { requireAuth, requirePermission, requireResourceAccess } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamsSchema } from '../config/requestValidation.js';
import {
  performanceAdjustmentSchema, performanceFinalizeSchema, performanceReopenSchema, performanceSummaryQuerySchema,
} from '../config/performanceValidation.js';
import { performanceService } from '../services/performance.js';
import { HttpError } from '../utils/httpError.js';
import { performanceEventListConfig, performanceEventListQuerySchema, performancePeriodListConfig, performancePeriodListQuerySchema } from '../config/listQueries.js';
import { pageQuery } from '../db/query.js';
import { database } from '../db/database.js';

export const performanceEventRoutes = Router();
performanceEventRoutes.get('/', requireAuth, requireResourceAccess('performance-events', 'read'), validateRequest({ query: performanceEventListQuerySchema }), async (req, res, next) => {
  try { res.json(await database.forOrganization(req.user!.organizationId).page('PerformanceEvent', pageQuery(req.validatedQuery || {}, performanceEventListConfig, 'performance-events'))); } catch (error) { next(error); }
});
performanceEventRoutes.get('/:id', requireAuth, requireResourceAccess('performance-events', 'read'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const data = await performanceService.getEvent(req.user!.organizationId, req.params.id as string);
    if (!data) return res.status(404).json({ error: 'Performance adjustment not found' });
    res.json({ data });
  } catch (error) { next(error); }
});
performanceEventRoutes.post('/', requireAuth, requireResourceAccess('performance-events', 'create'), validateRequest({ body: performanceAdjustmentSchema }), async (req, res, next) => {
  try {
    const result = await performanceService.createAdjustment(req.user!.organizationId, req.user!.id, req.body, req.ip);
    res.status(201).json({ data: result.event, period: result.period });
  } catch (error) { next(error); }
});

export const performancePeriodRoutes = Router();
performancePeriodRoutes.get('/', requireAuth, requireResourceAccess('performance-periods', 'read'), validateRequest({ query: performancePeriodListQuerySchema }), async (req, res, next) => {
  try { res.json(await database.forOrganization(req.user!.organizationId).page('PerformancePeriod', pageQuery(req.validatedQuery || {}, performancePeriodListConfig, 'performance-periods'))); } catch (error) { next(error); }
});
performancePeriodRoutes.post('/finalize', requireAuth, requireResourceAccess('performance-periods', 'create'), validateRequest({ body: performanceFinalizeSchema }), async (req, res, next) => {
  try {
    const period = req.body.period || req.body.startedAt;
    if (!period) throw new HttpError(400, 'Performance month is required');
    const data = await performanceService.finalize(req.user!.organizationId, req.user!.id, { employeeId: req.body.employeeId, period, notes: req.body.notes }, req.ip);
    res.status(201).json({ data });
  } catch (error) { next(error); }
});
// Compatibility alias for the existing frontend repository hydration. Client-supplied score fields are stripped.
performancePeriodRoutes.post('/', requireAuth, requireResourceAccess('performance-periods', 'create'), validateRequest({ body: performanceFinalizeSchema }), async (req, res, next) => {
  try {
    const period = req.body.period || req.body.startedAt;
    if (!period) throw new HttpError(400, 'Performance month is required');
    const data = await performanceService.finalize(req.user!.organizationId, req.user!.id, { employeeId: req.body.employeeId, period, notes: req.body.notes }, req.ip);
    res.status(201).json({ data });
  } catch (error) { next(error); }
});
performancePeriodRoutes.post('/:id/reopen', requireAuth, requireResourceAccess('performance-periods', 'update'), requirePermission('hr:reopen-performance'), validateRequest({ params: idParamsSchema, body: performanceReopenSchema }), async (req, res, next) => {
  try {
    const data = await performanceService.reopen(req.user!.organizationId, req.user!.id, req.params.id as string, req.body.reason, req.ip);
    if (!data) return res.status(404).json({ error: 'Performance period not found' });
    res.json({ data });
  } catch (error) { next(error); }
});
performancePeriodRoutes.get('/:id/audit', requireAuth, requireResourceAccess('performance-periods', 'read'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const data = await performanceService.auditForPeriod(req.user!.organizationId, req.params.id as string);
    if (!data) return res.status(404).json({ error: 'Performance period not found' });
    res.json({ data });
  } catch (error) { next(error); }
});
performancePeriodRoutes.get('/:id', requireAuth, requireResourceAccess('performance-periods', 'read'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const data = await performanceService.getPeriod(req.user!.organizationId, req.params.id as string);
    if (!data) return res.status(404).json({ error: 'Performance period not found' });
    res.json({ data });
  } catch (error) { next(error); }
});

export const performanceSummaryRoutes = Router();
performanceSummaryRoutes.get('/:id', requireAuth, requireResourceAccess('performance-periods', 'read'), validateRequest({ params: idParamsSchema, query: performanceSummaryQuerySchema }), async (req, res, next) => {
  try {
    const period = typeof req.validatedQuery?.period === 'string' ? req.validatedQuery.period : new Date().toISOString();
    const data = await performanceService.summary(req.user!.organizationId, req.params.id as string, period);
    if (!data) return res.status(404).json({ error: 'Employee not found' });
    res.json({ data });
  } catch (error) { next(error); }
});
