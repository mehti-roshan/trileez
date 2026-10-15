import { connectMongo } from './mongo.js';
import { models } from '../models/index.js';
import { store } from './mockStore.js';
import { seedMockData, seedMongoData } from './seedData.js';
import { env } from '../config/env.js';
import { DEFAULT_ORGANIZATION_ID, requireOrganizationId } from '../config/organizations.js';
import type { AppRecord, RecordFilter, RecordInput, ResourceName, UserRecord } from '../types/entities.js';
import { backfillLegacyOrganizationIds, setLegacyDatabaseMode } from './legacy.js';
import { migrateSensitiveLegacyRecords } from './sensitiveMigration.js';
import { backfillPerformanceRecords } from './performanceMigration.js';
import { migrateProjectDomainLegacyRecords } from './projectDomainMigration.js';
import { migrateProjectAccessRecords } from './projectAccessMigration.js';
import { backfillAuditRecords } from './auditMigration.js';
import { backfillEmployeeCompensationTypes } from './compensationTypeMigration.js';
import { decodeCursor, encodeCursor, invalidCursor } from './query.js';
import type { DatabasePageOptions, PageResult } from './query.js';
import { isObjectIdOrHexString } from 'mongoose';

let mongo = false;

class AppendOnlyAuditError extends Error {
  readonly statusCode = 405;
  constructor() { super('Audit records are append-only'); this.name = 'AppendOnlyAuditError'; }
}

export async function initializeDatabase(): Promise<{ mode: 'mongo' | 'mock' }> {
  mongo = await connectMongo();
  setLegacyDatabaseMode(mongo);
  if (!mongo) await seedMockData();
  else {
    await Promise.all(Object.entries(models).filter(([name]) => name !== 'AuditLog').map(([, model]) => model.updateMany(
      { $or: [{ organizationId: { $exists: false } }, { organizationId: null }, { organizationId: '' }] },
      { $set: { organizationId: DEFAULT_ORGANIZATION_ID } },
    )));
    await backfillLegacyOrganizationIds(DEFAULT_ORGANIZATION_ID);
    await backfillAuditRecords();
    await backfillPerformanceRecords();
    await migrateSensitiveLegacyRecords();
    await backfillEmployeeCompensationTypes();
    await migrateProjectDomainLegacyRecords();
    await migrateProjectAccessRecords();
    if (env.autoSeed) await seedMongoData();
  }
  return { mode: mongo ? 'mongo' : 'mock' };
}

function plain(value: unknown): AppRecord | undefined {
  if (value === null || value === undefined) return undefined;
  const objectValue = value as { toObject?: () => Record<string, unknown> };
  const row = typeof objectValue.toObject === 'function'
    ? objectValue.toObject()
    : { ...(value as Record<string, unknown>) };
  if (row._id) {
    row.id = String(row._id);
    delete row._id;
    delete row.__v;
  }
  return row as AppRecord;
}

function withoutOrganizationId(value: Record<string, unknown>): Record<string, unknown> {
  const { organizationId: _organizationId, ...safe } = value;
  return safe;
}

function acceptsRecordId(name: ResourceName, value: string): boolean {
  const idPath = models[name].schema.path('_id');
  return idPath?.instance !== 'ObjectId' || isObjectIdOrHexString(value);
}

function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function comparable(value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number') return value;
  return String(value);
}
function compareValues(left: unknown, right: unknown): number {
  const a = comparable(left); const b = comparable(right);
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a < b ? -1 : 1;
}
function getCursor(options: DatabasePageOptions, name: ResourceName, organizationId: string): { value: string | number | null; id: string } | undefined {
  if (!options.cursor) return undefined;
  const decoded = decodeCursor(options.cursor);
  if (decoded.v !== 1 || decoded.organizationId !== organizationId || decoded.resource !== name || decoded.sort !== options.sortField || decoded.direction !== options.direction || decoded.context !== options.context || typeof decoded.id !== 'string') throw invalidCursor();
  const value = decoded.value;
  if (value !== null && typeof value !== 'string' && typeof value !== 'number') throw invalidCursor();
  return { value, id: decoded.id };
}

