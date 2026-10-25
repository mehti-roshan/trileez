import { createHash } from 'node:crypto';
import { logger } from './logger.js';
import { recordSecurityEvent } from './metrics.js';
import { currentRequestContext } from '../middleware/requestContext.js';

export function securityPrincipal(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex').slice(0, 16);
}

export function logSecurityEvent(event: string, fields: Record<string, unknown> = {}, level: 'info' | 'warn' = 'warn'): void {
  recordSecurityEvent(event);
  const context = currentRequestContext();
  logger[level]('security_event', {
    event, ...(context?.ip ? { ip: context.ip } : {}), ...(context?.userAgent ? { userAgent: context.userAgent } : {}), ...fields,
  });
}
