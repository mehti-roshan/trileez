import mongoose, { Schema } from 'mongoose';
import { store } from './mockStore.js';
import { id } from '../utils/id.js';
import type { AppRecord, RecordInput } from '../types/entities.js';
import { decodeCursor, encodeCursor, invalidCursor } from './query.js';
import type { DatabasePageOptions, PageResult } from './query.js';

const LegacySchema = new Schema({
  organizationId: { type: String, required: true, index: true },
  resource: { type: String, required: true, index: true },
  payload: { type: Schema.Types.Mixed, required: true },
}, { timestamps: true });
LegacySchema.index({ organizationId: 1, resource: 1, 'payload.id': 1 }, { unique: true });
LegacySchema.index({ organizationId: 1, resource: 1, createdAt: -1, _id: -1 });
LegacySchema.index({ organizationId: 1, resource: 1, 'payload.participantIds': 1, createdAt: -1 });
LegacySchema.index({ organizationId: 1, resource: 1, 'payload.memberIds': 1, createdAt: -1 });
LegacySchema.index({ organizationId: 1, resource: 1, 'payload.conversationId': 1, createdAt: -1 });
LegacySchema.index({ organizationId: 1, resource: 1, 'payload.recipientId': 1, createdAt: -1 });

const LegacyModel = (mongoose.models.LegacyEntity || mongoose.model('LegacyEntity', LegacySchema)) as mongoose.Model<Record<string, unknown>>;

let mongo = false;
export function setLegacyDatabaseMode(value: boolean): void { mongo = value; }

function mockName(resource: string): string { return `Legacy:${resource}`; }

function normalize(organizationId: string, resource: string, value: unknown): AppRecord {
  const payload = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return { ...payload, organizationId, id: String(payload.id || id(resource)) } as AppRecord;
}

function fromMongo(value: Record<string, unknown>): AppRecord {
  const payload = normalize(String(value.organizationId), String(value.resource), value.payload);
  const createdAt = payload.createdAt || value.createdAt as Date | undefined;
  const updatedAt = payload.updatedAt || value.updatedAt as Date | undefined;
  return { ...payload, id: String(payload.id || value._id), ...(createdAt ? { createdAt } : {}), ...(updatedAt ? { updatedAt } : {}) };
}

function legacyCursor(organizationId: string, resource: string, options: DatabasePageOptions): { value: string; id: string } | undefined {
  if (!options.cursor) return undefined;
  const decoded = decodeCursor(options.cursor);
  if (decoded.v !== 1 || decoded.organizationId !== organizationId || decoded.resource !== `Legacy:${resource}` || decoded.sort !== 'createdAt' || decoded.direction !== options.direction || decoded.context !== options.context || typeof decoded.value !== 'string' || typeof decoded.id !== 'string') throw invalidCursor();
  return { value: decoded.value, id: decoded.id };
}

function withoutOrganizationId(value: Record<string, unknown>): Record<string, unknown> {
  const { organizationId: _organizationId, ...safe } = value;
  return safe;
}

export async function backfillLegacyOrganizationIds(organizationId: string): Promise<void> {
  if (!mongo) return;
  await LegacyModel.updateMany(
    { $or: [{ organizationId: { $exists: false } }, { organizationId: null }, { organizationId: '' }] },
    { $set: { organizationId, 'payload.organizationId': organizationId } },
  );
}

export async function readLegacyRowsForMigration(resource: string): Promise<AppRecord[]> {
  if (!mongo) return store.list(mockName(resource));
  const rows = await LegacyModel.find({ resource }).lean();
  return rows.map((row) => fromMongo(row as unknown as Record<string, unknown>));
}

export async function removeLegacyRowAfterMigration(organizationId: string, resource: string, value: string): Promise<void> {
  if (!mongo) {
    store.remove(mockName(resource), value, { organizationId });
    return;
  }
  await LegacyModel.deleteOne({ organizationId, resource, 'payload.id': value });
}

