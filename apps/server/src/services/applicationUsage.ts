import { database } from '../db/database.js';
import { selfIdentity } from './employeeIdentity.js';
import { AgentEnrollmentService, type EnrollmentActor } from './agentEnrollment.js';
import { HttpError } from '../utils/httpError.js';
import type { AppRecord } from '../types/entities.js';

/**
 * Application-usage contract.
 *
 * A batch is accepted only for the authenticated user and the device proved by X-Device-Credential.
 * employeeId is copied from the caller's active employee record. Client employee ids are rejected.
 * An interval id is cumulative: a replay keeps the stored duration, and a later upload may only raise it.
 * The same device, process, and bucket cannot exceed one bucket plus clock skew, even across ids.
 * Samples are not time entries, attendance, or payroll inputs.
 * Window titles, keystrokes, clipboard text, and document contents are not fields of this contract.
 * Retention is the organization policy (7–90 days, default 30). Older rows are deleted on write and read.
 */
export const USAGE_BUCKET_SECONDS = 300;
export const USAGE_BUCKET_MS = USAGE_BUCKET_SECONDS * 1000;
export const USAGE_FUTURE_MS = 2 * 60 * 1000;
export const USAGE_DURATION_SLACK_MS = 2_000;
export const MAX_USAGE_DURATION_MS = USAGE_BUCKET_MS + USAGE_DURATION_SLACK_MS;
export const MAX_USAGE_BATCH = 40;
export const DEFAULT_IDLE_THRESHOLD_SECONDS = 60;
export const DEFAULT_RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;
const SUMMARY_RANGE_MS = 31 * DAY_MS;

const enrollment = new AgentEnrollmentService();

export interface UsagePolicyInput {
  enabled: boolean;
  employeeMayPause: boolean;
  idleThresholdSeconds: number;
  retentionDays: number;
}

export interface UsageIntervalInput {
  clientIntervalId: string;
  processName: string;
  displayName?: string;
  startedAt: string;
  durationMs: number;
}

export interface UsageSessionInput {
  clientSessionId: string;
  startedAt: string;
  endedAt?: string;
  endReason?: string;
}

export interface UsageBatchInput {
  session: UsageSessionInput;
  intervals: UsageIntervalInput[];
}

interface ResolvedPolicy {
  enabled: boolean;
  employeeMayPause: boolean;
  idleThresholdSeconds: number;
  retentionDays: number;
  disabledAt: string | null;
}

function instant(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' && value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function iso(value: unknown): string | null {
  const time = instant(value);
  return time === null ? null : new Date(time).toISOString();
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function isDuplicate(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 11000);
}

function http(status: number, message: string, code: string): HttpError {
  return new HttpError(status, message, code);
}

function publicPolicy(policy: ResolvedPolicy, paused: boolean, pausedAt: string | null): Record<string, unknown> {
  return {
    enabled: policy.enabled,
    employeeMayPause: policy.employeeMayPause,
    idleThresholdSeconds: policy.idleThresholdSeconds,
    bucketSeconds: USAGE_BUCKET_SECONDS,
    retentionDays: policy.retentionDays,
    collectWindowTitles: false,
    paused,
    disabledAt: policy.disabledAt,
    pausedAt,
  };
}

function policyFrom(row: AppRecord | undefined): ResolvedPolicy {
  if (!row) {
    return {
      enabled: false,
      employeeMayPause: true,
      idleThresholdSeconds: DEFAULT_IDLE_THRESHOLD_SECONDS,
      retentionDays: DEFAULT_RETENTION_DAYS,
      disabledAt: null,
    };
  }
  return {
    enabled: row.enabled === true,
    employeeMayPause: row.employeeMayPause !== false,
    idleThresholdSeconds: asNumber(row.idleThresholdSeconds) || DEFAULT_IDLE_THRESHOLD_SECONDS,
    retentionDays: asNumber(row.retentionDays) || DEFAULT_RETENTION_DAYS,
    disabledAt: iso(row.disabledAt),
  };
}

async function loadPolicy(organizationId: string): Promise<{ row?: AppRecord; policy: ResolvedPolicy }> {
  const rows = await database.forOrganization(organizationId).list('AgentUsagePolicy', {});
  const row = rows[0];
  return { ...(row ? { row } : {}), policy: policyFrom(row) };
}

async function loadPreference(organizationId: string, userId: string): Promise<AppRecord | undefined> {
  const rows = await database.forOrganization(organizationId).list('AgentUsagePreference', { userId });
  return rows[0];
}

async function purgeOlderThan(organizationId: string, cutoff: number, filter: Record<string, unknown> = {}): Promise<void> {
  const db = database.forOrganization(organizationId);
  for (const name of ['AgentUsageInterval', 'AgentUsageSession'] as const) {
    const rows = await db.list(name, filter);
    for (const row of rows) {
      const started = instant(row.startedAt);
      if (started !== null && started < cutoff) await db.remove(name, row.id);
    }
  }
}

