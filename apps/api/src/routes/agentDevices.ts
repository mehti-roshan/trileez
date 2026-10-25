import { Router } from 'express';
import type { Request } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateRequest, v } from '../middleware/validate.js';
import { idParamsSchema } from '../config/requestValidation.js';
import { listQuerySchema } from '../db/query.js';
import { HttpError } from '../utils/httpError.js';
import { AgentEnrollmentService, enrollmentListOptions } from '../services/agentEnrollment.js';
import { AgentDeviceOverviewService } from '../services/agentDeviceOverview.js';

const service = new AgentEnrollmentService();
const overview = new AgentDeviceOverviewService();
const employees = Router();
const managers = Router();
const internal = requireRole('admin', 'manager', 'member');
const management = requireRole('admin', 'manager');

const capability = v.string({ min: 1, max: 40 });
const enrollSchema = v.object({
  installationId: v.id,
  deviceName: v.string({ min: 1, max: 80 }),
  agentVersion: v.string({ min: 1, max: 40 }),
  capabilities: v.optional(v.array(capability, { max: 12 })),
  platform: v.optional(v.string({ min: 1, max: 40 })),
  osDescription: v.optional(v.string({ min: 1, max: 160 })),
});
const heartbeatSchema = v.object({
  agentVersion: v.optional(v.string({ min: 1, max: 40 })),
  capabilities: v.optional(v.array(capability, { max: 12 })),
});
const listSchema = listQuerySchema({ sortFields: ['enrolledAt', 'createdAt', 'deviceName'], defaultSort: 'enrolledAt', defaultDirection: 'desc' });

function actor(req: Request): { organizationId: string; userId: string } {
  return { organizationId: req.user!.organizationId, userId: req.user!.id };
}

function credentialHeader(req: Request, required: boolean): string | undefined {
  const value = req.get('x-device-credential');
  if (!value) {
    if (required) throw new HttpError(401, 'Device credential was rejected', 'DEVICE_CREDENTIAL_REJECTED');
    return undefined;
  }
  if (value.length > 128 || /\s/.test(value)) throw new HttpError(401, 'Device credential was rejected', 'DEVICE_CREDENTIAL_REJECTED');
  return value;
}

employees.post('/agent-devices', requireAuth, internal, validateRequest({ body: enrollSchema }), async (req, res, next) => {
  try {
    const result = await service.register(actor(req), req.body, credentialHeader(req, false));
    const body: Record<string, unknown> = { data: result.enrollment, created: result.created };
    if (result.credential) body.credential = result.credential;
    res.status(result.created ? 201 : 200).json(body);
  } catch (error) { next(error); }
});

employees.get('/agent-devices', requireAuth, internal, validateRequest({ query: listSchema }), async (req, res, next) => {
  try {
    res.json(await service.listMine(actor(req), enrollmentListOptions(req.validatedQuery || {}, `me-agent-devices:${req.user!.id}`)));
  } catch (error) { next(error); }
});

employees.get('/agent-devices/:id', requireAuth, internal, validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try {
    res.json({ data: await service.getMine(actor(req), req.params.id as string) });
  } catch (error) { next(error); }
});

employees.post('/agent-devices/:id/heartbeat', requireAuth, internal, validateRequest({ params: idParamsSchema, body: heartbeatSchema }), async (req, res, next) => {
  try {
    res.json({ data: await service.heartbeat(actor(req), req.params.id as string, credentialHeader(req, true)!, req.body) });
  } catch (error) { next(error); }
});

employees.post('/agent-devices/:id/disconnect', requireAuth, internal, validateRequest({ params: idParamsSchema, body: v.object({}) }), async (req, res, next) => {
  try {
    res.json({ data: await service.disconnect(actor(req), req.params.id as string, credentialHeader(req, true)!) });
  } catch (error) { next(error); }
});

employees.post('/agent-devices/:id/unregister', requireAuth, internal, validateRequest({ params: idParamsSchema, body: v.object({}) }), async (req, res, next) => {
  try {
    res.json({ data: await service.unregister(actor(req), req.params.id as string, credentialHeader(req, true)!) });
  } catch (error) { next(error); }
});

managers.get('/', requireAuth, management, validateRequest({ query: listSchema }), async (req, res, next) => {
  try {
    res.json(await overview.list(actor(req), enrollmentListOptions(req.validatedQuery || {}, 'agent-devices')));
  } catch (error) { next(error); }
});

managers.get('/:id', requireAuth, management, validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try {
    res.json({ data: await overview.get(actor(req), req.params.id as string) });
  } catch (error) { next(error); }
});

managers.post('/:id/revoke', requireAuth, management, validateRequest({ params: idParamsSchema, body: v.object({}) }), async (req, res, next) => {
  try {
    res.json({ data: await service.revoke(actor(req), req.params.id as string) });
  } catch (error) { next(error); }
});

managers.post('/:id/disable', requireAuth, management, validateRequest({ params: idParamsSchema, body: v.object({}) }), async (req, res, next) => {
  try {
    res.json({ data: await service.disable(actor(req), req.params.id as string) });
  } catch (error) { next(error); }
});

managers.post('/:id/enable', requireAuth, management, validateRequest({ params: idParamsSchema, body: v.object({}) }), async (req, res, next) => {
  try {
    res.json({ data: await service.enable(actor(req), req.params.id as string) });
  } catch (error) { next(error); }
});

export { managers as agentDeviceManagementRoutes };
export default employees;