export const legacyDatabase = {
  async list(organizationId: string, resource: string): Promise<AppRecord[]> {
    if (!mongo) return store.list(mockName(resource), { organizationId });
    const rows = await LegacyModel.find({ organizationId, resource }).sort({ createdAt: -1 }).lean();
    return rows.map((row) => fromMongo(row as unknown as Record<string, unknown>));
  },
  async page(organizationId: string, resource: string, options: DatabasePageOptions): Promise<PageResult<AppRecord>> {
    const cursor = legacyCursor(organizationId, resource, options);
    let data: AppRecord[]; let cursorIds: string[];
    if (!mongo) {
      const direction = options.direction === 'asc' ? 1 : -1;
      const rows = store.list(mockName(resource), { organizationId }).filter((row) => !options.accessPredicate || options.accessPredicate(row)).sort((left, right) => {
        const primary = String(left.createdAt || '').localeCompare(String(right.createdAt || ''));
        return direction * (primary || left.id.localeCompare(right.id));
      }).filter((row) => !cursor || direction * (String(row.createdAt || '').localeCompare(cursor.value) || row.id.localeCompare(cursor.id)) > 0).slice(0, options.limit + 1);
      data = rows; cursorIds = rows.map((row) => row.id);
    } else {
      const filter: Record<string, unknown> = { organizationId, resource };
      const operator = options.direction === 'asc' ? '$gt' : '$lt';
      const filters: Record<string, unknown>[] = [];
      if (options.accessFilter) filters.push(options.accessFilter);
      if (cursor) filters.push({ $or: [{ createdAt: { [operator]: cursor.value } }, { createdAt: cursor.value, _id: { [operator]: cursor.id } }] });
      if (filters.length) filter.$and = filters;
      const order = options.direction === 'asc' ? 1 : -1;
      const rows = await LegacyModel.find(filter).sort({ createdAt: order, _id: order }).limit(options.limit + 1).lean();
      data = rows.map((row) => fromMongo(row as unknown as Record<string, unknown>));
      cursorIds = rows.map((row) => String(row._id));
    }
    const hasMore = data.length > options.limit;
    const pageData = data.slice(0, options.limit);
    const lastIndex = pageData.length - 1;
    const nextCursor = hasMore && lastIndex >= 0 ? encodeCursor({ v: 1, organizationId, resource: `Legacy:${resource}`, sort: 'createdAt', direction: options.direction, context: options.context, value: String(pageData[lastIndex]!.createdAt || ''), id: cursorIds[lastIndex] }) : undefined;
    return { data: pageData, page: { limit: options.limit, hasMore, ...(nextCursor ? { nextCursor } : {}) } };
  },
  async get(organizationId: string, resource: string, value: string): Promise<AppRecord | undefined> {
    if (!mongo) return store.get(mockName(resource), value, { organizationId });
    const row = await LegacyModel.findOne({ organizationId, resource, 'payload.id': value }).lean();
    return row ? fromMongo(row as unknown as Record<string, unknown>) : undefined;
  },
  async create(organizationId: string, resource: string, input: RecordInput): Promise<AppRecord> {
    const payload = normalize(organizationId, resource, input);
    if (!mongo) return store.create(mockName(resource), payload, resource);
    await LegacyModel.create({ organizationId, resource, payload });
    return payload;
  },
  async bulkCreate(organizationId: string, resource: string, inputs: RecordInput[]): Promise<AppRecord[]> {
    const payloads = inputs.map((input) => normalize(organizationId, resource, input));
    if (!mongo) {
      payloads.forEach((payload) => store.create(mockName(resource), payload, resource));
      return payloads;
    }
    await LegacyModel.insertMany(payloads.map((payload) => ({ organizationId, resource, payload })));
    return payloads;
  },
  async update(organizationId: string, resource: string, value: string, patch: Record<string, unknown>): Promise<AppRecord | undefined> {
    const safePatch = withoutOrganizationId(patch);
    if (!mongo) return store.update(mockName(resource), value, safePatch, { organizationId });
    const row = await LegacyModel.findOne({ organizationId, resource, 'payload.id': value });
    if (!row) return undefined;
    const payload = { ...(row.get('payload') as Record<string, unknown>), ...safePatch, organizationId, id: value };
    row.set('payload', payload);
    await row.save();
    return normalize(organizationId, resource, payload);
  },
  async remove(organizationId: string, resource: string, value: string): Promise<boolean> {
    if (!mongo) return store.remove(mockName(resource), value, { organizationId });
    const result = await LegacyModel.deleteOne({ organizationId, resource, 'payload.id': value });
    return result.deletedCount > 0;
  },
};
