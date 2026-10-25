import { database } from '../db/database.js';
import { store } from '../db/mockStore.js';
import { models } from '../models/index.js';
import { id } from '../utils/id.js';
import { HttpError } from '../utils/httpError.js';
import { validateJobPayload } from './definitions.js';
import { jobQueue } from './queue.js';
import type { JobType, RecurringTaskRecord } from './types.js';

function plainTask(value: unknown): RecurringTaskRecord | undefined {
  if (!value) return undefined;
  const object = value as { toObject?: () => Record<string, unknown> };
  const row = typeof object.toObject === 'function' ? object.toObject() : { ...(value as Record<string, unknown>) };
  if (row._id) { row.id = String(row._id); delete row._id; delete row.__v; }
  if (!row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload)) row.payload = {};
  return row as unknown as RecurringTaskRecord;
}

interface RecurringInput {
  organizationId: string;
  name: string;
  jobType: JobType;
  payload: Record<string, unknown>;
  intervalMinutes: number;
  nextRunAt: Date | string;
  enabled?: boolean;
  actorId: string;
}

export class RecurringTaskService {
  async create(input: RecurringInput): Promise<RecurringTaskRecord> {
    validateJobPayload(input.jobType, input.payload);
    const nextRunAt = new Date(input.nextRunAt);
    if (Number.isNaN(nextRunAt.getTime())) throw new HttpError(400, 'Invalid recurring task start date');
    if (!Number.isInteger(input.intervalMinutes) || input.intervalMinutes < 1 || input.intervalMinutes > 525_600) throw new HttpError(400, 'Recurring interval must be between 1 and 525600 minutes');
    const existing = (await database.forOrganization(input.organizationId).list<RecurringTaskRecord>('RecurringTask', { name: input.name }))[0];
    if (existing) throw new HttpError(409, 'A recurring task with this name already exists');
    return database.forOrganization(input.organizationId).create<RecurringTaskRecord>('RecurringTask', {
      name: input.name, jobType: input.jobType, payload: input.payload, intervalMinutes: input.intervalMinutes,
      nextRunAt: nextRunAt.toISOString(), enabled: input.enabled !== false, createdBy: input.actorId,
    });
  }

