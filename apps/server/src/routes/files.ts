import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { extname } from 'node:path';
import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { database } from '../db/database.js';
import { requireAuth, requireResourceAccess } from '../middleware/auth.js';
import { relationshipIssue, validateRequest } from '../middleware/validate.js';
import { fileContentQuerySchema, fileUpdateSchema, fileUploadBodySchema, idParamsSchema } from '../config/requestValidation.js';
import { objectStorage } from '../storage/objectStorage.js';
import type { FileRecord } from '../types/entities.js';
import { auditService } from '../services/audit.js';
import { fileListConfig, filePageQuerySchema } from '../config/listQueries.js';
import { pageQuery } from '../db/query.js';
import { jobQueue } from '../jobs/queue.js';
import { fileListAccess, getModifiableFile, getReadableFile } from '../services/fileAccess.js';
import { inspectUpload, isInlineSafeMime, removeTemporaryUpload, streamingUploadStorage, validateUploadName } from '../services/fileContent.js';
import { assertFileMetadataIntegrity, deleteStoredFile, isFileReferenced } from '../services/fileLifecycle.js';
import { storageQuota, type StorageReservation } from '../services/storageQuota.js';
import { logger } from '../observability/logger.js';
import { legacyDatabase } from '../db/legacy.js';

const router = Router();
const upload = multer({
  storage: streamingUploadStorage,
  limits: { fileSize: env.maxUploadBytes, files: 1, fields: 30, fieldSize: 128 * 1024 },
  fileFilter: (_request, file, done) => {
    try { validateUploadName(file.originalname); done(null, true); } catch (error) { done(error as Error); }
  },
});

const cleanupTemporaryUpload: RequestHandler = (req, res, next) => {
  const cleanup = () => { void removeTemporaryUpload(req.file?.path).catch(() => undefined); };
  res.once('finish', cleanup); res.once('close', cleanup); next();
};

function contentDisposition(name: string, inline: boolean): string {
  const fallback = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'download';
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? 'inline' : 'attachment'}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

async function validateRelationships(organizationId: string, actorId: string, input: Record<string, unknown>): Promise<void> {
  const db = database.forOrganization(organizationId);
  const project = input.projectId ? await db.get('Project', String(input.projectId)) : undefined;
  if (input.projectId && !project) throw relationshipIssue('body.projectId');
  if (input.employeeId && !await db.get('Employee', String(input.employeeId))) throw relationshipIssue('body.employeeId');
  if (input.customerId && !await db.get('Customer', String(input.customerId))) throw relationshipIssue('body.customerId');
  if (project?.customerId && input.customerId && project.customerId !== input.customerId) throw relationshipIssue('body.customerId', 'File customer must match the selected project customer');
  if (input.contextKind === 'conversation') {
    const conversation = typeof input.contextId === 'string' ? await legacyDatabase.get(organizationId, 'conversations', input.contextId) : undefined;
    if (!conversation || !Array.isArray(conversation.participantIds) || !conversation.participantIds.includes(actorId)) {
      throw relationshipIssue('body.contextId', 'Conversation attachment context is unavailable');
    }
  }
}

router.get('/', requireAuth, requireResourceAccess('files', 'read'), validateRequest({ query: filePageQuerySchema }), async (req, res, next) => {
  try {
    const options = pageQuery(req.validatedQuery || {}, fileListConfig, `files:${req.user!.id}:${req.user!.role}`);
    const access = await fileListAccess(req.user!);
    if (access.filter) options.accessFilter = access.filter;
    if (access.predicate) options.accessPredicate = access.predicate;
    res.json(await database.forOrganization(req.user!.organizationId).page<FileRecord>('FileRecord', options));
  } catch (error) { next(error); }
});

