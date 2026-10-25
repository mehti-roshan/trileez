import { database } from '../db/database.js';
import { legacyDatabase } from '../db/legacy.js';
import { relationshipIssue } from '../middleware/validate.js';
import type { FileRecord, UserRecord } from '../types/entities.js';

export interface AttachmentRelationship {
  projectId?: string;
  customerId?: string;
  employeeId?: string;
  employeeIds?: string[];
  customerVisible?: boolean;
}

async function personAliases(organizationId: string, userId: string): Promise<Set<string>> {
  const aliases = new Set([userId]);
  for (const employee of await database.forOrganization(organizationId).list('Employee')) {
    if (employee.id === userId || employee.userId === userId) {
      aliases.add(employee.id);
      if (typeof employee.userId === 'string') aliases.add(employee.userId);
    }
  }
  return aliases;
}

async function activeProjectIds(organizationId: string, userId: string): Promise<Set<string>> {
  const aliases = await personAliases(organizationId, userId);
  return new Set((await database.forOrganization(organizationId).list('ProjectMember'))
    .filter((member) => member.status === 'active' && aliases.has(String(member.personId))).map((member) => String(member.projectId)));
}

function active(file: FileRecord): boolean { return !file.deletionStatus || file.deletionStatus === 'active'; }

export async function canReadFile(user: UserRecord, file: FileRecord): Promise<boolean> {
  if (file.organizationId !== user.organizationId || !active(file)) return false;
  if (file.contextKind === 'conversation') {
    if (!file.contextId) return false;
    const conversation = await legacyDatabase.get(user.organizationId, 'conversations', file.contextId);
    return Boolean(conversation && Array.isArray(conversation.participantIds) && conversation.participantIds.includes(user.id));
  }
  if (file.uploadedBy === user.id || user.role === 'admin' || user.role === 'manager') return true;
  if (user.role === 'customer') {
    if (!file.customerVisible || !file.customerId || file.customerId !== user.customerId) return false;
    if (!file.projectId) return true;
    const project = await database.forOrganization(user.organizationId).get('Project', file.projectId);
    return Boolean(project && project.customerId === user.customerId);
  }
  const aliases = await personAliases(user.organizationId, user.id);
  if (file.employeeId) return aliases.has(file.employeeId);
  if (file.visibility !== 'workspace') return false;
  if (!file.projectId) return true;
  return (await activeProjectIds(user.organizationId, user.id)).has(file.projectId);
}

export function canModifyFile(user: UserRecord, file: FileRecord): boolean {
  return file.organizationId === user.organizationId && active(file)
    && (file.contextKind === 'conversation' ? file.uploadedBy === user.id : user.role === 'admin' || user.role === 'manager' || file.uploadedBy === user.id);
}

export async function getReadableFile(user: UserRecord, fileId: string): Promise<FileRecord | undefined> {
  const file = await database.forOrganization(user.organizationId).get<FileRecord>('FileRecord', fileId);
  return file && await canReadFile(user, file) ? file : undefined;
}

export async function getModifiableFile(user: UserRecord, fileId: string): Promise<FileRecord | undefined> {
  const file = await database.forOrganization(user.organizationId).get<FileRecord>('FileRecord', fileId);
  return file && canModifyFile(user, file) ? file : undefined;
}

export async function fileListAccess(user: UserRecord): Promise<{ filter?: Record<string, unknown>; predicate?: (file: Record<string, unknown>) => boolean }> {
  if (user.role === 'admin' || user.role === 'manager') return {
    filter: { $and: [{ deletionStatus: { $in: ['active', null] } }, { $or: [{ contextKind: { $ne: 'conversation' } }, { uploadedBy: user.id }] }] },
    predicate: (row) => (!row.deletionStatus || row.deletionStatus === 'active') && (row.contextKind !== 'conversation' || row.uploadedBy === user.id),
  };
  if (user.role === 'customer') return {
    filter: {
      customerVisible: true, customerId: user.customerId, deletionStatus: { $in: ['active', null] },
      $or: [
        { projectId: { $exists: false } },
        { projectId: { $in: (await database.forOrganization(user.organizationId).list('Project', { customerId: user.customerId })).map((project) => project.id) } },
      ],
    },
    predicate: (row) => row.customerVisible === true && row.customerId === user.customerId && (!row.deletionStatus || row.deletionStatus === 'active'),
  };
  const aliases = [...await personAliases(user.organizationId, user.id)];
  const projectIds = [...await activeProjectIds(user.organizationId, user.id)];
  const access = [
    { uploadedBy: user.id }, { employeeId: { $in: aliases } },
    { visibility: 'workspace', projectId: { $exists: false }, employeeId: { $exists: false }, contextKind: { $ne: 'conversation' } },
    ...(projectIds.length ? [{ visibility: 'workspace', projectId: { $in: projectIds }, contextKind: { $ne: 'conversation' } }] : []),
  ];
  return {
    filter: { $and: [{ $or: access }, { deletionStatus: { $in: ['active', null] } }] },
    predicate: (row) => (!row.deletionStatus || row.deletionStatus === 'active') && (
      row.uploadedBy === user.id || (typeof row.employeeId === 'string' && aliases.includes(row.employeeId))
      || (row.contextKind !== 'conversation' && row.visibility === 'workspace' && !row.projectId && !row.employeeId)
      || (row.contextKind !== 'conversation' && row.visibility === 'workspace' && typeof row.projectId === 'string' && projectIds.includes(row.projectId))
    ),
  };
}

export async function assertAttachableFile(
  organizationId: string,
  actorId: string,
  fileId: string,
  path: string,
  relationship: AttachmentRelationship = {},
): Promise<FileRecord> {
  const db = database.forOrganization(organizationId);
  const actor = await db.get<UserRecord>('User', actorId);
  const file = await db.get<FileRecord>('FileRecord', fileId);
  if (!actor || !file || !await canReadFile(actor, file)) throw relationshipIssue(path, 'Attachment is unavailable or cannot be accessed');
  if (file.projectId && relationship.projectId !== file.projectId) throw relationshipIssue(path, 'Attachment belongs to a different project');
  if (file.customerId && relationship.customerId && relationship.customerId !== file.customerId) throw relationshipIssue(path, 'Attachment belongs to a different customer');
  if (file.employeeId && relationship.employeeId !== file.employeeId && !relationship.employeeIds?.includes(file.employeeId)) throw relationshipIssue(path, 'Attachment belongs to a different employee');
  if (relationship.customerVisible && (!file.customerVisible || !relationship.customerId || file.customerId !== relationship.customerId)) {
    throw relationshipIssue(path, 'Customer-visible records may only use customer-visible attachments for the same customer');
  }
  return file;
}