function assertTimestamp(value: string, now: number, retentionDays: number, path: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw http(400, 'Usage timestamp is invalid', 'VALIDATION_ERROR');
  if (parsed > now + USAGE_FUTURE_MS) throw http(400, 'Usage timestamp is too far in the future', 'VALIDATION_ERROR');
  if (parsed < now - retentionDays * DAY_MS) throw http(400, 'Usage sample is older than the retention window', 'USAGE_RETENTION');
  return parsed;
}

function sameInstant(left: unknown, right: number): boolean {
  const parsed = instant(left);
  return parsed !== null && Math.abs(parsed - right) < 1;
}

export class ApplicationUsageService {
  async getPolicy(actor: EnrollmentActor, deviceId: string, secret: string): Promise<Record<string, unknown>> {
    await enrollment.assertUsageDevice(actor, deviceId, secret);
    const { policy } = await loadPolicy(actor.organizationId);
    const preference = await loadPreference(actor.organizationId, actor.userId);
    return publicPolicy(policy, preference?.paused === true, iso(preference?.pausedAt));
  }

  async setPolicy(actor: EnrollmentActor, input: UsagePolicyInput): Promise<Record<string, unknown>> {
    const db = database.forOrganization(actor.organizationId);
    const { row, policy } = await loadPolicy(actor.organizationId);
    const now = new Date();
    let disabledAt: Date | null = policy.disabledAt ? new Date(policy.disabledAt) : null;
    if (!input.enabled) disabledAt = disabledAt ?? now;
    if (input.enabled) disabledAt = null;
    const patch = {
      enabled: input.enabled,
      employeeMayPause: input.employeeMayPause,
      idleThresholdSeconds: input.idleThresholdSeconds,
      retentionDays: input.retentionDays,
      disabledAt,
      updatedBy: actor.userId,
    };
    const saved = row
      ? await db.update('AgentUsagePolicy', row.id, patch)
      : await db.create('AgentUsagePolicy', { id: `usage-policy-${actor.organizationId}`, ...patch, createdBy: actor.userId });
    const resolved = policyFrom(saved || row);
    return {
      enabled: resolved.enabled,
      employeeMayPause: resolved.employeeMayPause,
      idleThresholdSeconds: resolved.idleThresholdSeconds,
      bucketSeconds: USAGE_BUCKET_SECONDS,
      retentionDays: resolved.retentionDays,
      collectWindowTitles: false,
      disabledAt: resolved.disabledAt,
    };
  }

  async setPreference(actor: EnrollmentActor, deviceId: string, secret: string, paused: boolean): Promise<Record<string, unknown>> {
    await enrollment.assertUsageDevice(actor, deviceId, secret);
    const { policy } = await loadPolicy(actor.organizationId);
    if (!policy.employeeMayPause) throw http(403, 'Pausing usage collection is not allowed', 'USAGE_PAUSE_NOT_ALLOWED');
    const db = database.forOrganization(actor.organizationId);
    const existing = await loadPreference(actor.organizationId, actor.userId);
    const now = new Date();
    const patch = {
      paused,
      pausedAt: paused ? (existing?.paused === true && existing.pausedAt ? existing.pausedAt : now) : null,
      updatedBy: actor.userId,
    };
    const saved = existing
      ? await db.update('AgentUsagePreference', existing.id, patch)
      : await db.create('AgentUsagePreference', { id: `usage-preference-${actor.userId}`, userId: actor.userId, ...patch, createdBy: actor.userId });
    return { paused: saved?.paused === true, pausedAt: iso(saved?.pausedAt) };
  }

