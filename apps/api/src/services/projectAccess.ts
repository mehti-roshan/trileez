import { database } from '../db/database.js';
import { legacyDatabase } from '../db/legacy.js';
import { models } from '../models/index.js';
import { decryptProjectAccessSecret, encryptProjectAccessSecret, extractEmbeddedSecret } from '../security/projectAccessSecrets.js';
import { relationshipIssue, RequestValidationError } from '../middleware/validate.js';
import type { AppRecord, RecordInput, UserRecord } from '../types/entities.js';
import { auditService } from './audit.js';
import type { DatabasePageOptions, PageResult } from '../db/query.js';
import { assertAttachableFile } from './fileAccess.js';

class AccessDeniedError extends Error { readonly statusCode = 403; }

function invalid(path: string, message: string): never { throw relationshipIssue(path, message); }
function invalidInput(path: string, message: string): never {
  throw new RequestValidationError([{ location: 'body', path, code: 'invalid_value', message }]);
}
function timestamp(value: unknown): number {
  const parsed = value ? Date.parse(String(value)) : 0;
  return Number.isNaN(parsed) ? 0 : parsed;
}
function accessKey(record: AppRecord): string {
  return [record.system || '', record.resource || '', record.permission || ''].map(String).join('\u0000');
}
function specificity(scope: unknown): number { return scope === 'person' ? 3 : scope === 'role' ? 2 : 1; }

function sanitize(record: AppRecord): AppRecord {
  const {
    secret: _secret, secretCiphertext: _ciphertext, secretIv: _iv, secretTag: _tag, secretVersion: _version,
    ...safe
  } = record;
  return safe;
}

async function writeAudit(organizationId: string, actorId: string, action: string, accessId: string, metadata: Record<string, unknown>, ip?: string, before?: unknown, after?: unknown, reason?: string): Promise<void> {
  const safeMetadata = { ...metadata };
  if (Array.isArray(safeMetadata.changedFields)) safeMetadata.changedFields = safeMetadata.changedFields.filter((field) => !String(field).toLowerCase().includes('secret'));
  await auditService.record({ organizationId, actorId, action, entityType: 'ProjectAccess', entityId: accessId, before, after, ...(reason ? { reason } : {}),
    metadata: Object.fromEntries(Object.entries(safeMetadata).filter(([key]) => !['secret', 'secretCiphertext', 'secretIv', 'secretTag'].includes(key))), ...(ip ? { ip } : {}) });
}

async function personAliases(organizationId: string, personId: string): Promise<Set<string>> {
  const aliases = new Set([personId]);
  for (const employee of await database.forOrganization(organizationId).list('Employee')) if (employee.id === personId || employee.userId === personId) {
    aliases.add(employee.id);
    if (typeof employee.userId === 'string') aliases.add(employee.userId);
  }
  return aliases;
}

async function memberForUser(organizationId: string, projectId: string, userId: string): Promise<AppRecord | undefined> {
  const aliases = await personAliases(organizationId, userId);
  return (await database.forOrganization(organizationId).list('ProjectMember', { projectId }))
    .find((member) => member.status === 'active' && aliases.has(String(member.personId)));
}

async function validateDocument(organizationId: string, actorId: string, projectId: string, field: string, value: unknown): Promise<void> {
  if (!value) return;
  const id = String(value);
  const dedicated = await database.forOrganization(organizationId).get('FileRecord', id);
  if (dedicated) {
    await assertAttachableFile(organizationId, actorId, id, `body.${field}`, { projectId });
    return;
  }
  const legacy = dedicated ? undefined : await legacyDatabase.get(organizationId, 'documents-v2', id);
  const related = legacy;
  if (!related) invalid(`body.${field}`, 'Related document or request does not exist in this organization');
  if (related.projectId && related.projectId !== projectId) invalid(`body.${field}`, 'Related document or request belongs to a different project');
}

async function validateAccess(organizationId: string, actorId: string, input: Record<string, unknown>): Promise<void> {
  const db = database.forOrganization(organizationId);
  const projectId = String(input.projectId);
  if (!await db.get('Project', projectId)) invalid('body.projectId', 'Project does not exist in this organization');
  if (input.scope === 'project') {
    if (input.roleId || input.projectMemberId) invalid('body.scope', 'Project-wide access cannot target a role or person');
  } else if (input.scope === 'role') {
    if (!input.roleId) invalid('body.roleId', 'Role-wide access requires a project role');
    if (input.projectMemberId) invalid('body.projectMemberId', 'Role-wide access cannot target a person');
    const role = await db.get('ProjectRole', String(input.roleId));
    if (!role || role.projectId !== projectId) invalid('body.roleId', 'Role must belong to the access project');
  } else if (input.scope === 'person') {
    if (!input.projectMemberId) invalid('body.projectMemberId', 'Person-specific access requires a project member');
    if (input.roleId) invalid('body.roleId', 'Person-specific access cannot target a role');
    const member = await db.get('ProjectMember', String(input.projectMemberId));
    if (!member || member.projectId !== projectId) invalid('body.projectMemberId', 'Project member must belong to the access project');
  }
  const start = timestamp(input.startDate);
  const expiry = timestamp(input.expiryDate);
  if (start && expiry && expiry <= start) invalidInput('body.expiryDate', 'Expiry must be after the access start date');
  await validateDocument(organizationId, actorId, projectId, 'documentId', input.documentId);
  await validateDocument(organizationId, actorId, projectId, 'requestId', input.requestId);
}