  async ensure(input: RecurringInput): Promise<RecurringTaskRecord> {
    const existing = (await database.forOrganization(input.organizationId).list<RecurringTaskRecord>('RecurringTask', { name: input.name }))[0];
    if (existing) return existing;
    try { return await this.create(input); }
    catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) throw error;
      const raced = (await database.forOrganization(input.organizationId).list<RecurringTaskRecord>('RecurringTask', { name: input.name }))[0];
      if (!raced) throw error;
      return raced;
    }
  }

  async update(organizationId: string, taskId: string, actorId: string, patch: { enabled?: boolean; intervalMinutes?: number; nextRunAt?: string; payload?: Record<string, unknown> }): Promise<RecurringTaskRecord> {
    const db = database.forOrganization(organizationId);
    const current = await db.get<RecurringTaskRecord>('RecurringTask', taskId);
    if (!current) throw new HttpError(404, 'Recurring task not found');
    if (patch.intervalMinutes !== undefined && (!Number.isInteger(patch.intervalMinutes) || patch.intervalMinutes < 1 || patch.intervalMinutes > 525_600)) throw new HttpError(400, 'Recurring interval is invalid');
    if (patch.nextRunAt !== undefined && Number.isNaN(Date.parse(patch.nextRunAt))) throw new HttpError(400, 'Recurring task start date is invalid');
    if (patch.payload) validateJobPayload(current.jobType, patch.payload);
    return (await db.update<RecurringTaskRecord>('RecurringTask', taskId, { ...patch, updatedBy: actorId }))!;
  }

  private async claim(workerId: string, leaseSeconds: number, now: Date): Promise<RecurringTaskRecord | undefined> {
    const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1000);
    if (database.mode() === 'mock') {
      const task = store.list('RecurringTask').filter((row) => row.enabled === true && new Date(String(row.nextRunAt)).getTime() <= now.getTime()
        && (!row.schedulerLeaseExpiresAt || new Date(String(row.schedulerLeaseExpiresAt)).getTime() <= now.getTime()))
        .sort((a, b) => new Date(String(a.nextRunAt)).getTime() - new Date(String(b.nextRunAt)).getTime())[0];
      if (!task) return undefined;
      return plainTask(store.update('RecurringTask', task.id, { schedulerLockedBy: workerId, schedulerLockedAt: now.toISOString(), schedulerLeaseExpiresAt: leaseExpiresAt.toISOString() }));
    }
    return plainTask(await models.RecurringTask.findOneAndUpdate({ enabled: true, nextRunAt: { $lte: now }, $or: [{ schedulerLeaseExpiresAt: { $exists: false } }, { schedulerLeaseExpiresAt: { $lte: now } }] }, {
      $set: { schedulerLockedBy: workerId, schedulerLockedAt: now, schedulerLeaseExpiresAt: leaseExpiresAt },
    }, { new: true, sort: { nextRunAt: 1 } }));
  }

  private async finish(task: RecurringTaskRecord, workerId: string, scheduledFor: Date, now: Date): Promise<void> {
    const base = Math.max(scheduledFor.getTime(), now.getTime());
    const nextRunAt = new Date(base + task.intervalMinutes * 60_000);
    if (database.mode() === 'mock') {
      store.update('RecurringTask', task.id, { nextRunAt: nextRunAt.toISOString(), lastEnqueuedAt: now.toISOString(), lastScheduledFor: scheduledFor.toISOString(), schedulerLockedBy: undefined, schedulerLockedAt: undefined, schedulerLeaseExpiresAt: undefined }, { schedulerLockedBy: workerId });
      return;
    }
    await models.RecurringTask.updateOne({ _id: task.id, schedulerLockedBy: workerId }, {
      $set: { nextRunAt, lastEnqueuedAt: now, lastScheduledFor: scheduledFor }, $unset: { schedulerLockedBy: 1, schedulerLockedAt: 1, schedulerLeaseExpiresAt: 1 },
    });
  }

  private async release(task: RecurringTaskRecord, workerId: string): Promise<void> {
    if (database.mode() === 'mock') { store.update('RecurringTask', task.id, { schedulerLockedBy: undefined, schedulerLockedAt: undefined, schedulerLeaseExpiresAt: undefined }, { schedulerLockedBy: workerId }); return; }
    await models.RecurringTask.updateOne({ _id: task.id, schedulerLockedBy: workerId }, { $unset: { schedulerLockedBy: 1, schedulerLockedAt: 1, schedulerLeaseExpiresAt: 1 } });
  }

  async dispatchDue(workerId: string, leaseSeconds: number, now = new Date(), maximum = 100): Promise<number> {
    let dispatched = 0;
    for (let index = 0; index < maximum; index += 1) {
      const task = await this.claim(workerId, leaseSeconds, now);
      if (!task) break;
      const scheduledFor = new Date(task.nextRunAt);
      try {
        // Older persisted scheduler rows may predate the payload default. Treat a
        // missing payload exactly like the current schema default instead of
        // repeatedly leasing and releasing the same due task.
        const payload = task.payload && typeof task.payload === 'object' && !Array.isArray(task.payload) ? task.payload : {};
        await jobQueue.enqueue({
          organizationId: task.organizationId, type: task.jobType, payload, createdBy: task.createdBy,
          idempotencyKey: `recurring:${task.id}:${scheduledFor.toISOString()}`, recurringTaskId: task.id,
        });
        await this.finish(task, workerId, scheduledFor, now);
        dispatched += 1;
      } catch (error) {
        await this.release(task, workerId);
        throw error;
      }
    }
    return dispatched;
  }

  async ensureDefaults(now = new Date()): Promise<void> {
    const organizations = await database.listOrganizationIds();
    for (const organizationId of organizations) {
      await this.ensure({ organizationId, name: 'meeting-reminders', jobType: 'meeting.reminders.scan', payload: { horizonMinutes: 60 }, intervalMinutes: 15, nextRunAt: now, actorId: 'system' });
      await this.ensure({ organizationId, name: 'performance-period-refresh', jobType: 'performance.period.refresh', payload: {}, intervalMinutes: 1440, nextRunAt: now, actorId: 'system' });
      await this.ensure({ organizationId, name: 'expired-record-cleanup', jobType: 'cleanup.expired-records', payload: {}, intervalMinutes: 360, nextRunAt: now, actorId: 'system' });
    }
  }
}

export const recurringTasks = new RecurringTaskService();
