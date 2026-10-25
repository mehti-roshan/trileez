import { Router } from 'express';
import type { Request } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateRequest, v } from '../middleware/validate.js';
import { idParamsSchema } from '../config/requestValidation.js';
import { HttpError } from '../utils/httpError.js';
import { ApplicationUsageService, MAX_USAGE_BATCH, MAX_USAGE_DURATION_MS, assertSummaryUser } from '../services/applicationUsage.js';

const service = new ApplicationUsageService();
const employees = Router();
const managers = Router();
const internal = requireRole('admin', 'manager', 'member');
const management = requireRole('admin', 'manager');
const endReason = ['shutdown', 'disabled', 'lock', 'sleep', 'logout', 'restart', 'idle', 'manual', 'stop'] as const;
const processName = v.string({ min: 1, max: 64, pattern: /^[A-Za-z0-9][A-Za-z0-9 ._+()-]{0,63}$/ });
const displayName = v.string({ min: 1, max: 80, pattern: /^[^\u0000-\u001F\\/]{1,80}$/ });

const policySchema = v.object({
  enabled: v.boolean(),
  employeeMayPause: v.boolean(),
  idleThresholdSeconds: v.number({ integer: true, min: 30, max: 1800 }),
  retentionDays: v.number({ integer: true, min: 7, max: 90 }),
});
const preferenceSchema = v.object({ paused: v.boolean() });
const intervalSchema = v.object({
  clientIntervalId: v.id,
  processName,
  displayName: v.optional(displayName),
  startedAt: v.date,
  durationMs: v.number({ integer: true, min: 1, max: MAX_USAGE_DURATION_MS }),
});
const batchSchema = v.object({
  session: v.object({
    clientSessionId: v.id,
    startedAt: v.date,
    endedAt: v.optional(v.date),
    endReason: v.optional(v.string({ values: endReason })),
  }),
  intervals: v.array(intervalSchema, { max: MAX_USAGE_BATCH }),
});
const ownSummarySchema = v.object({
  from: v.optional(v.date),
  to: v.optional(v.date),
});
const managedSummarySchema = v.object({
  userId: v.optional(v.id),
  from: v.optional(v.date),
  to: v.optional(v.date),
});

function actor(req: Request): { organizationId: string; userId: string } {
  return { organizationId: req.user!.organizationId, userId: req.user!.id };
}

function credentialHeader(req: Request): string {
  const value = req.get('x-device-credential');
  if (!value || value.length > 128 || /\s/.test(value)) throw new HttpError(401, 'Device credential was rejected', 'DEVICE_CREDENTIAL_REJECTED');
  return value;
}

employees.get('/agent-devices/:id/usage-policy', requireAuth, internal, validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try {
    res.json({ data: await service.getPolicy(actor(req), req.params.id as string, credentialHeader(req)) });
  } catch (error) { next(error); }
});

employees.post('/agent-devices/:id/usage-preference', requireAuth, internal, validateRequest({ params: idParamsSchema, body: preferenceSchema }), async (req, res, next) => {
  try {
    res.json({ data: await service.setPreference(actor(req), req.params.id as string, credentialHeader(req), req.body.paused as boolean) });
  } catch (error) { next(error); }
});

employees.post('/agent-devices/:id/usage-batches', requireAuth, internal, validateRequest({ params: idParamsSchema, body: batchSchema }), async (req, res, next) => {
  try {
    res.json({ data: await service.upload(actor(req), req.params.id as string, credentialHeader(req), req.body) });
  } catch (error) { next(error); }
});

employees.get('/agent-usage/summary', requireAuth, internal, validateRequest({ query: ownSummarySchema }), async (req, res, next) => {
  try {
    const query = req.validatedQuery || {};
    res.json(await service.summary(actor(req), req.user!.id, query.from as string | undefined, query.to as string | undefined));
  } catch (error) { next(error); }
});

managers.put('/policy', requireAuth, management, validateRequest({ body: policySchema }), async (req, res, next) => {
  try {
    res.json({ data: await service.setPolicy(actor(req), req.body) });
  } catch (error) { next(error); }
});

managers.get('/summary', requireAuth, management, validateRequest({ query: managedSummarySchema }), async (req, res, next) => {
  try {
    const query = req.validatedQuery || {};
    const userId = typeof query.userId === 'string' ? query.userId : req.user!.id;
    await assertSummaryUser(actor(req), userId);
    res.json(await service.summary(actor(req), userId, query.from as string | undefined, query.to as string | undefined));
  } catch (error) { next(error); }
});

export { managers as applicationUsageManagementRoutes };
export default employees;