async function rawAccessRecord(organizationId: string, id: string): Promise<AppRecord | undefined> {
  if (database.mode() === 'mock') return database.forOrganization(organizationId).get('ProjectAccess', id);
  const row = await models.ProjectAccess.findOne({ _id: id, organizationId })
    .select('+secretCiphertext +secretIv +secretTag +secretVersion').lean();
  if (!row) return undefined;
  const record: Record<string, unknown> = { ...(row as unknown as Record<string, unknown>), id: String(row._id) };
  delete record._id; delete record.__v;
  return record as AppRecord;
}

export interface EffectiveAccess extends AppRecord {
  sourceAccessId: string;
  inheritedFrom: 'project-wide' | 'role-based' | 'direct';
  inheritanceReason: string;
}

export class ProjectAccessService {
  async list(organizationId: string): Promise<AppRecord[]> {
    return (await database.forOrganization(organizationId).list('ProjectAccess')).map(sanitize);
  }

  async listPage(organizationId: string, options: DatabasePageOptions): Promise<PageResult<AppRecord>> {
    const result = await database.forOrganization(organizationId).page('ProjectAccess', options);
    return { ...result, data: result.data.map(sanitize) };
  }

  async get(organizationId: string, id: string): Promise<AppRecord | undefined> {
    const record = await database.forOrganization(organizationId).get('ProjectAccess', id);
    return record ? sanitize(record) : undefined;
  }

  async create(organizationId: string, actorId: string, input: RecordInput, ip?: string): Promise<AppRecord> {
    const { secret: suppliedSecret, ...inputWithoutSecret } = input;
    const extracted = extractEmbeddedSecret(String(input.content || ''));
    const plaintext = typeof suppliedSecret === 'string' && suppliedSecret.trim() ? suppliedSecret : extracted.secret;
    const prepared: RecordInput = {
      ...inputWithoutSecret,
      content: extracted.content,
      resource: String(input.resource || input.system || extracted.content || 'project-access'),
      permission: String(input.permission || 'use'),
      status: input.status === 'revoked' ? 'revoked' : 'granted',
      grantedBy: actorId,
      ...(input.status === 'revoked' ? { revokedAt: new Date().toISOString(), revokedBy: actorId } : {}),
      ...(plaintext ? encryptProjectAccessSecret(plaintext, organizationId) : { hasSecret: false }),
    };
    if (prepared.kind === 'credentials' && !prepared.hasSecret) invalidInput('body.secret', 'Credential access requires a secret, which will be encrypted at rest');
    await validateAccess(organizationId, actorId, prepared);
    const data = await database.forOrganization(organizationId).create('ProjectAccess', { ...prepared, createdBy: actorId });
    await writeAudit(organizationId, actorId, data.status === 'revoked' ? 'project-accesses.revoked-created' : 'project-accesses.granted', data.id, {
      projectId: data.projectId, scope: data.scope, resource: data.resource, permission: data.permission, hasSecret: Boolean(data.hasSecret),
    }, ip, undefined, data);
    return sanitize(data);
  }

  async bulkCreate(organizationId: string, actorId: string, inputs: RecordInput[], ip?: string): Promise<AppRecord[]> {
    const records: AppRecord[] = [];
    for (const input of inputs) records.push(await this.create(organizationId, actorId, input, ip));
    return records;
  }

  async update(organizationId: string, actorId: string, id: string, patch: Record<string, unknown>, ip?: string): Promise<AppRecord | undefined> {
    const db = database.forOrganization(organizationId);
    const current = await db.get('ProjectAccess', id);
    if (!current) return undefined;
    const previousStatus = current.status;
    const { secret: suppliedSecret, ...mutable } = patch;
    if (typeof mutable.content === 'string') {
      const extracted = extractEmbeddedSecret(mutable.content);
      mutable.content = extracted.content;
      if (!suppliedSecret && extracted.secret) Object.assign(mutable, encryptProjectAccessSecret(extracted.secret, organizationId));
    }
    if (typeof suppliedSecret === 'string' && suppliedSecret.trim()) Object.assign(mutable, encryptProjectAccessSecret(suppliedSecret, organizationId));
    if (mutable.status === 'revoked' && previousStatus !== 'revoked') Object.assign(mutable, { revokedAt: new Date().toISOString(), revokedBy: actorId });
    if (mutable.status === 'granted' && previousStatus === 'revoked') Object.assign(mutable, { revokedAt: undefined, revokedBy: undefined });
    await validateAccess(organizationId, actorId, { ...current, ...mutable });
    const data = await db.update('ProjectAccess', id, { ...mutable, updatedBy: actorId });
    if (!data) return undefined;
    const action = previousStatus !== data.status ? `project-accesses.${String(data.status)}` : suppliedSecret ? 'project-accesses.secret-rotated' : 'project-accesses.updated';
    await writeAudit(organizationId, actorId, action, id, { changedFields: Object.keys(patch), projectId: data.projectId }, ip, current, data, typeof patch.reason === 'string' ? patch.reason : undefined);
    return sanitize(data);
  }