  async upload(actor: EnrollmentActor, deviceId: string, secret: string, input: UsageBatchInput): Promise<Record<string, unknown>> {
    await enrollment.assertUsageDevice(actor, deviceId, secret);
    const identity = await selfIdentity(actor.organizationId, actor.userId);
    const employeeId = identity.association.state === 'active' ? identity.association.employeeId : null;
    const { policy } = await loadPolicy(actor.organizationId);
    const preference = await loadPreference(actor.organizationId, actor.userId);
    const now = Date.now();
    await purgeOlderThan(actor.organizationId, now - policy.retentionDays * DAY_MS, { deviceId });
    const sessionStarted = assertTimestamp(input.session.startedAt, now, policy.retentionDays, 'session.startedAt');
    const sessionEnded = input.session.endedAt ? assertTimestamp(input.session.endedAt, now, policy.retentionDays, 'session.endedAt') : null;
    if (sessionEnded !== null && sessionEnded < sessionStarted) throw http(400, 'Usage session ends before it starts', 'VALIDATION_ERROR');

    const db = database.forOrganization(actor.organizationId);
    await this.saveSession(actor, deviceId, employeeId, input.session, sessionStarted, sessionEnded);
    const existing = await db.list('AgentUsageInterval', { deviceId });
    let accepted = 0;
    let duplicate = 0;
    let updated = 0;
    const rejected: { clientIntervalId: string; code: string }[] = [];
    const pausedAt = preference?.paused === true ? instant(preference.pausedAt) : null;
    const disabledAt = instant(policy.disabledAt);

    for (const interval of input.intervals) {
      const started = Date.parse(interval.startedAt);
      if (!Number.isFinite(started) || started > now + USAGE_FUTURE_MS || started < now - policy.retentionDays * DAY_MS) {
        rejected.push({ clientIntervalId: interval.clientIntervalId, code: started < now - policy.retentionDays * DAY_MS ? 'USAGE_RETENTION' : 'VALIDATION_ERROR' });
        continue;
      }
      if (!policy.enabled && (disabledAt === null || started >= disabledAt)) {
        rejected.push({ clientIntervalId: interval.clientIntervalId, code: 'USAGE_DISABLED' });
        continue;
      }
      if (pausedAt !== null && started >= pausedAt) {
        rejected.push({ clientIntervalId: interval.clientIntervalId, code: 'USAGE_PAUSED' });
        continue;
      }
      const peers = existing.filter((row) => row.processName === interval.processName && sameInstant(row.startedAt, started) && row.clientIntervalId !== interval.clientIntervalId);
      const peerSum = peers.reduce((sum, row) => sum + asNumber(row.durationMs), 0);
      if (peerSum + interval.durationMs > MAX_USAGE_DURATION_MS) {
        rejected.push({ clientIntervalId: interval.clientIntervalId, code: 'USAGE_DURATION' });
        continue;
      }
      const current = existing.find((row) => row.clientIntervalId === interval.clientIntervalId);
      if (current && current.processName !== interval.processName) {
        rejected.push({ clientIntervalId: interval.clientIntervalId, code: 'USAGE_INTERVAL_CONFLICT' });
        continue;
      }
      if (current && asNumber(current.durationMs) >= interval.durationMs) {
        duplicate += 1;
        continue;
      }
      const record = {
        userId: actor.userId,
        employeeId,
        deviceId,
        clientSessionId: input.session.clientSessionId,
        clientIntervalId: interval.clientIntervalId,
        processName: interval.processName,
        displayName: interval.displayName ?? null,
        startedAt: new Date(started).toISOString(),
        durationMs: interval.durationMs,
        updatedBy: actor.userId,
      };
      if (current) {
        const saved = await db.update('AgentUsageInterval', current.id, record);
        if (saved) {
          const index = existing.findIndex((row) => row.id === current.id);
          if (index >= 0) existing[index] = saved;
        }
        updated += 1;
        continue;
      }
      try {
        const created = await db.create('AgentUsageInterval', { ...record, createdBy: actor.userId });
        existing.push(created);
        accepted += 1;
      } catch (error) {
        if (!isDuplicate(error)) throw error;
        const raced = (await db.list('AgentUsageInterval', { deviceId, clientIntervalId: interval.clientIntervalId }))[0];
        if (!raced) throw error;
        if (asNumber(raced.durationMs) >= interval.durationMs) duplicate += 1;
        else {
          await db.update('AgentUsageInterval', raced.id, record);
          updated += 1;
        }
      }
    }

    const sampleAt = input.intervals.reduce<number | null>((latest, interval) => {
      const started = Date.parse(interval.startedAt);
      if (!Number.isFinite(started)) return latest;
      const end = started + interval.durationMs;
      return latest === null || end > latest ? end : latest;
    }, sessionEnded ?? sessionStarted);
    const uploadedAt = new Date();
    const storedCount = accepted + duplicate + updated;
    const recordSync = storedCount > 0 || input.intervals.length === 0;
    let lastSuccessfulUploadAt: string | null;
    if (recordSync) {
      await this.saveStatus(actor, deviceId, uploadedAt, sampleAt === null ? uploadedAt : new Date(sampleAt));
      lastSuccessfulUploadAt = uploadedAt.toISOString();
    } else {
      const existingStatus = (await db.list('AgentUsageStatus', { deviceId }))[0];
      lastSuccessfulUploadAt = iso(existingStatus?.lastSuccessfulUploadAt);
    }
    return {
      accepted,
      duplicate,
      updated,
      rejected,
      lastSuccessfulUploadAt,
      enabled: policy.enabled,
      paused: preference?.paused === true,
    };
  }

