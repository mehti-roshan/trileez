import { Router } from 'express';
import { idParamsSchema } from '../config/requestValidation.js';
import { effectiveAccessQuerySchema, revealAccessSecretSchema } from '../config/projectAccessValidation.js';
import { projectAccessSchemas } from '../config/sensitiveValidation.js';
import { requireAuth, requireResourceAccess } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { ProjectAccessService } from '../services/projectAccess.js';
import { projectAccessListConfig, projectAccessListQuerySchema } from '../config/listQueries.js';
import { pageQuery } from '../db/query.js';

const router = Router();
const service = new ProjectAccessService();

router.get('/effective', requireAuth, validateRequest({ query: effectiveAccessQuerySchema }), async (req, res, next) => {
  try {
    const projectId = String(req.validatedQuery!.projectId);
    const projectMemberId = req.validatedQuery!.projectMemberId ? String(req.validatedQuery!.projectMemberId) : undefined;
    const result = await service.effectiveForActor(req.user!.organizationId, req.user!, projectId, projectMemberId);
    res.json(result);
  } catch (error) { next(error); }
});

router.get('/', requireAuth, requireResourceAccess('project-accesses', 'read'), validateRequest({ query: projectAccessListQuerySchema }), async (req, res, next) => {
  try { res.json(await service.listPage(req.user!.organizationId, pageQuery(req.validatedQuery || {}, projectAccessListConfig, 'project-accesses'))); } catch (error) { next(error); }
});

router.get('/:id/audit', requireAuth, requireResourceAccess('project-accesses', 'read'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const data = await service.auditHistory(req.user!.organizationId, req.params.id as string);
    if (!data) return res.status(404).json({ error: 'ProjectAccess not found' });
    res.json({ data });
  } catch (error) { next(error); }
});

router.post('/:id/secret/reveal', requireAuth, validateRequest({ params: idParamsSchema, body: revealAccessSecretSchema }), async (req, res, next) => {
  try { res.json({ data: await service.revealSecret(req.user!.organizationId, req.user!, req.params.id as string, req.body.reason, req.ip) }); } catch (error) { next(error); }
});

router.get('/:id', requireAuth, requireResourceAccess('project-accesses', 'read'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const data = await service.get(req.user!.organizationId, req.params.id as string);
    if (!data) return res.status(404).json({ error: 'ProjectAccess not found' });
    res.json({ data });
  } catch (error) { next(error); }
});

router.post('/bulk', requireAuth, requireResourceAccess('project-accesses', 'create'), validateRequest({ body: projectAccessSchemas.bulk }), async (req, res, next) => {
  try { res.status(201).json({ data: await service.bulkCreate(req.user!.organizationId, req.user!.id, req.body.items, req.ip) }); } catch (error) { next(error); }
});

router.post('/', requireAuth, requireResourceAccess('project-accesses', 'create'), validateRequest({ body: projectAccessSchemas.create }), async (req, res, next) => {
  try { res.status(201).json({ data: await service.create(req.user!.organizationId, req.user!.id, req.body, req.ip) }); } catch (error) { next(error); }
});

router.patch('/:id', requireAuth, requireResourceAccess('project-accesses', 'update'), validateRequest({ params: idParamsSchema, body: projectAccessSchemas.update }), async (req, res, next) => {
  try {
    const data = await service.update(req.user!.organizationId, req.user!.id, req.params.id as string, req.body, req.ip);
    if (!data) return res.status(404).json({ error: 'ProjectAccess not found' });
    res.json({ data });
  } catch (error) { next(error); }
});

router.delete('/:id', requireAuth, requireResourceAccess('project-accesses', 'delete'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const data = await service.update(req.user!.organizationId, req.user!.id, req.params.id as string, { status: 'revoked' }, req.ip);
    if (!data) return res.status(404).json({ error: 'ProjectAccess not found' });
    res.status(204).send();
  } catch (error) { next(error); }
});

export default router;
