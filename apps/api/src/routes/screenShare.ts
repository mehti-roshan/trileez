import { Router } from 'express';
import express from 'express';
import type { Request, RequestHandler } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateRequest, v } from '../middleware/validate.js';
import { idParamsSchema } from '../config/requestValidation.js';
import { HttpError } from '../utils/httpError.js';
import { MAX_FRAME_BYTES, ScreenShareService } from '../services/screenShare.js';

const service = new ScreenShareService();
const employees = Router();
const managers = Router();
const internal = requireRole('admin', 'manager', 'member');
const management = requireRole('admin', 'manager');
const employeeEnd = ['employee_stop', 'rejected', 'shutdown', 'agent_lost'] as const;
const sessionParams = v.object({ id: v.id, sessionId: v.id });
const createSchema = v.object({
  requestNote: v.optional(v.string({ min: 1, max: 120, pattern: /^[^\u0000-\u001F]{1,120}$/ })),
  qualityMode: v.optional(v.string({ values: ['assistance', 'high'] })),
  maxFps: v.optional(v.number({ min: 1, max: 30, integer: true })),
  maxEdge: v.optional(v.number({ min: 640, max: 1920, integer: true })),
  jpegQuality: v.optional(v.number({ min: 30, max: 85, integer: true })),
});
const qualitySchema = v.object({
  qualityMode: v.string({ values: ['assistance', 'high'] }),
  maxFps: v.optional(v.number({ min: 1, max: 30, integer: true })),
  maxEdge: v.optional(v.number({ min: 640, max: 1920, integer: true })),
  jpegQuality: v.optional(v.number({ min: 30, max: 85, integer: true })),
});
const endSchema = v.object({
  reason: v.string({ values: employeeEnd }),
});
const supportControlSchema = v.object({
  action: v.string({ values: ['request', 'revoke'] }),
});
const employeeControlSchema = v.object({
  action: v.string({ values: ['grant', 'deny', 'revoke'] }),
  grantId: v.string({ min: 4, max: 80, pattern: /^cg-[0-9a-f-]{36}$/ }),
});
const inputSchema = v.object({
  grantId: v.string({ min: 4, max: 80, pattern: /^cg-[0-9a-f-]{36}$/ }),
});
const sessionOnly = v.object({ id: v.id });

function actor(req: Request): { organizationId: string; userId: string } {
  return { organizationId: req.user!.organizationId, userId: req.user!.id };
}

function credentialHeader(req: Request): string {
  const value = req.get('x-device-credential');
  if (!value || value.length > 128 || /\s/.test(value)) throw new HttpError(401, 'Device credential was rejected', 'DEVICE_CREDENTIAL_REJECTED');
  return value;
}

function mediaType(req: Request): string {
  return (req.get('content-type') || '').split(';')[0]?.trim().toLowerCase() || '';
}

const readFrame: RequestHandler = (req, res, next) => {
  const declared = Number(req.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > MAX_FRAME_BYTES) {
    next(new HttpError(413, 'Screen frame is too large', 'SCREEN_FRAME_TOO_LARGE'));
    return;
  }
  if (mediaType(req) !== 'image/jpeg') {
    next();
    return;
  }
  express.raw({
    type: () => true,
    limit: MAX_FRAME_BYTES,
  })(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status?: number }).status) : 0;
    if (status === 413) next(new HttpError(413, 'Screen frame is too large', 'SCREEN_FRAME_TOO_LARGE'));
    else next(error);
  });
};

employees.get('/agent-devices/:id/screen-session', requireAuth, internal, validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try {
    res.set('cache-control', 'no-store');
    res.json({ data: await service.employeeCurrent(actor(req), req.params.id as string, credentialHeader(req)) });
  } catch (error) { next(error); }
});

employees.post('/agent-devices/:id/screen-sessions/:sessionId/accept', requireAuth, internal, validateRequest({ params: sessionParams }), async (req, res, next) => {
  try {
    res.json({ data: await service.accept(actor(req), req.params.id as string, req.params.sessionId as string, credentialHeader(req)) });
  } catch (error) { next(error); }
});