function mockMatches(row: AppRecord, options: DatabasePageOptions): boolean {
  if (options.accessPredicate && !options.accessPredicate(row)) return false;
  if (!Object.entries(options.filter || {}).every(([key, value]) => value === undefined || row[key] === value || (Array.isArray(row[key]) && row[key].includes(value)))) return false;
  for (const range of options.ranges || []) {
    if (range.gte !== undefined && compareValues(row[range.field], range.gte) < 0) return false;
    if (range.lte !== undefined && compareValues(row[range.field], range.lte) > 0) return false;
  }
  if (options.search) {
    const needle = options.search.toLocaleLowerCase();
    if (!(options.searchFields || []).some((field) => typeof row[field] === 'string'
      ? String(row[field]).toLocaleLowerCase().includes(needle)
      : Array.isArray(row[field]) && row[field].some((item) => typeof item === 'string' && item.toLocaleLowerCase().includes(needle)))) return false;
  }
  return true;
}

function scopedDatabase(organizationValue: string) {
  const organizationId = requireOrganizationId(organizationValue);
  return {
    async list<T extends AppRecord = AppRecord>(name: ResourceName, filter: RecordFilter = {}): Promise<T[]> {
      const scopedFilter = { ...filter, organizationId };
      if (!mongo) return store.list(name, scopedFilter) as T[];
      const rows = await models[name].find(scopedFilter).sort({ createdAt: -1 }).lean();
      return rows.map(plain).filter((row): row is AppRecord => Boolean(row)) as T[];
    },
    async page<T extends AppRecord = AppRecord>(name: ResourceName, options: DatabasePageOptions): Promise<PageResult<T>> {
      const cursor = getCursor(options, name, organizationId);
      let rows: AppRecord[];
      if (!mongo) {
        rows = store.list(name, { organizationId }).filter((row) => mockMatches(row, options));
        rows.sort((left, right) => {
          const primary = compareValues(left[options.sortField], right[options.sortField]);
          const tied = primary || left.id.localeCompare(right.id);
          return options.direction === 'asc' ? tied : -tied;
        });
        if (cursor) rows = rows.filter((row) => {
          const primary = compareValues(row[options.sortField], cursor.value);
          const after = primary || row.id.localeCompare(cursor.id);
          return options.direction === 'asc' ? after > 0 : after < 0;
        });
        rows = rows.slice(0, options.limit + 1);
      } else {
        const and: Record<string, unknown>[] = [{ organizationId }, options.filter || {}, ...(options.accessFilter ? [options.accessFilter] : [])];
        for (const range of options.ranges || []) and.push({ [range.field]: { ...(range.gte !== undefined ? { $gte: range.gte } : {}), ...(range.lte !== undefined ? { $lte: range.lte } : {}) } });
        if (options.search && options.searchFields?.length) and.push({ $or: options.searchFields.map((field) => ({ [field]: { $regex: escapeRegex(options.search!), $options: 'i' } })) });
        if (cursor) {
          const operator = options.direction === 'asc' ? '$gt' : '$lt';
          and.push({ $or: [{ [options.sortField]: { [operator]: cursor.value } }, { [options.sortField]: cursor.value, _id: { [operator]: cursor.id } }] });
        }
        const found = await models[name].find({ $and: and }).sort({ [options.sortField]: options.direction === 'asc' ? 1 : -1, _id: options.direction === 'asc' ? 1 : -1 }).limit(options.limit + 1).lean();
        rows = found.map(plain).filter((row): row is AppRecord => Boolean(row));
      }
      const hasMore = rows.length > options.limit;
      const data = rows.slice(0, options.limit) as T[];
      const last = data.at(-1);
      const nextCursor = hasMore && last ? encodeCursor({ v: 1, organizationId, resource: name, sort: options.sortField, direction: options.direction, context: options.context, value: comparable(last[options.sortField]), id: last.id }) : undefined;
      return { data, page: { limit: options.limit, hasMore, ...(nextCursor ? { nextCursor } : {}) } };
    },
    async get<T extends AppRecord = AppRecord>(name: ResourceName, value: string): Promise<T | undefined> {
      if (!mongo) return store.get(name, value, { organizationId }) as T | undefined;
      if (!acceptsRecordId(name, value)) return undefined;
      return plain(await models[name].findOne({ _id: value, organizationId })) as T | undefined;
    },
    async create<T extends AppRecord = AppRecord>(name: ResourceName, input: RecordInput): Promise<T> {
      if (name === 'AuditLog') throw new AppendOnlyAuditError();
      if (!mongo) return store.create(name, { ...input, organizationId }, name.toLowerCase()) as T;
      const model = models[name];
      const usesStringId = model.schema.path('_id')?.instance === 'String';
      const { id: inputId, ...rest } = input;
      const scopedInput = { ...rest, ...(usesStringId && inputId ? { _id: inputId } : {}), organizationId };
      return plain(await model.create(scopedInput)) as T;
    },
    async update<T extends AppRecord = AppRecord>(name: ResourceName, value: string, patch: Record<string, unknown>): Promise<T | undefined> {
      if (name === 'AuditLog') throw new AppendOnlyAuditError();
      const safePatch = withoutOrganizationId(patch);
      if (!mongo) return store.update(name, value, safePatch, { organizationId }) as T | undefined;
      if (!acceptsRecordId(name, value)) return undefined;
      return plain(await models[name].findOneAndUpdate({ _id: value, organizationId }, safePatch, { new: true })) as T | undefined;
    },
    async remove(name: ResourceName, value: string): Promise<boolean> {
      if (name === 'AuditLog') throw new AppendOnlyAuditError();
      if (!mongo) return store.remove(name, value, { organizationId });
      if (!acceptsRecordId(name, value)) return false;
      const result = await models[name].deleteOne({ _id: value, organizationId });
      return result.deletedCount > 0;
    },
    async count(name: ResourceName, filter: RecordFilter = {}): Promise<number> {
      const scopedFilter = { ...filter, organizationId };
      if (!mongo) return store.list(name, scopedFilter).length;
      return models[name].countDocuments(scopedFilter);
    },
  };
}

