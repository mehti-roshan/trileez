import type { AppRecord } from '../types/entities.js';

export const jobTypes = [
  'notification.create',
  'meeting.reminders.scan',
  'performance.period.refresh',
  'email.deliver',
  'file.process',
  'cleanup.expired-records',
  'report.generate',
] as const;

export type JobType = (typeof jobTypes)[number];
export type JobStatus = 'queued' | 'running' | 'retry_wait' | 'completed' | 'failed' | 'cancelled';

export interface BackgroundJobRecord extends AppRecord {
  type: JobType;
  queue: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  priority: number;
  runAt: string | Date;
  attempts: number;
  maxAttempts: number;
  idempotencyKey?: string;
  lockedAt?: string | Date;
  lockedBy?: string;
  leaseExpiresAt?: string | Date;
  lastError?: string;
  result?: unknown;
  createdBy: string;
  requestId?: string;
  recurringTaskId?: string;
  completedAt?: string | Date;
  failedAt?: string | Date;
  cancelledAt?: string | Date;
}

export interface RecurringTaskRecord extends AppRecord {
  name: string;
  jobType: JobType;
  payload: Record<string, unknown>;
  enabled: boolean;
  intervalMinutes: number;
  nextRunAt: string | Date;
  lastEnqueuedAt?: string | Date;
  lastScheduledFor?: string | Date;
  createdBy: string;
  updatedBy?: string;
  schedulerLockedBy?: string;
  schedulerLeaseExpiresAt?: string | Date;
}

export interface EnqueueJobInput {
  organizationId: string;
  type: JobType;
  payload: Record<string, unknown>;
  createdBy: string;
  queue?: string;
  priority?: number;
  runAt?: Date | string;
  maxAttempts?: number;
  idempotencyKey?: string;
  requestId?: string;
  recurringTaskId?: string;
}