employees.post('/agent-devices/:id/screen-sessions/:sessionId/control', requireAuth, internal, validateRequest({ params: sessionParams, body: employeeControlSchema }), async (req, res, next) => {
  try {
    res.set('cache-control', 'no-store');
    res.json({ data: await service.employeeControl(actor(req), req.params.id as string, req.params.sessionId as string, credentialHeader(req), req.body.action, req.body.grantId) });
  } catch (error) { next(error); }
});

employees.post('/agent-devices/:id/screen-sessions/:sessionId/end', requireAuth, internal, validateRequest({ params: sessionParams, body: endSchema }), async (req, res, next) => {
  try {
    res.json({ data: await service.employeeEnd(actor(req), req.params.id as string, req.params.sessionId as string, credentialHeader(req), req.body.reason) });
  } catch (error) { next(error); }
});

employees.post('/agent-devices/:id/screen-sessions/:sessionId/frames', requireAuth, internal, readFrame, validateRequest({ params: sessionParams }), async (req, res, next) => {
  try {
    if (mediaType(req) !== 'image/jpeg' || !Buffer.isBuffer(req.body)) {
      throw new HttpError(400, 'Screen frame is not a JPEG', 'SCREEN_FRAME_INVALID');
    }
    res.set('cache-control', 'no-store');
    res.json({ data: await service.uploadFrame(actor(req), req.params.id as string, req.params.sessionId as string, credentialHeader(req), req.body) });
  } catch (error) { next(error); }
});

managers.post('/agent-devices/:id/screen-sessions', requireAuth, management, validateRequest({ params: idParamsSchema, body: createSchema }), async (req, res, next) => {
  try {
    const result = await service.create(actor(req), req.params.id as string, req.body);
    res.status(result.created ? 201 : 200).json({ data: result.session, created: result.created });
  } catch (error) { next(error); }
});

managers.get('/agent-screen-sessions/:id', requireAuth, management, validateRequest({ params: sessionOnly }), async (req, res, next) => {
  try {
    res.set('cache-control', 'no-store');
    res.json({ data: await service.supportGet(actor(req), req.params.id as string) });
  } catch (error) { next(error); }
});

managers.get('/agent-screen-sessions/:id/frame', requireAuth, management, validateRequest({ params: sessionOnly }), async (req, res, next) => {
  try {
    const frame = await service.supportFrame(actor(req), req.params.id as string);
    res.set('cache-control', 'no-store');
    if (frame.status === 200 && frame.bytes) {
      res.status(200).type('image/jpeg').send(frame.bytes);
      return;
    }
    if (frame.status === 409) {
      res.status(409).json({ error: 'Screen session has ended', code: 'SCREEN_SESSION_ENDED' });
      return;
    }
    res.status(204).end();
  } catch (error) { next(error); }
});

managers.post('/agent-screen-sessions/:id/quality', requireAuth, management, validateRequest({ params: sessionOnly, body: qualitySchema }), async (req, res, next) => {
  try {
    res.set('cache-control', 'no-store');
    res.json({ data: await service.setQuality(actor(req), req.params.id as string, req.body) });
  } catch (error) { next(error); }
});

managers.post('/agent-screen-sessions/:id/control', requireAuth, management, validateRequest({ params: sessionOnly, body: supportControlSchema }), async (req, res, next) => {
  try {
    res.set('cache-control', 'no-store');
    res.json({ data: await service.supportControl(actor(req), req.params.id as string, req.body.action) });
  } catch (error) { next(error); }
});

managers.post('/agent-screen-sessions/:id/input', requireAuth, management, validateRequest({ params: sessionOnly, body: inputSchema }), async (req, res, next) => {
  try {
    await service.rejectInput(actor(req), req.params.id as string, req.body.grantId);
  } catch (error) { next(error); }
});

managers.post('/agent-screen-sessions/:id/end', requireAuth, management, validateRequest({ params: sessionOnly }), async (req, res, next) => {
  try {
    res.json({ data: await service.supportEnd(actor(req), req.params.id as string) });
  } catch (error) { next(error); }
});

export { managers as screenShareManagementRoutes };
export default employees;
