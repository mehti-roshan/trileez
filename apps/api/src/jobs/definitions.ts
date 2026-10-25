import { RequestValidationError } from '../middleware/validate.js';
import { jobTypes } from './types.js';
import type { JobType } from './types.js';

export const reportResources = ['employees', 'projects', 'tasks', 'time-entries', 'meetings', 'performance-periods', 'audit', 'files'] as const;
export type ReportResource = (typeof reportResources)[number];

export const jobQueues: Record<JobType, string> = {
  'notification.create': 'notifications',
  'meeting.reminders.scan': 'scheduling',
  'performance.period.refresh': 'scheduling',
  'email.deliver': 'email',
  'file.process': 'files',
  'cleanup.expired-records': 'maintenance',
  'report.generate': 'reports',
};

function invalid(path: string, message: string): never {
  throw new RequestValidationError([{ location: 'body', path, code: 'invalid_job_payload', message }]);
}

function requiredString(payload: Record<string, unknown>, field: string, max = 10_000): string {
  const value = payload[field];
  if (typeof value !== 'string' || !value.trim() || value.length > max) invalid(`body.payload.${field}`, `${field} is required`);
  return value.trim();
}

function optionalNumber(payload: Record<string, unknown>, field: string, min: number, max: number): void {
  if (payload[field] === undefined) return;
  const value = Number(payload[field]);
  if (!Number.isFinite(value) || value < min || value > max) invalid(`body.payload.${field}`, `${field} must be between ${min} and ${max}`);
}

export function assertJobType(value: unknown): asserts value is JobType {
  if (typeof value !== 'string' || !jobTypes.includes(value as JobType)) invalid('body.type', 'Unsupported background job type');
}

export function validateJobPayload(type: JobType, payload: Record<string, unknown>): void {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) invalid('body.payload', 'Job payload must be an object');
  if (type === 'notification.create') {
    requiredString(payload, 'recipientId', 200); requiredString(payload, 'title', 500); requiredString(payload, 'body', 10_000);
  } else if (type === 'meeting.reminders.scan') optionalNumber(payload, 'horizonMinutes', 5, 10_080);
  else if (type === 'performance.period.refresh') {
    if (payload.period !== undefined && (typeof payload.period !== 'string' || Number.isNaN(Date.parse(payload.period)))) invalid('body.payload.period', 'period must be a valid date');
    if (payload.employeeId !== undefined) requiredString(payload, 'employeeId', 200);
  } else if (type === 'email.deliver') {
    const to = requiredString(payload, 'to', 254); requiredString(payload, 'subject', 500);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) invalid('body.payload.to', 'A valid email recipient is required');
    if (payload.text === undefined && payload.html === undefined) invalid('body.payload', 'Email text or html content is required');
  } else if (type === 'file.process') requiredString(payload, 'fileId', 200);
  else if (type === 'cleanup.expired-records') optionalNumber(payload, 'retentionDays', 1, 3650);
  else if (type === 'report.generate') {
    const resource = requiredString(payload, 'resource', 100);
    if (!reportResources.includes(resource as ReportResource)) invalid('body.payload.resource', 'Unsupported report resource');
    if (payload.format !== 'json' && payload.format !== 'csv') invalid('body.payload.format', 'Report format must be json or csv');
  }
}
