import { Router } from 'express';
import { idParamsSchema } from '../config/requestValidation.js';
import { legacyDatabase } from '../db/legacy.js';
import { listQuerySchema, pageQuery } from '../db/query.js';
import { requireAuth, requireResourceAccess } from '../middleware/auth.js';
import { validateRequest, v } from '../middleware/validate.js';
import { auditService } from '../services/audit.js';

const router = Router();
const listConfig = { sortFields: ['createdAt'] as const, defaultSort: 'createdAt', defaultDirection: 'desc' as const };
const updateSchema = v.object({ read: v.boolean() }, { atLeastOne: true });

export function notificationListOptions(userId: string, query: Record<string, unknown>) {
  const options = pageQuery(query, listConfig, `notifications:${userId}`);
  options.accessFilter = { 'payload.recipientId': userId };
  options.accessPredicate = (row) => row.recipientId === userId;
  return options;
}

export async function ownedNotification(organizationId: string, userId: string, notificationId: string) {
  const notification = await legacyDatabase.get(organizationId, 'notifications', notificationId);
  return notification?.recipientId === userId ? notification : undefined;
}

router.get('/notifications', requireAuth, requireResourceAccess('notifications', 'read'), validateRequest({ query: listQuerySchema(listConfig) }), async (req, res, next) => {
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

router.patch('/notifications/:id', requireAuth, requireResourceAccess('notifications', 'update'), validateRequest({ params: idParamsSchema, body: updateSchema }), async (req, res, next) => {
  try {
    const current = await ownedNotification(req.user!.organizationId, req.user!.id, req.params.id as string);
    if (!current) return res.status(404).json({ error: 'Notification not found' });
    const data = await legacyDatabase.update(req.user!.organizationId, 'notifications', current.id, { read: req.body.read });
    await auditService.record({ organizationId: req.user!.organizationId, actorId: req.user!.id, action: 'notification.read_state_changed', entityType: 'Legacy:notifications', entityId: current.id, before: current, after: data });
    res.json({ data });
  } catch (error) { next(error); }
});

router.delete('/notifications/:id', requireAuth, requireResourceAccess('notifications', 'delete'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const current = await ownedNotification(req.user!.organizationId, req.user!.id, req.params.id as string);
    if (!current) return res.status(404).json({ error: 'Notification not found' });
    await legacyDatabase.remove(req.user!.organizationId, 'notifications', current.id);
    await auditService.record({ organizationId: req.user!.organizationId, actorId: req.user!.id, action: 'notification.deleted', entityType: 'Legacy:notifications', entityId: current.id, before: current });
    res.status(204).send();
  } catch (error) { next(error); }
});

export default router;
