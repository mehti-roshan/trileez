import { randomUUID } from 'node:crypto';
import { database } from '../db/database.js';
import { store } from '../db/mockStore.js';
import { models } from '../models/index.js';
import { id } from '../utils/id.js';
import { HttpError } from '../utils/httpError.js';
import { jobQueues, validateJobPayload } from './definitions.js';
import type { BackgroundJobRecord, EnqueueJobInput, JobStatus } from './types.js';

function plainJob(value: unknown): BackgroundJobRecord | undefined {
  if (!value) return undefined;
  const object = value as { toObject?: () => Record<string, unknown> };
  const row = typeof object.toObject === 'function' ? object.toObject() : { ...(value as Record<string, unknown>) };
  if (row._id) { row.id = String(row._id); delete row._id; delete row.__v; }
  // Mongo/Mongoose may minimize an empty Mixed object and omit it from older
  // records. Queue handlers should still receive the schema-level `{}` default.
  if (!row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload)) row.payload = {};
  return row as unknown as BackgroundJobRecord;
}

function isDuplicateKey(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}

function dateValue(value: Date | string | undefined, fallback = new Date()): Date {
  const date = value ? new Date(value) : fallback;
  if (Number.isNaN(date.getTime())) throw new HttpError(400, 'Invalid job run date');
  return date;
}