export const database = {
  mode: (): 'mongo' | 'mock' => mongo ? 'mongo' : 'mock',
  forOrganization: scopedDatabase,
  async listOrganizationIds(): Promise<string[]> {
    if (!mongo) return [...new Set(store.list('User').map((row) => row.organizationId).filter(Boolean))];
    return (await models.User.distinct('organizationId', { organizationId: { $type: 'string', $ne: '' } })).map(String);
  },
  async findUserForAuthentication(options: { id?: string; email?: string; includePassword?: boolean }): Promise<UserRecord | undefined> {
    if (!mongo) {
      const result = store.list('User').find((row) => options.email
        ? typeof row.email === 'string' && row.email.toLowerCase() === options.email.toLowerCase()
        : options.id ? row.id === options.id : false);
      return result as UserRecord | undefined;
    }
    const filter = options.email ? { email: options.email.toLowerCase() } : { _id: options.id };
    let query = models.User.findOne(filter);
    if (options.includePassword) query = query.select('+passwordHash');
    return plain(await query) as UserRecord | undefined;
  },
  async findAuthenticationRecord<T extends AppRecord = AppRecord>(name: 'AuthSession' | 'PasswordResetToken', id: string): Promise<T | undefined> {
    if (!mongo) return store.get(name, id) as T | undefined;
    return plain(await models[name].findById(id)) as T | undefined;
  },
  async appendAudit(organizationValue: string, input: RecordInput): Promise<AppRecord> {
    const organizationId = requireOrganizationId(organizationValue);
    if (!mongo) return store.create('AuditLog', { ...input, organizationId }, 'audit') as AppRecord;
    const { id: inputId, ...rest } = input;
    return plain(await models.AuditLog.create({ ...rest, ...(inputId ? { _id: inputId } : {}), organizationId }))!;
  },
};

export const isMockDatabase = (): boolean => env.useMockDb || !env.mongoUri;
