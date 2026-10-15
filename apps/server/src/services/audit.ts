import { database } from '../db/database.js';
import { currentRequestContext } from '../middleware/requestContext.js';
import type { AppRecord } from '../types/entities.js';

const secretKey = /(password|secret|token|authorization|cookie|hash|cipher|credential|api.?key|private.?key|refresh)/i;
const excludedSnapshotKeys = new Set(['__v']);

function sanitize(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.length > 10_000 ? `${value.slice(0, 10_000)}…` : value;
  if (value instanceof Date) return value.toISOString();
  if (depth >= 6) return '[max-depth]';
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => sanitize(item, depth + 1, seen));
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  const source = typeof (value as { toObject?: () => unknown }).toObject === 'function'
    ? (value as { toObject: () => unknown }).toObject()
    : value;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return sanitize(source, depth + 1, seen);
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source as Record<string, unknown>)) {
    if (excludedSnapshotKeys.has(key)) continue;
    result[key === '_id' ? 'id' : key] = secretKey.test(key) ? '[REDACTED]' : sanitize(item, depth + 1, seen);
  }
  return result;
}

function changedFields(before: unknown, after: unknown): string[] {
  const left = before && typeof before === 'object' ? before as Record<string, unknown> : {};
  const right = after && typeof after === 'object' ? after as Record<string, unknown> : {};
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((key) => !['createdAt', 'updatedAt'].includes(key) && JSON.stringify(left[key]) !== JSON.stringify(right[key]));
}

export interface AuditEvent {
  organizationId?: string;
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

export const auditService = {
  async record(event: AuditEvent): Promise<AppRecord> {
    const context = currentRequestContext();
    const organizationId = event.organizationId || context?.organizationId;
    const actorId = event.actorId || context?.actorId || 'system';
    if (!organizationId) throw new Error('Audit organization is required');
    const before = event.before === undefined ? undefined : sanitize(event.before);
    const after = event.after === undefined ? undefined : sanitize(event.after);
    const fields = changedFields(before, after);
    const beforeVisibility = before && typeof before === 'object' ? (before as Record<string, unknown>).customerVisible : undefined;
    const afterVisibility = after && typeof after === 'object' ? (after as Record<string, unknown>).customerVisible : undefined;
    const metadata = sanitize({
      ...(event.metadata || {}),
      ...(fields.length ? { changedFields: fields } : {}),
      ...(beforeVisibility !== afterVisibility && (beforeVisibility !== undefined || afterVisibility !== undefined)
        ? { customerVisibilityChanged: true, previousCustomerVisible: beforeVisibility, customerVisible: afterVisibility }
        : {}),
    }) as Record<string, unknown>;
    return database.appendAudit(organizationId, {
      actorId, action: event.action, entityType: event.entityType, entityId: event.entityId,
      ...(before !== undefined ? { before } : {}), ...(after !== undefined ? { after } : {}),
      ...(event.reason?.trim() ? { reason: event.reason.trim() } : {}),
      metadata,
      ...(event.ip || context?.ip ? { ip: event.ip || context?.ip } : {}),
      ...(event.userAgent || context?.userAgent ? { userAgent: event.userAgent || context?.userAgent } : {}),
      requestId: event.requestId || context?.requestId || `system-${Date.now()}`,
      timestamp: new Date().toISOString(),
    });
  },
};
