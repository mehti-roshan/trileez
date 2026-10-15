import { createHash } from 'node:crypto';
import { database } from '../db/database.js';
import { legacyDatabase } from '../db/legacy.js';
import { env } from '../config/env.js';
import { objectStorage } from '../storage/objectStorage.js';
import { performanceService } from '../services/performance.js';
import { auditService } from '../services/audit.js';
import { cleanupOrganizationFiles, verifyStoredFile } from '../services/fileLifecycle.js';
import { storageQuota } from '../services/storageQuota.js';
import type { AppRecord, FileRecord, ResourceName, UserRecord } from '../types/entities.js';
import { jobQueue } from './queue.js';
import type { BackgroundJobRecord, JobType } from './types.js';
import type { ReportResource } from './definitions.js';

export interface JobHandlerContext { job: BackgroundJobRecord; now: Date }
export type JobHandler = (context: JobHandlerContext) => Promise<unknown>;

const handlers = new Map<JobType, JobHandler>();
export function registerJobHandler(type: JobType, handler: JobHandler): void { handlers.set(type, handler); }
export function getJobHandler(type: JobType): JobHandler | undefined { return handlers.get(type); }

function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
function stringValue(payload: Record<string, unknown>, field: string): string { return String(payload[field] || ''); }

async function notificationHandler({ job, now }: JobHandlerContext): Promise<unknown> {
  const notificationId = `notification-${job.id}`;
  const existing = await legacyDatabase.get(job.organizationId, 'notifications', notificationId);
  if (existing) return { notificationId: existing.id, duplicate: true };
  const payload = job.payload;
  const db = database.forOrganization(job.organizationId);
  const recipientId = stringValue(payload, 'recipientId');
  if (!await db.get('User', recipientId) && !await db.get('Employee', recipientId)) throw new Error('Notification recipient no longer exists');
  const notification = await legacyDatabase.create(job.organizationId, 'notifications', {
    id: notificationId, recipientId, title: stringValue(payload, 'title'), body: stringValue(payload, 'body'),
    type: stringValue(payload, 'type') || 'system', priority: stringValue(payload, 'priority') || 'normal', read: false,
    ...(payload.entityId ? { entityId: payload.entityId } : {}), ...(payload.entityType ? { entityType: payload.entityType } : {}),
    ...(payload.projectId ? { projectId: payload.projectId } : {}), ...(payload.taskId ? { taskId: payload.taskId } : {}),
    sourceJobId: job.id, createdAt: now.toISOString(), createdBy: 'system',
  });
  return { notificationId: notification.id };
}

