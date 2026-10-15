import { database } from '../db/database.js';
import { relationshipIssue } from '../middleware/validate.js';
import { HttpError } from '../utils/httpError.js';
import {
  DEFAULT_PERFORMANCE_SCORE, clampPerformanceScore, performanceGrade, performanceMonthKey, performanceMonthRange,
} from '../utils/performanceScoring.js';
import type { AppRecord, RecordInput } from '../types/entities.js';
import { auditService } from './audit.js';
import { assertAttachableFile } from './fileAccess.js';

interface AdjustmentInput extends RecordInput {
  employeeId: string;
  reason: string;
  category?: string;
  points: number;
  date: string;
  description?: string;
  projectId?: string;
  taskId?: string;
  attachmentId?: string;
}

interface FinalizeInput { employeeId: string; period: string; notes?: string }

const locks = new Map<string, Promise<void>>();

async function withPerformanceLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) || Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => gate);
  locks.set(key, queued);
  await previous;
  try { return await task(); } finally {
    release();
    if (locks.get(key) === queued) locks.delete(key);
  }
}

function numberValue(record: AppRecord, field: string, fallback = 0): number {
  return typeof record[field] === 'number' ? record[field] as number : fallback;
}

function dateValue(record: AppRecord, field: string): number {
  const value = record[field];
  return value instanceof Date ? value.getTime() : Date.parse(String(value || ''));
}