router.post('/', requireAuth, requireResourceAccess('files', 'create'), cleanupTemporaryUpload, upload.single('file'), validateRequest({ body: fileUploadBodySchema }), async (req, res, next) => {
  let objectKey: string | undefined;
  let reservation: StorageReservation | undefined;
  let createdFileId: string | undefined;
  let committed = false;
  try {
    if (!req.file?.path) return res.status(400).json({ error: 'A file field is required' });
    const inspection = await inspectUpload(req.file.path, req.file.size);
    const db = database.forOrganization(req.user!.organizationId);
    if (req.user!.role === 'customer') {
      if (!req.body.projectId) throw relationshipIssue('body.projectId', 'Customer uploads must be related to an accessible project');
      const project = await db.get('Project', req.body.projectId);
      if (!project || project.customerId !== req.user!.customerId) return res.status(404).json({ error: 'Project not found' });
      req.body.customerId = req.user!.customerId;
      req.body.customerVisible = false;
    }
    await validateRelationships(req.user!.organizationId, req.user!.id, req.body);
    reservation = await storageQuota.reserve(req.user!.organizationId, req.file.size);
    const extension = extname(req.file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 12);
    objectKey = `${req.user!.organizationId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${extension}`;
    const stored = await objectStorage.putStream(objectKey, createReadStream(req.file.path), req.file.size, inspection.detectedMimeType, inspection.sha256);
    const data = await db.create<FileRecord>('FileRecord', {
      name: String(req.body.name || req.file.originalname).trim(), originalName: req.file.originalname, objectKey, bucket: objectStorage.bucket,
      mimeType: inspection.detectedMimeType, detectedMimeType: inspection.detectedMimeType, declaredMimeType: req.file.mimetype || 'application/octet-stream',
      sizeBytes: req.file.size, etag: stored.etag, sha256: inspection.sha256, uploadedBy: req.user!.id,
      visibility: req.body.visibility === 'private' ? 'private' : 'workspace', customerVisible: Boolean(req.body.customerVisible),
      customerId: req.body.customerId || undefined, projectId: req.body.projectId || undefined, employeeId: req.body.employeeId || undefined,
      folderId: req.body.folderId || 'root', contextKind: req.body.contextKind || undefined, contextId: req.body.contextId || undefined,
      description: req.body.description || undefined, tags: req.body.tags || [], favorite: false, downloadCount: 0,
      processingStatus: 'pending', metadataVersion: 1, deletionStatus: 'active',
    });
    createdFileId = data.id;
    await storageQuota.commit(reservation); committed = true;
    await auditService.record({ organizationId: req.user!.organizationId, actorId: req.user!.id, action: 'file.uploaded', entityType: 'FileRecord', entityId: data.id, after: data,
      metadata: { name: data.name, sizeBytes: data.sizeBytes, declaredMimeType: data.declaredMimeType, detectedMimeType: data.detectedMimeType, sha256: data.sha256 } });
    try {
      await jobQueue.enqueue({ organizationId: req.user!.organizationId, type: 'file.process', payload: { fileId: data.id }, createdBy: req.user!.id,
        idempotencyKey: `file-process:${data.id}:${String(data.etag || '')}`, ...(req.requestId ? { requestId: req.requestId } : {}) });
    } catch (queueError) {
      await db.update('FileRecord', data.id, { processingStatus: 'failed', processingError: 'Unable to enqueue file processing' });
      logger.error('file_processing_enqueue_failed', { fileId: data.id, organizationId: req.user!.organizationId, error: queueError });
    }
    res.status(201).json({ data });
  } catch (error) {
    if (createdFileId) await database.forOrganization(req.user!.organizationId).remove('FileRecord', createdFileId).catch(() => undefined);
    if (objectKey) await objectStorage.remove(objectKey).catch(() => undefined);
    if (reservation) {
      if (committed) await storageQuota.releaseUsed(reservation.organizationId, reservation.bytes).catch(() => undefined);
      else await storageQuota.release(reservation).catch(() => undefined);
    }
    next(error);
  } finally { await removeTemporaryUpload(req.file?.path).catch(() => undefined); }
});