async function emailHandler({ job }: JobHandlerContext): Promise<unknown> {
  const payload = job.payload;
  const message = { from: env.emailFrom, to: stringValue(payload, 'to'), subject: stringValue(payload, 'subject'), text: payload.text, html: payload.html, metadata: payload.metadata || {} };
  if (!env.emailDeliveryWebhookUrl) return { delivery: 'logged', to: message.to, messageId: job.id };
  const response = await fetch(env.emailDeliveryWebhookUrl, {
    method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': job.id }, body: JSON.stringify(message), signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
  const result = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { delivery: 'webhook', status: response.status, messageId: result.id || result.messageId || job.id };
}

async function resolveRecipientUsers(organizationId: string, meeting: AppRecord): Promise<UserRecord[]> {
  const db = database.forOrganization(organizationId);
  const identifiers = new Set([String(meeting.organizerId || ''), ...strings(meeting.participantIds), ...strings(meeting.employeeIds)].filter(Boolean));
  const employees = await db.list('Employee');
  for (const employee of employees) if (identifiers.has(employee.id) && typeof employee.userId === 'string') identifiers.add(employee.userId);
  const users = await db.list<UserRecord>('User');
  return users.filter((user) => identifiers.has(user.id));
}

async function meetingReminderHandler({ job, now }: JobHandlerContext): Promise<unknown> {
  const horizonMinutes = Math.max(5, Math.min(10_080, Number(job.payload.horizonMinutes || 60)));
  const horizon = now.getTime() + horizonMinutes * 60_000;
  const meetings = (await database.forOrganization(job.organizationId).list('Meeting')).filter((meeting) => {
    const start = new Date(String(meeting.startAt)).getTime();
    return meeting.status === 'scheduled' && start >= now.getTime() && start <= horizon;
  });
  let notifications = 0; let emails = 0;
  for (const meeting of meetings) {
    const users = await resolveRecipientUsers(job.organizationId, meeting);
    const startAt = new Date(String(meeting.startAt)).toISOString();
    for (const user of users) {
      const key = `${meeting.id}:${user.id}:${startAt}`;
      await jobQueue.enqueue({ organizationId: job.organizationId, type: 'notification.create', createdBy: 'system',
        idempotencyKey: `meeting-reminder:notification:${key}`, payload: { recipientId: user.id, title: `یادآوری جلسه: ${String(meeting.title)}`, body: `جلسه در ${startAt} برگزار می‌شود.`, type: 'meeting_reminder', priority: 'high', entityType: 'Meeting', entityId: meeting.id, projectId: meeting.projectId } });
      notifications += 1;
      if (user.email) {
        await jobQueue.enqueue({ organizationId: job.organizationId, type: 'email.deliver', createdBy: 'system',
          idempotencyKey: `meeting-reminder:email:${key}`, payload: { to: user.email, subject: `یادآوری جلسه ${String(meeting.title)}`, text: `جلسه «${String(meeting.title)}» در ${startAt} برگزار می‌شود.`, metadata: { meetingId: meeting.id } } });
        emails += 1;
      }
    }
  }
  return { meetings: meetings.length, notifications, emails, horizonMinutes };
}

async function fileProcessHandler({ job, now }: JobHandlerContext): Promise<unknown> {
  const db = database.forOrganization(job.organizationId);
  const fileId = stringValue(job.payload, 'fileId');
  const file = await db.get<FileRecord>('FileRecord', fileId);
  if (!file) throw new Error('File record no longer exists');
  const duplicate = file.processingStatus === 'processed' && Boolean(file.sha256);
  await db.update('FileRecord', fileId, { processingStatus: 'processing', processingError: undefined });
  try {
    const verified = await verifyStoredFile(job.organizationId, file);
    const processed = await db.update('FileRecord', fileId, { processingStatus: 'processed', processingError: '', processedAt: now.toISOString(), contentVerifiedAt: now.toISOString(), sha256: verified.sha256 });
    await auditService.record({ organizationId: job.organizationId, actorId: 'system', action: 'file.background_processed', entityType: 'FileRecord', entityId: fileId, before: file, after: processed,
      metadata: { jobId: job.id, bytes: verified.sizeBytes, sha256: verified.sha256 } });
    return { fileId, sha256: verified.sha256, bytes: verified.sizeBytes, duplicate };
  } catch (error) {
    await db.update('FileRecord', fileId, { processingStatus: 'failed', processingError: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000) });
    throw error;
  }
}

const reportModels: Record<ReportResource, ResourceName> = {
  employees: 'Employee', projects: 'Project', tasks: 'Task', 'time-entries': 'TimeEntry', meetings: 'Meeting',
  'performance-periods': 'PerformancePeriod', audit: 'AuditLog', files: 'FileRecord',
};

function csvCell(value: unknown): string {
  const text = value === undefined || value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function serializeReport(rows: AppRecord[], format: 'json' | 'csv'): Buffer {
  if (format === 'json') return Buffer.from(JSON.stringify(rows, null, 2));
  const fields = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter((field) => field !== 'organizationId').sort();
  return Buffer.from([fields.map(csvCell).join(','), ...rows.map((row) => fields.map((field) => csvCell(row[field])).join(','))].join('\n'));
}

async function reportHandler({ job, now }: JobHandlerContext): Promise<unknown> {
  const db = database.forOrganization(job.organizationId);
  const reportId = `report-${job.id}`;
  const existing = await db.get<FileRecord>('FileRecord', reportId);
  if (existing) return { fileId: existing.id, duplicate: true, rows: existing.tags?.find((tag) => tag.startsWith('rows:'))?.slice(5) };
  const resource = stringValue(job.payload, 'resource') as ReportResource;
  const format = job.payload.format === 'csv' ? 'csv' : 'json';
  const rows = await db.list(reportModels[resource]);
  const body = serializeReport(rows, format);
  const objectKey = `${job.organizationId}/reports/${job.id}.${format}`;
  const reservation = await storageQuota.reserve(job.organizationId, body.byteLength);
  let stored: { etag: string };
  try { stored = await objectStorage.put(objectKey, body, format === 'csv' ? 'text/csv' : 'application/json'); }
  catch (error) { await storageQuota.release(reservation); throw error; }
  const title = stringValue(job.payload, 'title') || `${resource}-${now.toISOString().slice(0, 10)}`;
  let file: FileRecord;
  try {
    const mimeType = format === 'csv' ? 'text/csv' : 'application/json';
    file = await db.create<FileRecord>('FileRecord', {
      id: reportId, name: `${title}.${format}`, originalName: `${title}.${format}`, objectKey, bucket: objectStorage.bucket,
      mimeType, declaredMimeType: mimeType, detectedMimeType: mimeType, sizeBytes: body.byteLength, etag: stored.etag, uploadedBy: job.createdBy,
      visibility: 'private', customerVisible: false, folderId: 'reports', contextKind: 'generated-report', contextId: job.id,
      tags: ['generated-report', `resource:${resource}`, `rows:${rows.length}`], favorite: false, downloadCount: 0,
      processingStatus: 'processed', processedAt: now.toISOString(), contentVerifiedAt: now.toISOString(), sha256: createHash('sha256').update(body).digest('hex'), metadataVersion: 1, deletionStatus: 'active',
    });
    await storageQuota.commit(reservation);
  } catch (error) {
    await objectStorage.remove(objectKey).catch(() => undefined); await storageQuota.release(reservation).catch(() => undefined); throw error;
  }
  await auditService.record({ organizationId: job.organizationId, actorId: job.createdBy, action: 'report.background_generated', entityType: 'FileRecord', entityId: file.id, after: file,
    metadata: { jobId: job.id, resource, format, rows: rows.length } });
  await jobQueue.enqueue({ organizationId: job.organizationId, type: 'notification.create', createdBy: 'system', idempotencyKey: `report-ready:${job.id}`,
    payload: { recipientId: job.createdBy, title: 'گزارش آماده است', body: `گزارش ${title} با ${rows.length} رکورد آماده دانلود است.`, type: 'report_ready', entityType: 'FileRecord', entityId: file.id } });
  return { fileId: file.id, rows: rows.length, format, bytes: body.byteLength };
}

async function cleanupHandler({ job, now }: JobHandlerContext): Promise<unknown> {
  const db = database.forOrganization(job.organizationId);
  let sessions = 0; let resetTokens = 0;
  for (const session of await db.list('AuthSession')) if (new Date(String(session.expiresAt)).getTime() <= now.getTime()) { if (await db.remove('AuthSession', session.id)) sessions += 1; }
  for (const token of await db.list('PasswordResetToken')) if (new Date(String(token.expiresAt)).getTime() <= now.getTime() || token.usedAt || token.revokedAt) { if (await db.remove('PasswordResetToken', token.id)) resetTokens += 1; }
  const retentionDays = Math.max(1, Math.min(3650, Number(job.payload.retentionDays || env.jobRetentionDays)));
  const jobs = await jobQueue.purgeTerminalBefore(job.organizationId, new Date(now.getTime() - retentionDays * 86_400_000));
  const files = await cleanupOrganizationFiles(job.organizationId, now);
  return { sessions, resetTokens, jobs, files, retentionDays };
}

registerJobHandler('notification.create', notificationHandler);
registerJobHandler('email.deliver', emailHandler);
registerJobHandler('meeting.reminders.scan', meetingReminderHandler);
registerJobHandler('performance.period.refresh', async ({ job, now }) => performanceService.refreshOpenPeriods(job.organizationId, 'system', stringValue(job.payload, 'period') || now.toISOString(), job.payload.employeeId ? String(job.payload.employeeId) : undefined));
registerJobHandler('file.process', fileProcessHandler);
registerJobHandler('cleanup.expired-records', cleanupHandler);
registerJobHandler('report.generate', reportHandler);
