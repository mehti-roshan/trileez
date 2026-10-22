import { Router } from 'express';
import type { Request, RequestHandler } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateRequest, v } from '../middleware/validate.js';
import { idParamsSchema } from '../config/requestValidation.js';
import { HttpError } from '../utils/httpError.js';
import { DeviceHealthService, MAX_HEALTH_BATCH, MAX_HEALTH_BYTES } from '../services/deviceHealth.js';

const service = new DeviceHealthService();
const employees = Router();
const managers = Router();
const internal = requireRole('admin', 'manager', 'member');
const management = requireRole('admin', 'manager');
const collectorPhase = ['stopped', 'running', 'offline', 'paused', 'disabled'] as const;
const syncPhase = ['idle', 'pending', 'retrying', 'offline', 'stopped', 'revoked'] as const;
const osName = v.string({ min: 1, max: 80, pattern: /^[^\u0000-\u001F\\/]{1,80}$/ });
const osVersion = v.string({ min: 1, max: 40, pattern: /^[^\u0000-\u001F\\/]{1,40}$/ });
const byteCount = { integer: true, min: 0, max: 1_000_000_000_000_000 } as const;

const sampleSchema = v.object({
  clientSampleId: v.id,
  sampledAt: v.date,
  cpuPercent: v.optional(v.number({ min: 0, max: 100 })),
  memoryUsedBytes: v.optional(v.number(byteCount)),
  memoryTotalBytes: v.optional(v.number(byteCount)),
  diskFreeBytes: v.optional(v.number(byteCount)),
  diskTotalBytes: v.optional(v.number(byteCount)),
  osName: v.optional(osName),
  osVersion: v.optional(osVersion),
  architecture: v.optional(v.string({ min: 1, max: 16, pattern: /^[A-Za-z0-9][A-Za-z0-9_-]{0,15}$/ })),
  agentVersion: v.string({ min: 1, max: 32, pattern: /^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$/ }),
  online: v.boolean(),
  lastHeartbeatAt: v.optional(v.date),
  collectorPhase: v.string({ values: collectorPhase }),
  syncPhase: v.string({ values: syncPhase }),
  queueDepth: v.number({ integer: true, min: 0, max: 10_000 }),
  pendingBytes: v.number({ integer: true, min: 0, max: 1_000_000_000_000 }),
});
const batchSchema = v.object({
  samples: v.array(sampleSchema, { max: MAX_HEALTH_BATCH }),
});
const summarySchema = v.object({
  deviceId: v.optional(v.id),
});

function actor(req: Request): { organizationId: string; userId: string } {
  return { organizationId: req.user!.organizationId, userId: req.user!.id };
}

function credentialHeader(req: Request): string {
  const value = req.get('x-device-credential');
  if (!value || value.length > 128 || /\s/.test(value)) throw new HttpError(401, 'Device credential was rejected', 'DEVICE_CREDENTIAL_REJECTED');
  return value;
}

const limitHealthPayload: RequestHandler = (req, _res, next) => {
  try {
    const declared = Number(req.get('content-length') || 0);
    const actual = Buffer.byteLength(JSON.stringify(req.body ?? {}), 'utf8');
    if ((Number.isFinite(declared) && declared > MAX_HEALTH_BYTES) || actual > MAX_HEALTH_BYTES) {
      throw new HttpError(413, 'Health payload is too large', 'PAYLOAD_TOO_LARGE');
    }
    next();
  } catch (error) { next(error); }
};

employees.post('/agent-devices/:id/health-batches', requireAuth, internal, limitHealthPayload, validateRequest({ params: idParamsSchema, body: batchSchema }), async (req, res, next) => {
  try {
    res.json({ data: await service.upload(actor(req), req.params.id as string, credentialHeader(req), req.body) });
  } catch (error) { next(error); }
});

employees.get('/agent-devices/:id/health', requireAuth, internal, validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try {
    res.json({ data: await service.own(actor(req), req.params.id as string, credentialHeader(req)) });
  } catch (error) { next(error); }
});

managers.get('/summary', requireAuth, management, validateRequest({ query: summarySchema }), async (req, res, next) => {
  try {
    const query = req.validatedQuery || {};
    res.json(await service.summary(actor(req), typeof query.deviceId === 'string' ? query.deviceId : undefined));
  } catch (error) { next(error); }
});

export { managers as deviceHealthManagementRoutes };
export default employees;