router.get('/:id/content', requireAuth, requireResourceAccess('files', 'read'), validateRequest({ params: idParamsSchema, query: fileContentQuerySchema }), async (req, res, next) => {
  try {
    const data = await getReadableFile(req.user!, req.params.id as string);
    if (!data) return res.status(404).json({ error: 'File not found' });
    assertFileMetadataIntegrity(req.user!.organizationId, data);
    const metadata = await objectStorage.stat(data.objectKey);
    if (metadata.sizeBytes !== data.sizeBytes) return res.status(409).json({ error: 'Stored file failed integrity validation' });
    const stream = await objectStorage.get(data.objectKey);
    const requestedInline = req.validatedQuery?.disposition === 'inline';
    const inline = requestedInline && isInlineSafeMime(data.mimeType);
    await auditService.record({ organizationId: req.user!.organizationId, actorId: req.user!.id, action: 'file.content_accessed', entityType: 'FileRecord', entityId: data.id,
      metadata: { name: data.name, disposition: inline ? 'inline' : 'attachment', customerVisible: data.customerVisible } });
    res.setHeader('content-type', data.mimeType);
    res.setHeader('content-length', String(data.sizeBytes));
    res.setHeader('content-disposition', contentDisposition(data.name, inline));
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('cache-control', 'private, no-store');
    if (data.etag) res.setHeader('etag', `"${data.etag}"`);
    stream.on('error', next); stream.pipe(res);
    void database.forOrganization(req.user!.organizationId).update('FileRecord', data.id, { downloadCount: Number(data.downloadCount || 0) + 1 });
  } catch (error) { next(error); }
});

router.get('/:id', requireAuth, requireResourceAccess('files', 'read'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const data = await getReadableFile(req.user!, req.params.id as string);
    if (!data) return res.status(404).json({ error: 'File not found' });
    res.json({ data });
  } catch (error) { next(error); }
});

router.patch('/:id', requireAuth, requireResourceAccess('files', 'update'), validateRequest({ params: idParamsSchema, body: fileUpdateSchema }), async (req, res, next) => {
  try {
    const db = database.forOrganization(req.user!.organizationId);
    const current = await getModifiableFile(req.user!, req.params.id as string);
    if (!current) return res.status(404).json({ error: 'File not found' });
    const merged = { ...current, ...req.body };
    await validateRelationships(req.user!.organizationId, req.user!.id, merged);
    const allowed = req.user!.role === 'admin' || req.user!.role === 'manager'
      ? ['name', 'description', 'tags', 'favorite', 'visibility', 'customerVisible', 'customerId', 'projectId', 'employeeId', 'folderId', 'contextKind', 'contextId'] as const
      : ['name', 'description', 'tags', 'favorite', 'visibility', 'projectId', 'employeeId', 'folderId', 'contextKind', 'contextId'] as const;
    const patch = Object.fromEntries(allowed.filter((key) => key in req.body).map((key) => [key, req.body[key]]));
    const data = await db.update<FileRecord>('FileRecord', current.id, { ...patch, metadataVersion: Number(current.metadataVersion || 1) + 1 });
    if (data) await auditService.record({ organizationId: req.user!.organizationId, actorId: req.user!.id,
      action: current.customerVisible !== data.customerVisible ? 'file.customer_visibility_changed' : 'file.updated', entityType: 'FileRecord', entityId: current.id, before: current, after: data });
    res.json({ data });
  } catch (error) { next(error); }
});

router.delete('/:id', requireAuth, requireResourceAccess('files', 'delete'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const db = database.forOrganization(req.user!.organizationId);
    const current = await getModifiableFile(req.user!, req.params.id as string);
    if (!current) return res.status(404).json({ error: 'File not found' });
    if (await isFileReferenced(req.user!.organizationId, current.id)) throw relationshipIssue('params.id', 'File is referenced by another record and cannot be deleted');
    const processingJobs = (await db.list('BackgroundJob')).filter((job) => job.type === 'file.process'
      && job.payload && typeof job.payload === 'object' && (job.payload as Record<string, unknown>).fileId === current.id
      && !['completed', 'failed', 'cancelled'].includes(String(job.status)));
    for (const job of processingJobs) await jobQueue.cancel(req.user!.organizationId, job.id);
    await deleteStoredFile(req.user!.organizationId, current);
    await auditService.record({ organizationId: req.user!.organizationId, actorId: req.user!.id, action: 'file.deleted', entityType: 'FileRecord', entityId: current.id, before: current, metadata: { name: current.name, sha256: current.sha256 } });
    res.status(204).send();
  } catch (error) { next(error); }
});

export default router;
