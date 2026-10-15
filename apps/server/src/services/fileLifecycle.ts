import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { database } from '../db/database.js';
import { objectStorage, isStorageNotFound } from '../storage/objectStorage.js';
import type { FileRecord } from '../types/entities.js';
import { auditService } from './audit.js';
import { storageQuota } from './storageQuota.js';

export function assertFileMetadataIntegrity(organizationId: string, file: FileRecord): void {
  if (file.organizationId !== organizationId || !file.objectKey.startsWith(`${organizationId}/`) || file.bucket !== objectStorage.bucket) {
    throw Object.assign(new Error('File storage metadata failed integrity validation'), { statusCode: 409 });
  }
  if (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes <= 0 || !file.mimeType) {
    throw Object.assign(new Error('File metadata is incomplete'), { statusCode: 409 });
  }
}

export async function verifyStoredFile(organizationId: string, file: FileRecord): Promise<{ sha256: string; sizeBytes: number }> {
  assertFileMetadataIntegrity(organizationId, file);
  const metadata = await objectStorage.stat(file.objectKey);
  if (metadata.sizeBytes !== file.sizeBytes) throw new Error(`Stored file size mismatch: expected ${file.sizeBytes}, received ${metadata.sizeBytes}`);
  const hash = createHash('sha256');
  let sizeBytes = 0;
  for await (const chunk of await objectStorage.get(file.objectKey)) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    sizeBytes += value.length; hash.update(value);
    if (sizeBytes > file.sizeBytes) throw new Error('Stored file exceeds its recorded size');
  }
  if (sizeBytes !== file.sizeBytes) throw new Error(`Stored file size mismatch: expected ${file.sizeBytes}, received ${sizeBytes}`);
  const sha256 = hash.digest('hex');
  if (file.sha256 && file.sha256 !== sha256) throw new Error('Stored file checksum does not match its immutable metadata');
  return { sha256, sizeBytes };
}

export async function isFileReferenced(organizationId: string, fileId: string): Promise<boolean> {
  const db = database.forOrganization(organizationId);
  return (await Promise.all([
    db.list('Meeting'), db.list('ProjectEvent'), db.list('PerformanceEvent'), db.list('EmployeeContract'), db.list('ProjectAccess'), db.list('Task'),
  ])).some((rows) => rows.some((row) =>
    row.attachmentId === fileId || row.fileId === fileId || row.documentId === fileId || row.requestId === fileId
    || (Array.isArray(row.attachments) && row.attachments.includes(fileId))
    || (row.meetingDocument && typeof row.meetingDocument === 'object' && (row.meetingDocument as Record<string, unknown>).fileId === fileId)));
}

export async function deleteStoredFile(organizationId: string, file: FileRecord): Promise<void> {
  assertFileMetadataIntegrity(organizationId, file);
  const db = database.forOrganization(organizationId);
  await db.update('FileRecord', file.id, { deletionStatus: 'deleting', deletionRequestedAt: new Date().toISOString(), deletionError: '' });
  try {
    await objectStorage.remove(file.objectKey);
    await db.remove('FileRecord', file.id);
    await storageQuota.releaseUsed(organizationId, file.sizeBytes);
  } catch (error) {
    await db.update('FileRecord', file.id, { deletionStatus: 'delete_failed', deletionError: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000) });
    throw error;
  }
}

export async function cleanupOrganizationFiles(organizationId: string, now = new Date()): Promise<Record<string, number>> {
  const db = database.forOrganization(organizationId);
  const records = await db.list<FileRecord>('FileRecord');
  let removedOrphans = 0; let retriedDeletes = 0; let missingObjects = 0;
  for (const file of records.filter((item) => item.deletionStatus === 'deleting' || item.deletionStatus === 'delete_failed')) {
    try {
      await objectStorage.remove(file.objectKey);
      await db.remove('FileRecord', file.id);
      retriedDeletes += 1;
    } catch { /* retained for the next retry */ }
  }
  const remaining = await db.list<FileRecord>('FileRecord');
  const validObjects = new Set<string>();
  for (const file of remaining) {
    try {
      assertFileMetadataIntegrity(organizationId, file);
      const metadata = await objectStorage.stat(file.objectKey);
      if (metadata.sizeBytes !== file.sizeBytes) throw new Error('Stored size does not match file metadata');
      validObjects.add(file.objectKey);
    } catch (error) {
      if (isStorageNotFound(error)) {
        missingObjects += 1;
        await db.update('FileRecord', file.id, { deletionStatus: 'missing', processingStatus: 'failed', processingError: 'Stored object is missing' });
      }
    }
  }
  const graceBefore = now.getTime() - env.uploadOrphanGraceMinutes * 60_000;
  for (const object of await objectStorage.list(`${organizationId}/`)) {
    if (!validObjects.has(object.objectKey) && (!object.lastModified || object.lastModified.getTime() < graceBefore)) {
      await objectStorage.remove(object.objectKey);
      removedOrphans += 1;
      await auditService.record({ organizationId, actorId: 'system', action: 'file.orphan_removed', entityType: 'FileRecord', entityId: object.objectKey,
        metadata: { objectKey: object.objectKey, sizeBytes: object.sizeBytes } });
    }
  }
  const active = (await db.list<FileRecord>('FileRecord')).filter((file) => (!file.deletionStatus || file.deletionStatus === 'active') && validObjects.has(file.objectKey));
  await storageQuota.reconcile(organizationId, active.reduce((sum, file) => sum + file.sizeBytes, 0));
  return { removedOrphans, retriedDeletes, missingObjects };
}
