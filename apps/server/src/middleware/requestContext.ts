import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

export interface RequestContext {
  requestId: string;
  correlationId: string;
  ip?: string;
  userAgent?: string;
  actorId?: string;
  organizationId?: string;
}

const requestStorage = new AsyncLocalStorage<RequestContext>();
const safeRequestId = /^[A-Za-z0-9._:-]{8,200}$/;

export const requestContextMiddleware: RequestHandler = (req, res, next) => {
  const supplied = req.get('x-request-id');
  const requestId = supplied && safeRequestId.test(supplied) ? supplied : randomUUID();
  const suppliedCorrelation = req.get('x-correlation-id');
  const correlationId = suppliedCorrelation && safeRequestId.test(suppliedCorrelation) ? suppliedCorrelation : requestId;
  const userAgent = req.get('user-agent');
  const context: RequestContext = {
    requestId, correlationId,
    ...(req.ip ? { ip: req.ip } : {}),
    ...(userAgent ? { userAgent: userAgent.slice(0, 1000) } : {}),
  };
  req.requestId = requestId;
  req.correlationId = correlationId;
  res.setHeader('x-request-id', requestId);
  res.setHeader('x-correlation-id', correlationId);
  requestStorage.run(context, next);
};

export function currentRequestContext(): RequestContext | undefined { return requestStorage.getStore(); }

export function attachRequestActor(actorId: string, organizationId: string): void {
  const context = requestStorage.getStore();
  if (context) Object.assign(context, { actorId, organizationId });
}