  async effectiveForMember(organizationId: string, projectId: string, member: AppRecord, now = new Date()): Promise<EffectiveAccess[]> {
    if (member.projectId !== projectId) invalid('query.projectMemberId', 'Project member belongs to a different project');
    if (member.status !== 'active') return [];
    const nowValue = now.getTime();
    const roleIds = new Set(Array.isArray(member.roleIds) ? member.roleIds.map(String) : []);
    const applicable = (await database.forOrganization(organizationId).list('ProjectAccess', { projectId })).filter((record) => {
      const starts = timestamp(record.startDate); const expires = timestamp(record.expiryDate);
      if (starts && starts > nowValue) return false;
      if (expires && expires <= nowValue) return false;
      if (record.scope === 'project') return true;
      if (record.scope === 'role') return Boolean(record.roleId && roleIds.has(String(record.roleId)));
      return record.scope === 'person' && record.projectMemberId === member.id;
    });
    const winners = new Map<string, AppRecord>();
    for (const record of applicable) {
      const key = accessKey(record); const current = winners.get(key);
      if (!current || specificity(record.scope) > specificity(current.scope)
        || (specificity(record.scope) === specificity(current.scope) && timestamp(record.updatedAt || record.createdAt) >= timestamp(current.updatedAt || current.createdAt))) winners.set(key, record);
    }
    return [...winners.values()].filter((record) => record.status === 'granted').map((record) => {
      const inheritedFrom = record.scope === 'person' ? 'direct' : record.scope === 'role' ? 'role-based' : 'project-wide';
      const inheritanceReason = inheritedFrom === 'direct'
        ? 'Granted directly to this project member'
        : inheritedFrom === 'role-based'
          ? `Inherited through project role ${String(record.roleId)}`
          : 'Inherited from project-wide access';
      return { ...sanitize(record), sourceAccessId: record.id, inheritedFrom, inheritanceReason } as EffectiveAccess;
    });
  }

  async effectiveForActor(organizationId: string, actor: UserRecord, projectId: string, requestedMemberId?: string): Promise<{ member?: AppRecord; data: EffectiveAccess[] }> {
    const db = database.forOrganization(organizationId);
    if (!await db.get('Project', projectId)) invalid('query.projectId', 'Project does not exist in this organization');
    let member: AppRecord | undefined;
    if (requestedMemberId) {
      member = await db.get('ProjectMember', requestedMemberId);
      if (!member || member.projectId !== projectId) invalid('query.projectMemberId', 'Project member does not belong to this project');
      if (!['admin', 'manager'].includes(actor.role)) {
        const own = await memberForUser(organizationId, projectId, actor.id);
        if (!own || own.id !== member.id) throw new AccessDeniedError('You may only inspect your own effective project access');
      }
    } else member = await memberForUser(organizationId, projectId, actor.id);
    if (!member && !['admin', 'manager'].includes(actor.role)) throw new AccessDeniedError('You are not an active member of this project');
    return { ...(member ? { member: sanitize(member) } : {}), data: member ? await this.effectiveForMember(organizationId, projectId, member) : [] };
  }

  async revealSecret(organizationId: string, actor: UserRecord, id: string, reason: string, ip?: string): Promise<{ secret: string; oneTime: true }> {
    const record = await rawAccessRecord(organizationId, id);
    if (!record) throw new AccessDeniedError('Project access record not found');
    if (!record.hasSecret) throw new AccessDeniedError('This access record has no stored credential secret');
    const now = Date.now();
    if (record.status !== 'granted' || (timestamp(record.startDate) && timestamp(record.startDate) > now) || (timestamp(record.expiryDate) && timestamp(record.expiryDate) <= now)) {
      throw new AccessDeniedError('Credential access is revoked, expired, or not active yet');
    }
    if (!['admin', 'manager'].includes(actor.role)) {
      const member = await memberForUser(organizationId, String(record.projectId), actor.id);
      const effective = member ? await this.effectiveForMember(organizationId, String(record.projectId), member) : [];
      if (!effective.some((item) => item.sourceAccessId === id)) throw new AccessDeniedError('Credential access denied');
    }
    const secret = decryptProjectAccessSecret(record, organizationId);
    if (!secret) throw new AccessDeniedError('Credential secret is unavailable');
    await writeAudit(organizationId, actor.id, 'project-accesses.secret-revealed', id, { projectId: record.projectId }, ip, undefined, undefined, reason);
    return { secret, oneTime: true };
  }

  async auditHistory(organizationId: string, id: string): Promise<AppRecord[] | undefined> {
    if (!await database.forOrganization(organizationId).get('ProjectAccess', id)) return undefined;
    return database.forOrganization(organizationId).list('AuditLog', { entityType: 'ProjectAccess', entityId: id });
  }
}
