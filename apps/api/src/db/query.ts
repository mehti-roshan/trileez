import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { RequestValidationError, v } from '../middleware/validate.js';
import type { ValueSchema } from '../middleware/validate.js';

export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 200;

export interface PageInfo {
  limit: number;
  hasMore: boolean;
  nextCursor?: string;
}

export interface PageResult<T> {
  data: T[];
  page: PageInfo;
}

export interface RangeFilter {
  field: string;
  gte?: string | number | Date;
  lte?: string | number | Date;
}

export interface DatabasePageOptions {
  limit: number;
  cursor?: string;
  sortField: string;
  direction: 'asc' | 'desc';
  filter?: Record<string, unknown>;
  ranges?: RangeFilter[];
  search?: string;
  searchFields?: string[];
  context?: string;
  accessFilter?: Record<string, unknown>;
  accessPredicate?: (row: Record<string, unknown>) => boolean;
}

export interface ListQueryConfig {
  filters?: Record<string, ValueSchema<unknown>>;
  filterMap?: Record<string, string>;
  ranges?: Record<string, { field: string; schema?: ValueSchema<unknown>; bound: 'gte' | 'lte' }>;
  searchFields?: string[];
  sortFields?: readonly string[];
  defaultSort?: string;
  defaultDirection?: 'asc' | 'desc';
  defaultLimit?: number;
}

export interface ParsedListQuery extends DatabasePageOptions {}

const base64url = (value: string): string => Buffer.from(value).toString('base64url');
const signature = (value: string): string => createHmac('sha256', env.jwtSecret).update(value).digest('base64url');

export function encodeCursor(payload: Record<string, unknown>): string {
  const body = base64url(JSON.stringify(payload));
  return `${body}.${signature(body)}`;
}

export function decodeCursor(cursor: string): Record<string, unknown> {
  const [body, provided, ...extra] = cursor.split('.');
  if (!body || !provided || extra.length) throw invalidCursor();
  const expected = signature(body);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw invalidCursor();
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
    return parsed as Record<string, unknown>;
  } catch {
    throw invalidCursor();
  }
}

export function invalidCursor(): RequestValidationError {
  return new RequestValidationError([{ location: 'query', path: 'query.cursor', code: 'invalid_cursor', message: 'Invalid pagination cursor' }]);
}

export function listQuerySchema(config: ListQueryConfig = {}): ValueSchema<Record<string, unknown>> {
  const sortFields = config.sortFields || [config.defaultSort || 'createdAt'];
  return v.object({
    limit: v.optional(v.number({ min: 1, max: MAX_LIST_LIMIT, integer: true, coerce: true })),
    cursor: v.optional(v.string({ min: 10, max: 4000 })),
    ...(config.searchFields?.length ? { search: v.optional(v.string({ min: 1, max: 200 })) } : {}),
    sort: v.optional(v.string({ values: sortFields })),
    direction: v.optional(v.string({ values: ['asc', 'desc'] })),
    ...(config.filters || {}),
    ...Object.fromEntries(Object.entries(config.ranges || {}).map(([key, item]) => [key, v.optional(item.schema || v.date)])),
  });
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

export function pageQuery(query: Record<string, unknown>, config: ListQueryConfig = {}, context = ''): ParsedListQuery {
  const filter = Object.fromEntries(Object.keys(config.filters || {}).filter((key) => query[key] !== undefined).map((key) => [config.filterMap?.[key] || key, query[key]]));
  const grouped = new Map<string, RangeFilter>();
  for (const [key, range] of Object.entries(config.ranges || {})) {
    if (query[key] === undefined) continue;
    const current = grouped.get(range.field) || { field: range.field };
    current[range.bound] = query[key] as string | number;
    grouped.set(range.field, current);
  }
  for (const range of grouped.values()) {
    if (range.gte === undefined || range.lte === undefined) continue;
    const start = typeof range.gte === 'string' ? Date.parse(range.gte) : Number(range.gte);
    const end = typeof range.lte === 'string' ? Date.parse(range.lte) : Number(range.lte);
    if (Number.isFinite(start) && Number.isFinite(end) && start > end) {
      throw new RequestValidationError([{ location: 'query', path: 'query', code: 'invalid_range', message: `The start of ${range.field} range must not be after its end` }]);
    }
  }
  const sortField = typeof query.sort === 'string' ? query.sort : config.defaultSort || 'createdAt';
  const direction = query.direction === 'asc' || query.direction === 'desc' ? query.direction : config.defaultDirection || 'desc';
  const limit = typeof query.limit === 'number' ? query.limit : config.defaultLimit || DEFAULT_LIST_LIMIT;
  const search = typeof query.search === 'string' ? query.search : undefined;
  const cursorContext = base64url(stable({ context, filter, ranges: [...grouped.values()], search }));
  return {
    limit, sortField, direction, filter, ranges: [...grouped.values()], ...(search ? { search } : {}),
    searchFields: config.searchFields || [], context: cursorContext,
    ...(typeof query.cursor === 'string' ? { cursor: query.cursor } : {}),
  };
}