  async summary(actor: EnrollmentActor, userId: string, from: string | undefined, to: string | undefined): Promise<Record<string, unknown>> {
    const now = Date.now();
    const { policy } = await loadPolicy(actor.organizationId);
    await purgeOlderThan(actor.organizationId, now - policy.retentionDays * DAY_MS, { userId });
    const end = to ? Date.parse(to) : now;
    const start = from ? Date.parse(from) : end - 7 * DAY_MS;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) throw http(400, 'Usage summary range is invalid', 'VALIDATION_ERROR');
    if (end - start > SUMMARY_RANGE_MS) throw http(400, 'Usage summary range is too long', 'VALIDATION_ERROR');
    const db = database.forOrganization(actor.organizationId);
    const intervals = (await db.list('AgentUsageInterval', { userId })).filter((row) => {
      const started = instant(row.startedAt);
      return started !== null && started >= start && started <= end;
    });
    const grouped = new Map<string, { processName: string; displayName: string | null; startedAt: string; durationMs: number }>();
    for (const row of intervals) {
      const startedAt = iso(row.startedAt);
      if (!startedAt || typeof row.processName !== 'string') continue;
      const key = `${row.processName}\n${startedAt}`;
      const current = grouped.get(key);
      const displayName = typeof row.displayName === 'string' && row.displayName ? row.displayName : null;
      if (!current) grouped.set(key, { processName: row.processName, displayName, startedAt, durationMs: asNumber(row.durationMs) });
      else {
        current.durationMs += asNumber(row.durationMs);
        if (!current.displayName && displayName) current.displayName = displayName;
      }
    }
    const sessions = (await db.list('AgentUsageSession', { userId }))
      .filter((row) => {
        const started = instant(row.startedAt);
        return started !== null && started >= start && started <= end;
      })
      .map((row) => ({
        clientSessionId: row.clientSessionId,
        deviceId: row.deviceId,
        startedAt: iso(row.startedAt),
        endedAt: iso(row.endedAt),
        endReason: typeof row.endReason === 'string' ? row.endReason : null,
        status: row.status,
      }));
    const statuses = await db.list('AgentUsageStatus', { userId });
    const lastSuccessfulUploadAt = statuses.reduce<string | null>((latest, row) => {
      const value = iso(row.lastSuccessfulUploadAt);
      if (!value) return latest;
      return latest === null || value > latest ? value : latest;
    }, null);
    return {
      data: [...grouped.values()].sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.processName.localeCompare(right.processName)),
      sessions,
      health: { lastSuccessfulUploadAt },
    };
  }

  private async saveSession(actor: EnrollmentActor, deviceId: string, employeeId: string | null, session: UsageSessionInput, started: number, ended: number | null): Promise<void> {
    const db = database.forOrganization(actor.organizationId);
    const existing = (await db.list('AgentUsageSession', { deviceId, clientSessionId: session.clientSessionId }))[0];
    const endedAt = ended === null ? null : new Date(ended).toISOString();
    const previousEnd = instant(existing?.endedAt);
    const nextEnd = ended !== null && endedAt && (previousEnd === null || ended > previousEnd) ? endedAt : (existing?.endedAt ?? null);
    const patch: Record<string, unknown> = {
      userId: actor.userId,
      employeeId,
      deviceId,
      clientSessionId: session.clientSessionId,
      startedAt: existing?.startedAt ?? new Date(started).toISOString(),
      endedAt: nextEnd,
      status: nextEnd ? 'closed' : 'open',
      updatedBy: actor.userId,
    };
    if (session.endReason && nextEnd) patch.endReason = session.endReason;
    if (existing) {
      await db.update('AgentUsageSession', existing.id, patch);
      return;
    }
    try {
      await db.create('AgentUsageSession', { ...patch, createdBy: actor.userId });
    } catch (error) {
      if (!isDuplicate(error)) throw error;
      const raced = (await db.list('AgentUsageSession', { deviceId, clientSessionId: session.clientSessionId }))[0];
      if (raced) await db.update('AgentUsageSession', raced.id, patch);
    }
  }

  private async saveStatus(actor: EnrollmentActor, deviceId: string, uploadedAt: Date, sampleAt: Date): Promise<void> {
    const db = database.forOrganization(actor.organizationId);
    const existing = (await db.list('AgentUsageStatus', { deviceId }))[0];
    const patch = { userId: actor.userId, deviceId, lastSuccessfulUploadAt: uploadedAt.toISOString(), lastSampleAt: sampleAt.toISOString(), updatedBy: actor.userId };
    if (existing) {
      await db.update('AgentUsageStatus', existing.id, patch);
      return;
    }
    try {
      await db.create('AgentUsageStatus', { id: `usage-status-${deviceId}`, ...patch, createdBy: actor.userId });
    } catch (error) {
      if (!isDuplicate(error)) throw error;
    }
  }
}

export async function assertSummaryUser(actor: EnrollmentActor, userId: string): Promise<void> {
  if (userId === actor.userId) return;
  const user = await database.forOrganization(actor.organizationId).get('User', userId);
  if (!user) throw new HttpError(404, 'User not found');
}