function dateOnly(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

async function periodFor(organizationId: string, employeeId: string, periodKey: string): Promise<AppRecord | undefined> {
  return (await database.forOrganization(organizationId).list('PerformancePeriod', { employeeId, periodKey }))[0];
}

async function calculateSnapshot(organizationId: string, employeeId: string, period: string) {
  const db = database.forOrganization(organizationId);
  const range = performanceMonthRange(period);
  const periods = await db.list('PerformancePeriod', { employeeId });
  const previous = periods
    .filter((item) => item.status === 'finalized' && dateValue(item, 'endedAt') < Date.parse(range.startedAt))
    .sort((a, b) => dateValue(b, 'endedAt') - dateValue(a, 'endedAt'))[0];
  const baselineScore = clampPerformanceScore(previous ? numberValue(previous, 'score', DEFAULT_PERFORMANCE_SCORE) : DEFAULT_PERFORMANCE_SCORE);
  const events = (await db.list('PerformanceEvent', { employeeId, periodKey: range.periodKey }))
    .sort((a, b) => dateValue(a, 'date') - dateValue(b, 'date'));
  const adjustmentTotal = events.reduce((sum, event) => sum + numberValue(event, 'points'), 0);
  const score = clampPerformanceScore(baselineScore + adjustmentTotal);
  const previousScore = previous ? numberValue(previous, 'score') : undefined;
  return {
    ...range,
    baselineScore,
    adjustmentTotal,
    score,
    grade: performanceGrade(score),
    trend: previousScore === undefined ? 'flat' : score > previousScore ? 'up' : score < previousScore ? 'down' : 'flat',
    eventIds: events.map((event) => event.id),
    positive: events.filter((event) => numberValue(event, 'points') > 0).length,
    negative: events.filter((event) => numberValue(event, 'points') < 0).length,
  };
}

async function validateAdjustmentRelationships(organizationId: string, actorId: string, input: AdjustmentInput): Promise<void> {
  const db = database.forOrganization(organizationId);
  const employee = await db.get('Employee', input.employeeId);
  if (!employee) throw relationshipIssue('body.employeeId');
  if (input.projectId && !await db.get('Project', input.projectId)) throw relationshipIssue('body.projectId');
  if (input.taskId) {
    const task = await db.get('Task', input.taskId);
    if (!task) throw relationshipIssue('body.taskId');
    if (input.projectId && task.projectId !== input.projectId) throw relationshipIssue('body.taskId', 'Task belongs to a different project');
  }
  if (input.attachmentId) await assertAttachableFile(organizationId, actorId, input.attachmentId, 'body.attachmentId', {
    employeeId: input.employeeId, ...(input.projectId ? { projectId: input.projectId } : {}),
  });
}

async function saveOpenSnapshot(organizationId: string, employeeId: string, period: string, actorId: string): Promise<AppRecord> {
  const db = database.forOrganization(organizationId);
  const snapshot = await calculateSnapshot(organizationId, employeeId, period);
  const existing = await periodFor(organizationId, employeeId, snapshot.periodKey);
  if (existing?.status === 'finalized') throw new HttpError(409, 'This performance month is finalized');
  const unchanged = existing
    && ['title', 'score', 'baselineScore', 'adjustmentTotal', 'grade', 'trend'].every((field) => existing[field] === snapshot[field as keyof typeof snapshot])
    && dateOnly(existing.startedAt) === snapshot.startedAt
    && dateOnly(existing.endedAt) === snapshot.endedAt
    && JSON.stringify(existing.eventIds || []) === JSON.stringify(snapshot.eventIds);
  if (unchanged) return existing;
  const input = {
    employeeId, periodKey: snapshot.periodKey, title: snapshot.title, score: snapshot.score, baselineScore: snapshot.baselineScore,
    adjustmentTotal: snapshot.adjustmentTotal, eventIds: snapshot.eventIds, grade: snapshot.grade, trend: snapshot.trend,
    status: 'open', startedAt: snapshot.startedAt, endedAt: snapshot.endedAt,
    version: existing ? numberValue(existing, 'version', 1) + 1 : 1,
  };
  return existing ? (await db.update('PerformancePeriod', existing.id, input))! : db.create('PerformancePeriod', { ...input, createdBy: actorId });
}

export const performanceService = {
  listEvents(organizationId: string) { return database.forOrganization(organizationId).list('PerformanceEvent'); },
  getEvent(organizationId: string, id: string) { return database.forOrganization(organizationId).get('PerformanceEvent', id); },
  listPeriods(organizationId: string) { return database.forOrganization(organizationId).list('PerformancePeriod'); },
  getPeriod(organizationId: string, id: string) { return database.forOrganization(organizationId).get('PerformancePeriod', id); },

  async refreshOpenPeriods(organizationId: string, actorId: string, period: string, employeeId?: string): Promise<{ processed: number; changed: number; skippedFinalized: number }> {
    const db = database.forOrganization(organizationId);
    const employees = employeeId ? [await db.get('Employee', employeeId)].filter((item): item is AppRecord => Boolean(item)) : await db.list('Employee');
    if (employeeId && employees.length === 0) throw relationshipIssue('payload.employeeId');
    const periodKey = performanceMonthKey(period);
    let changed = 0; let skippedFinalized = 0;
    for (const employee of employees) await withPerformanceLock(`${organizationId}:${employee.id}:${periodKey}`, async () => {
      const before = await periodFor(organizationId, employee.id, periodKey);
      if (before?.status === 'finalized') { skippedFinalized += 1; return; }
      const result = await saveOpenSnapshot(organizationId, employee.id, period, actorId);
      if (!before || result.version !== before.version) {
        changed += 1;
        await auditService.record({ organizationId, actorId, action: 'performance.period.background-refreshed', entityType: 'PerformancePeriod', entityId: result.id, before, after: result,
          metadata: { employeeId: employee.id, periodKey, source: 'background-job' } });
      }
    });
    return { processed: employees.length, changed, skippedFinalized };
  },

  async auditForPeriod(organizationId: string, id: string): Promise<AppRecord[] | undefined> {
    const db = database.forOrganization(organizationId);
    const period = await db.get('PerformancePeriod', id);
    if (!period) return undefined;
    const eventIds = new Set(Array.isArray(period.eventIds) ? period.eventIds.map(String) : []);
    return (await db.list('AuditLog'))
      .filter((row) => row.entityId === id || (row.entityType === 'PerformanceEvent' && eventIds.has(String(row.entityId))))
      .sort((a, b) => dateValue(b, 'createdAt') - dateValue(a, 'createdAt'));
  },

  async createAdjustment(organizationId: string, actorId: string, input: AdjustmentInput, ip?: string) {
    if (!Number.isInteger(input.points) || input.points === 0 || Math.abs(input.points) > 100) throw new HttpError(400, 'Points change must be a non-zero integer between -100 and 100');
    await validateAdjustmentRelationships(organizationId, actorId, input);
    const periodKey = performanceMonthKey(input.date);
    return withPerformanceLock(`${organizationId}:${input.employeeId}:${periodKey}`, async () => {
      const existing = await periodFor(organizationId, input.employeeId, periodKey);
      if (existing?.status === 'finalized') throw new HttpError(409, 'This performance month is finalized');
      const db = database.forOrganization(organizationId);
      const event = await db.create('PerformanceEvent', {
        ...input, periodKey, reason: input.reason.trim(), category: input.category?.trim() || 'عمومی',
        description: input.description?.trim() || input.reason.trim(), createdBy: actorId,
      });
      let period: AppRecord;
      try { period = await saveOpenSnapshot(organizationId, input.employeeId, input.date, actorId); }
      catch (error) { await db.remove('PerformanceEvent', event.id); throw error; }
      await auditService.record({ organizationId, actorId, action: 'performance.adjustment.created', entityType: 'PerformanceEvent', entityId: event.id,
        after: event, reason: input.reason.trim(), metadata: { employeeId: input.employeeId, periodKey, points: input.points, category: input.category?.trim() || 'عمومی', projectId: input.projectId }, ...(ip ? { ip } : {}) });
      return { event, period };
    });
  },

  async finalize(organizationId: string, actorId: string, input: FinalizeInput, ip?: string): Promise<AppRecord> {
    const db = database.forOrganization(organizationId);
    if (!await db.get('Employee', input.employeeId)) throw relationshipIssue('body.employeeId');
    const range = performanceMonthRange(input.period);
    return withPerformanceLock(`${organizationId}:${input.employeeId}:${range.periodKey}`, async () => {
      const existing = await periodFor(organizationId, input.employeeId, range.periodKey);
      if (existing?.status === 'finalized') throw new HttpError(409, 'This performance month is already finalized');
      const snapshot = await calculateSnapshot(organizationId, input.employeeId, input.period);
      const now = new Date().toISOString();
      const values = {
        employeeId: input.employeeId, periodKey: snapshot.periodKey, title: snapshot.title, score: snapshot.score,
        baselineScore: snapshot.baselineScore, adjustmentTotal: snapshot.adjustmentTotal, eventIds: snapshot.eventIds,
        grade: snapshot.grade, trend: snapshot.trend, status: 'finalized', notes: input.notes?.trim() || '',
        startedAt: snapshot.startedAt, endedAt: snapshot.endedAt, evaluatedBy: actorId, finalizedAt: now,
        version: existing ? numberValue(existing, 'version', 1) + 1 : 1,
      };
      const period = existing ? (await db.update('PerformancePeriod', existing.id, values))! : await db.create('PerformancePeriod', { ...values, createdBy: actorId });
      await auditService.record({ organizationId, actorId, action: 'performance.period.finalized', entityType: 'PerformancePeriod', entityId: period.id,
        before: existing, after: period, ...(input.notes ? { reason: input.notes } : {}), metadata: { employeeId: input.employeeId, periodKey: snapshot.periodKey, score: snapshot.score, adjustmentTotal: snapshot.adjustmentTotal, eventCount: snapshot.eventIds.length }, ...(ip ? { ip } : {}) });
      return period;
    });
  },

  async reopen(organizationId: string, actorId: string, periodId: string, reason: string, ip?: string): Promise<AppRecord | undefined> {
    const current = await database.forOrganization(organizationId).get('PerformancePeriod', periodId);
    if (!current) return undefined;
    if (current.status !== 'finalized') throw new HttpError(409, 'Only finalized performance periods can be reopened');
    const periodKey = String(current.periodKey);
    return withPerformanceLock(`${organizationId}:${current.employeeId}:${periodKey}`, async () => {
      const latest = await database.forOrganization(organizationId).get('PerformancePeriod', periodId);
      if (!latest) return undefined;
      if (latest.status !== 'finalized') throw new HttpError(409, 'Performance period has already been reopened');
      const now = new Date().toISOString();
      const period = await database.forOrganization(organizationId).update('PerformancePeriod', periodId, {
        status: 'open', finalizedAt: null, reopenedAt: now, reopenedBy: actorId, reopenReason: reason.trim(),
        version: numberValue(latest, 'version', 1) + 1,
      });
      if (period) await auditService.record({ organizationId, actorId, action: 'performance.period.reopened', entityType: 'PerformancePeriod', entityId: period.id,
        before: latest, after: period, reason, metadata: { employeeId: period.employeeId, periodKey, previousScore: latest.score }, ...(ip ? { ip } : {}) });
      return period;
    });
  },

  async summary(organizationId: string, employeeId: string, period: string) {
    if (!await database.forOrganization(organizationId).get('Employee', employeeId)) return undefined;
    const snapshot = await calculateSnapshot(organizationId, employeeId, period);
    const storedPeriod = await periodFor(organizationId, employeeId, snapshot.periodKey);
    return { ...snapshot, status: storedPeriod?.status || 'open', periodId: storedPeriod?.id, finalizedAt: storedPeriod?.finalizedAt };
  },
};
