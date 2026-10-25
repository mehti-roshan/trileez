import { database } from '../db/database.js';
import { legacyDatabase } from '../db/legacy.js';
import { relationshipIssue } from '../middleware/validate.js';
import type { AppRecord, RecordInput, ResourceName } from '../types/entities.js';
import type { LegacyResourceName, ResourceAccessName } from '../config/resourceAccess.js';
import { auditService } from './audit.js';
import type { DatabasePageOptions, PageResult } from '../db/query.js';

export interface RelationshipRule {
  field: string;
  resource: ResourceName | LegacyResourceName;
  storage?: 'dedicated' | 'legacy';
  many?: boolean;
}

export interface SensitiveResourceConfig {
  model: ResourceName;
  resource: ResourceAccessName;
  relationships?: readonly RelationshipRule[];
  prepareCreate?: (input: Record<string, unknown>, actorId: string, organizationId: string) => Record<string, unknown> | Promise<Record<string, unknown>>;
  afterCreate?: (data: AppRecord, actorId: string, organizationId: string) => void | Promise<void>;
  prepareUpdate?: (current: AppRecord, patch: Record<string, unknown>, actorId: string, organizationId: string) => Record<string, unknown> | Promise<Record<string, unknown>>;
  validate?: (organizationId: string, input: Record<string, unknown>, current?: AppRecord, actorId?: string) => Promise<void>;
  validateDelete?: (organizationId: string, current: AppRecord) => Promise<void>;
  unique?: readonly { fields: readonly string[]; message: string }[];
}

async function validateUnique(organizationId: string, config: SensitiveResourceConfig, input: Record<string, unknown>, current?: AppRecord): Promise<void> {
  const db = database.forOrganization(organizationId);
  for (const rule of config.unique || []) {
    if (rule.fields.some((field) => input[field] === undefined || input[field] === null || input[field] === '')) continue;
    const filter = Object.fromEntries(rule.fields.map((field) => [field, input[field]]));
    const duplicate = (await db.list(config.model, filter)).find((row) => row.id !== current?.id);
    if (duplicate) throw relationshipIssue(`body.${rule.fields[0]}`, rule.message);
  }
}

async function relationshipExists(organizationId: string, rule: RelationshipRule, value: string): Promise<boolean> {
  if (rule.storage === 'legacy') return Boolean(await legacyDatabase.get(organizationId, rule.resource, value));
  return Boolean(await database.forOrganization(organizationId).get(rule.resource as ResourceName, value));
}

async function validateRelationships(organizationId: string, input: Record<string, unknown>, rules: readonly RelationshipRule[]): Promise<void> {
  for (const rule of rules) {
    if (!(rule.field in input)) continue;
    const raw = input[rule.field];
    const values = rule.many ? raw : [raw];
    if (!Array.isArray(values)) throw relationshipIssue(`body.${rule.field}`, 'Expected related identifiers');
    for (const value of values) {
      if (value === undefined || value === null || value === '') continue;
      if (!await relationshipExists(organizationId, rule, String(value))) throw relationshipIssue(`body.${rule.field}`);
    }
  }
}

export class SensitiveResourceService {
  constructor(private readonly config: SensitiveResourceConfig) {}

  list(organizationId: string, options: DatabasePageOptions): Promise<PageResult<AppRecord>> {
    return database.forOrganization(organizationId).page(this.config.model, options);
  }

  get(organizationId: string, id: string): Promise<AppRecord | undefined> {
    return database.forOrganization(organizationId).get(this.config.model, id);
  }

  async create(organizationId: string, actorId: string, input: RecordInput, ip?: string): Promise<AppRecord> {
    const prepared = await this.config.prepareCreate?.(input, actorId, organizationId) || input;
    await validateRelationships(organizationId, prepared, this.config.relationships || []);
    await validateUnique(organizationId, this.config, prepared);
    await this.config.validate?.(organizationId, prepared, undefined, actorId);
    const db = database.forOrganization(organizationId);
    const data = await db.create(this.config.model, { ...prepared, createdBy: actorId });
    try {
      await this.config.afterCreate?.(data, actorId, organizationId);
    } catch (error) {
      await db.remove(this.config.model, data.id).catch(() => false);
      throw error;
    }
    await auditService.record({ organizationId, actorId, action: `${this.config.resource}.created`, entityType: this.config.model, entityId: data.id, after: data, metadata: { resource: this.config.resource }, ...(ip ? { ip } : {}) });
    return data;
  }

  async bulkCreate(organizationId: string, actorId: string, inputs: RecordInput[], ip?: string): Promise<AppRecord[]> {
    const prepared = await Promise.all(inputs.map(async (input) => await this.config.prepareCreate?.(input, actorId, organizationId) || input));
    for (const input of prepared) {
      await validateRelationships(organizationId, input, this.config.relationships || []);
      await this.config.validate?.(organizationId, input, undefined, actorId);
    }
    const created: AppRecord[] = [];
    for (const input of prepared) created.push(await this.create(organizationId, actorId, input, ip));
    return created;
  }

  async update(organizationId: string, actorId: string, id: string, patch: Record<string, unknown>, ip?: string): Promise<AppRecord | undefined> {
    const db = database.forOrganization(organizationId);
    const current = await db.get(this.config.model, id);
    if (!current) return undefined;
    const prepared = await this.config.prepareUpdate?.(current, patch, actorId, organizationId) || patch;
    await validateRelationships(organizationId, prepared, this.config.relationships || []);
    await validateUnique(organizationId, this.config, { ...current, ...prepared }, current);
    await this.config.validate?.(organizationId, { ...current, ...prepared }, current, actorId);
    const data = await db.update(this.config.model, id, { ...prepared, updatedBy: actorId });
    if (data) await auditService.record({ organizationId, actorId, action: `${this.config.resource}.updated`, entityType: this.config.model, entityId: id, before: current, after: data, metadata: { resource: this.config.resource }, ...(ip ? { ip } : {}) });
    return data;
  }

  async remove(organizationId: string, actorId: string, id: string, ip?: string): Promise<boolean> {
    const db = database.forOrganization(organizationId);
    const current = await db.get(this.config.model, id);
    if (!current) return false;
    await this.config.validateDelete?.(organizationId, current);
    const removed = await db.remove(this.config.model, id);
    if (removed) await auditService.record({ organizationId, actorId, action: `${this.config.resource}.deleted`, entityType: this.config.model, entityId: id, before: current, metadata: { resource: this.config.resource }, ...(ip ? { ip } : {}) });
    return removed;
  }
}
