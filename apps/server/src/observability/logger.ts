import { env, type LogLevel } from '../config/env.js';
import { currentRequestContext } from '../middleware/requestContext.js';

const levels: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const secretKey = /(password|secret|token|authorization|cookie|hash|cipher|credential|api.?key|private.?key|refresh)/i;

function sanitize(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.length > 4_000 ? `${value.slice(0, 4_000)}…` : value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (depth >= 5) return '[max-depth]';
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, depth + 1, seen));
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) result[key] = secretKey.test(key) ? '[REDACTED]' : sanitize(item, depth + 1, seen);
  return result;
}

function write(level: LogLevel, message: string, fields: Record<string, unknown> = {}): void {
  if (levels[level] < levels[env.logLevel]) return;
  const context = currentRequestContext();
  const record = sanitize({
    timestamp: new Date().toISOString(), level, service: env.serviceName, version: env.serviceVersion, pid: process.pid, message,
    ...(context?.requestId ? { requestId: context.requestId } : {}),
    ...(context?.correlationId ? { correlationId: context.correlationId } : {}),
    ...(context?.actorId ? { actorId: context.actorId } : {}),
    ...(context?.organizationId ? { organizationId: context.organizationId } : {}),
    ...fields,
  });
  const line = `${JSON.stringify(record)}\n`;
  if (level === 'error' || level === 'warn') process.stderr.write(line);
  else process.stdout.write(line);
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => write('debug', message, fields),
  info: (message: string, fields?: Record<string, unknown>) => write('info', message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write('warn', message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write('error', message, fields),
};