function retryDelayMs(job: BackgroundJobRecord): number {
  const exponential = Math.min(15 * 60_000, 5_000 * (2 ** Math.max(0, job.attempts - 1)));
  const deterministicJitter = [...job.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 1000;
  return exponential + deterministicJitter;
}

export class JobQueue {
  async enqueue(input: EnqueueJobInput): Promise<BackgroundJobRecord> {
    validateJobPayload(input.type, input.payload);
    const runAt = dateValue(input.runAt);
    const maxAttempts = Math.max(1, Math.min(20, input.maxAttempts ?? 5));
    const priority = Math.max(-100, Math.min(100, input.priority ?? 0));
    const record = {
      id: id('job'), organizationId: input.organizationId, type: input.type, queue: input.queue || jobQueues[input.type], payload: input.payload,
      status: 'queued' as const, priority, runAt: runAt.toISOString(), attempts: 0, maxAttempts, createdBy: input.createdBy,
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}), ...(input.requestId ? { requestId: input.requestId } : {}),
      ...(input.recurringTaskId ? { recurringTaskId: input.recurringTaskId } : {}),
    };
    if (database.mode() === 'mock') {
      if (input.idempotencyKey) {
        const existing = store.list('BackgroundJob', { organizationId: input.organizationId }).find((job) => job.type === input.type && job.idempotencyKey === input.idempotencyKey);
        if (existing) return existing as BackgroundJobRecord;
      }
      return store.create('BackgroundJob', record, 'job') as BackgroundJobRecord;
    }
    try { return plainJob(await models.BackgroundJob.create({ ...record, _id: record.id }))!; }
    catch (error) {
      if (!isDuplicateKey(error) || !input.idempotencyKey) throw error;
      const existing = await models.BackgroundJob.findOne({ organizationId: input.organizationId, type: input.type, idempotencyKey: input.idempotencyKey }).lean();
      if (!existing) throw error;
      return plainJob(existing)!;
    }
  }

  async claim(workerId: string, leaseSeconds: number, now = new Date()): Promise<BackgroundJobRecord | undefined> {
    const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1000);
    if (database.mode() === 'mock') {
      const candidates = store.list('BackgroundJob').filter((row) => {
        const status = String(row.status);
        if ((status === 'queued' || status === 'retry_wait') && new Date(String(row.runAt)).getTime() <= now.getTime()) return true;
        return status === 'running' && row.leaseExpiresAt && new Date(String(row.leaseExpiresAt)).getTime() <= now.getTime();
      }).sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0)
        || new Date(String(a.runAt)).getTime() - new Date(String(b.runAt)).getTime()
        || new Date(String(a.createdAt)).getTime() - new Date(String(b.createdAt)).getTime());
      const selected = candidates[0];
      if (!selected) return undefined;
      return plainJob(store.update('BackgroundJob', selected.id, {
        status: 'running', lockedAt: now.toISOString(), lockedBy: workerId, leaseExpiresAt: leaseExpiresAt.toISOString(), attempts: Number(selected.attempts || 0) + 1,
      }));
    }
    const claimed = await models.BackgroundJob.findOneAndUpdate({
      $or: [
        { status: { $in: ['queued', 'retry_wait'] }, runAt: { $lte: now } },
        { status: 'running', leaseExpiresAt: { $lte: now } },
      ],
    }, {
      $set: { status: 'running', lockedAt: now, lockedBy: workerId, leaseExpiresAt }, $inc: { attempts: 1 }, $unset: { lastError: 1 },
    }, { new: true, sort: { priority: -1, runAt: 1, createdAt: 1 } });
    return plainJob(claimed);
  }

  async complete(job: BackgroundJobRecord, workerId: string, result: unknown, now = new Date()): Promise<BackgroundJobRecord | undefined> {
    const patch = { status: 'completed', result, completedAt: now.toISOString(), lockedAt: undefined, lockedBy: undefined, leaseExpiresAt: undefined, lastError: undefined };
    if (database.mode() === 'mock') return store.update('BackgroundJob', job.id, patch, { organizationId: job.organizationId, status: 'running', lockedBy: workerId }) as BackgroundJobRecord | undefined;
    return plainJob(await models.BackgroundJob.findOneAndUpdate({ _id: job.id, organizationId: job.organizationId, status: 'running', lockedBy: workerId }, {
      $set: { status: 'completed', result, completedAt: now }, $unset: { lockedAt: 1, lockedBy: 1, leaseExpiresAt: 1, lastError: 1 },
    }, { new: true }));
  }

  async heartbeat(job: BackgroundJobRecord, workerId: string, leaseSeconds: number, now = new Date()): Promise<boolean> {
    const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1000);
    if (database.mode() === 'mock') return Boolean(store.update('BackgroundJob', job.id, { leaseExpiresAt: leaseExpiresAt.toISOString() }, { organizationId: job.organizationId, status: 'running', lockedBy: workerId }));
    const result = await models.BackgroundJob.updateOne({ _id: job.id, organizationId: job.organizationId, status: 'running', lockedBy: workerId }, { $set: { leaseExpiresAt } });
    return result.modifiedCount > 0;
  }

  async fail(job: BackgroundJobRecord, workerId: string, error: unknown, now = new Date()): Promise<BackgroundJobRecord | undefined> {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 4000);
    const retry = job.attempts < job.maxAttempts;
    const status: JobStatus = retry ? 'retry_wait' : 'failed';
    const runAt = retry ? new Date(now.getTime() + retryDelayMs(job)) : dateValue(job.runAt);
    if (database.mode() === 'mock') return store.update('BackgroundJob', job.id, {
      status, lastError: message, runAt: runAt.toISOString(), ...(retry ? {} : { failedAt: now.toISOString() }), lockedAt: undefined, lockedBy: undefined, leaseExpiresAt: undefined,
    }, { organizationId: job.organizationId, status: 'running', lockedBy: workerId }) as BackgroundJobRecord | undefined;
    return plainJob(await models.BackgroundJob.findOneAndUpdate({ _id: job.id, organizationId: job.organizationId, status: 'running', lockedBy: workerId }, {
      $set: { status, lastError: message, runAt, ...(retry ? {} : { failedAt: now }) }, $unset: { lockedAt: 1, lockedBy: 1, leaseExpiresAt: 1 },
    }, { new: true }));
  }

  async retry(organizationId: string, jobId: string): Promise<BackgroundJobRecord> {
    const current = await database.forOrganization(organizationId).get<BackgroundJobRecord>('BackgroundJob', jobId);
    if (!current) throw new HttpError(404, 'Background job not found');
    if (!['failed', 'cancelled'].includes(current.status)) throw new HttpError(409, 'Only failed or cancelled jobs can be retried manually');
    if (database.mode() === 'mock') return store.update('BackgroundJob', jobId, {
      status: 'queued', attempts: 0, runAt: new Date().toISOString(), lastError: undefined, failedAt: undefined, cancelledAt: undefined, lockedAt: undefined, lockedBy: undefined, leaseExpiresAt: undefined,
    }, { organizationId }) as BackgroundJobRecord;
    return plainJob(await models.BackgroundJob.findOneAndUpdate({ _id: jobId, organizationId, status: { $in: ['failed', 'cancelled'] } }, {
      $set: { status: 'queued', attempts: 0, runAt: new Date() }, $unset: { lastError: 1, failedAt: 1, cancelledAt: 1, lockedAt: 1, lockedBy: 1, leaseExpiresAt: 1, result: 1, completedAt: 1 },
    }, { new: true }))!;
  }

  async cancel(organizationId: string, jobId: string): Promise<BackgroundJobRecord> {
    const current = await database.forOrganization(organizationId).get<BackgroundJobRecord>('BackgroundJob', jobId);
    if (!current) throw new HttpError(404, 'Background job not found');
    if (current.status === 'completed') throw new HttpError(409, 'Completed jobs cannot be cancelled');
    if (current.status === 'cancelled') return current;
    if (database.mode() === 'mock') return store.update('BackgroundJob', jobId, { status: 'cancelled', cancelledAt: new Date().toISOString(), lockedAt: undefined, lockedBy: undefined, leaseExpiresAt: undefined }, { organizationId }) as BackgroundJobRecord;
    return plainJob(await models.BackgroundJob.findOneAndUpdate({ _id: jobId, organizationId, status: { $ne: 'completed' } }, {
      $set: { status: 'cancelled', cancelledAt: new Date() }, $unset: { lockedAt: 1, lockedBy: 1, leaseExpiresAt: 1 },
    }, { new: true }))!;
  }

  async purgeTerminalBefore(organizationId: string, before: Date): Promise<number> {
    if (database.mode() === 'mock') {
      const rows = store.list('BackgroundJob', { organizationId }).filter((job) => ['completed', 'failed', 'cancelled'].includes(String(job.status)) && new Date(String(job.updatedAt)).getTime() < before.getTime());
      rows.forEach((job) => store.remove('BackgroundJob', job.id, { organizationId }));
      return rows.length;
    }
    const result = await models.BackgroundJob.deleteMany({ organizationId, status: { $in: ['completed', 'failed', 'cancelled'] }, updatedAt: { $lt: before } });
    return result.deletedCount;
  }

  workerId(prefix = 'worker'): string { return `${prefix}-${randomUUID()}`; }
}

export const jobQueue = new JobQueue();
