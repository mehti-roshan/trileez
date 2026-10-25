import { Router } from 'express';
import { database } from '../db/database.js';
import { idParamsSchema } from '../config/requestValidation.js';
import { requireAuth, requireResourceAccess } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { auditListConfig, auditListQuerySchema } from '../config/listQueries.js';
import { pageQuery } from '../db/query.js';

const router = Router();

router.get('/', requireAuth, requireResourceAccess('audit', 'read'), validateRequest({ query: auditListQuerySchema }), async (req, res, next) => {
  try {
    res.json(await database.forOrganization(req.user!.organizationId).page('AuditLog', pageQuery(req.validatedQuery || {}, auditListConfig, 'audit')));
  } catch (error) { next(error); }
});

router.get('/:id', requireAuth, requireResourceAccess('audit', 'read'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const data = await database.forOrganization(req.user!.organizationId).get('AuditLog', req.params.id as string);
    if (!data) return res.status(404).json({ error: 'Audit record not found' });
    res.json({ data });
  } catch (error) { next(error); }
});

export default router;
