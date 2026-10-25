import { database } from '../db/database.js';
import { HttpError } from '../utils/httpError.js';
import type { AppRecord } from '../types/entities.js';
import { selfIdentity } from './employeeIdentity.js';
import { AgentEnrollmentService, publicEnrollment, type EnrollmentActor } from './agentEnrollment.js';

const enrollment = new AgentEnrollmentService();
const DAY_MS = 24 * 60 * 60 * 1000;
const FUTURE_MS = 2 * 60 * 1000;

export const HEALTH_RETENTION_DAYS = 14;
export const MAX_HEALTH_BATCH = 20;
export const MAX_HEALTH_BYTES = 64 * 1024;

export interface HealthSampleInput {
  clientSampleId: string;
  sampledAt: string;
  cpuPercent?: number;
  memoryUsedBytes?: number;
  memoryTotalBytes?: number;
  diskFreeBytes?: number;
  diskTotalBytes?: number;
  osName?: string;
  osVersion?: string;
  architecture?: string;
  agentVersion: string;
  online: boolean;
  lastHeartbeatAt?: string;
  collectorPhase: string;
  syncPhase: string;
  queueDepth: number;
  pendingBytes: number;
}

export interface HealthBatchInput {
  samples: HealthSampleInput[];
}

function http(status: number, message: string, code: string): HttpError {
  return new HttpError(status, message, code);
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

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isDuplicate(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 11000);
}

export function healthFingerprint(sample: HealthSampleInput): string {
  return JSON.stringify({
    sampledAt: new Date(Date.parse(sample.sampledAt)).toISOString(),
    cpuPercent: sample.cpuPercent ?? null,
    memoryUsedBytes: sample.memoryUsedBytes ?? null,
    memoryTotalBytes: sample.memoryTotalBytes ?? null,
    diskFreeBytes: sample.diskFreeBytes ?? null,
    diskTotalBytes: sample.diskTotalBytes ?? null,
    osName: sample.osName ?? null,
    osVersion: sample.osVersion ?? null,
    architecture: sample.architecture ?? null,
    agentVersion: sample.agentVersion,
    online: sample.online,
    lastHeartbeatAt: sample.lastHeartbeatAt ? new Date(Date.parse(sample.lastHeartbeatAt)).toISOString() : null,
    collectorPhase: sample.collectorPhase,
    syncPhase: sample.syncPhase,
    queueDepth: sample.queueDepth,
    pendingBytes: sample.pendingBytes,
  });
}

function timeClass(value: string, now: number): 'ok' | 'future' | 'retention' | 'invalid' {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 'invalid';
  if (parsed > now + FUTURE_MS) return 'future';
  if (parsed < now - HEALTH_RETENTION_DAYS * DAY_MS) return 'retention';
  return 'ok';
}

function sampleProblem(sample: HealthSampleInput, now: number): string | null {
  const sampled = timeClass(sample.sampledAt, now);
  if (sampled === 'retention') return 'HEALTH_RETENTION';
  if (sampled !== 'ok') return 'VALIDATION_ERROR';
  if (sample.lastHeartbeatAt && timeClass(sample.lastHeartbeatAt, now) === 'future') return 'VALIDATION_ERROR';
  if (sample.memoryUsedBytes !== undefined && sample.memoryTotalBytes !== undefined && sample.memoryUsedBytes > sample.memoryTotalBytes) return 'VALIDATION_ERROR';
  if (sample.diskFreeBytes !== undefined && sample.diskTotalBytes !== undefined && sample.diskFreeBytes > sample.diskTotalBytes) return 'VALIDATION_ERROR';
  return null;
}

async function purgeExpired(organizationId: string, deviceId: string, now: number): Promise<void> {
  const db = database.forOrganization(organizationId);
  const cutoff = now - HEALTH_RETENTION_DAYS * DAY_MS;
  const rows = await db.list('AgentHealthSample', { deviceId });
  for (const row of rows) {
    const sampled = instant(row.sampledAt);
    if (sampled !== null && sampled < cutoff) await db.remove('AgentHealthSample', row.id);
  }
}

function metric(value: unknown): number | null {
  return asNumber(value);
}

function publicSample(row: AppRecord): Record<string, unknown> {
  return {
    clientSampleId: row.clientSampleId,
    sampledAt: iso(row.sampledAt),
    cpuPercent: metric(row.cpuPercent),
    memoryUsedBytes: metric(row.memoryUsedBytes),
    memoryTotalBytes: metric(row.memoryTotalBytes),
    diskFreeBytes: metric(row.diskFreeBytes),
    diskTotalBytes: metric(row.diskTotalBytes),
    osName: typeof row.osName === 'string' ? row.osName : null,
    osVersion: typeof row.osVersion === 'string' ? row.osVersion : null,
    architecture: typeof row.architecture === 'string' ? row.architecture : null,
    agentVersion: row.agentVersion,
    online: row.online === true,
    lastHeartbeatAt: iso(row.lastHeartbeatAt),
    collectorPhase: row.collectorPhase,
    syncPhase: row.syncPhase,
    queueDepth: metric(row.queueDepth) ?? 0,
    pendingBytes: metric(row.pendingBytes) ?? 0,
  };
}

function recordFrom(actor: EnrollmentActor, deviceId: string, employeeId: string | null, sample: HealthSampleInput, fingerprint: string): Record<string, unknown> {
  const record: Record<string, unknown> = {
    userId: actor.userId,
    employeeId,
    deviceId,
    clientSampleId: sample.clientSampleId,
    sampledAt: new Date(Date.parse(sample.sampledAt)).toISOString(),
    agentVersion: sample.agentVersion,
    online: sample.online,
    collectorPhase: sample.collectorPhase,
    syncPhase: sample.syncPhase,
    queueDepth: sample.queueDepth,
    pendingBytes: sample.pendingBytes,
    fingerprint,
    updatedBy: actor.userId,
  };
  if (sample.cpuPercent !== undefined) record.cpuPercent = sample.cpuPercent;
  if (sample.memoryUsedBytes !== undefined) record.memoryUsedBytes = sample.memoryUsedBytes;
  if (sample.memoryTotalBytes !== undefined) record.memoryTotalBytes = sample.memoryTotalBytes;
  if (sample.diskFreeBytes !== undefined) record.diskFreeBytes = sample.diskFreeBytes;
  if (sample.diskTotalBytes !== undefined) record.diskTotalBytes = sample.diskTotalBytes;
  if (sample.osName) record.osName = sample.osName;
  if (sample.osVersion) record.osVersion = sample.osVersion;
  if (sample.architecture) record.architecture = sample.architecture;
  if (sample.lastHeartbeatAt) record.lastHeartbeatAt = new Date(Date.parse(sample.lastHeartbeatAt)).toISOString();
  return record;
}

export class DeviceHealthService {
  async upload(actor: EnrollmentActor, deviceId: string, secret: string, input: HealthBatchInput): Promise<Record<string, unknown>> {
    if (Buffer.byteLength(JSON.stringify(input.samples), 'utf8') > MAX_HEALTH_BYTES) {
      throw http(413, 'Health payload is too large', 'PAYLOAD_TOO_LARGE');
    }
    await enrollment.assertHealthDevice(actor, deviceId, secret);
    const identity = await selfIdentity(actor.organizationId, actor.userId);
    const employeeId = identity.association.state === 'active' ? identity.association.employeeId : null;
    const now = Date.now();
    await purgeExpired(actor.organizationId, deviceId, now);
    const db = database.forOrganization(actor.organizationId);
    const existing = await db.list('AgentHealthSample', { deviceId });
    let accepted = 0;
    let duplicate = 0;
    const acceptedIds: string[] = [];
    const duplicateIds: string[] = [];
    const rejected: { clientSampleId: string; code: string }[] = [];
    let newest: number | null = null;

    for (const sample of input.samples) {
      const problem = sampleProblem(sample, now);
      if (problem) {
        rejected.push({ clientSampleId: sample.clientSampleId, code: problem });
        continue;
      }
      const fingerprint = healthFingerprint(sample);
      const current = existing.find((row) => row.clientSampleId === sample.clientSampleId);
      if (current) {
        if (current.fingerprint === fingerprint) {
          duplicate += 1;
          duplicateIds.push(sample.clientSampleId);
        } else {
          rejected.push({ clientSampleId: sample.clientSampleId, code: 'HEALTH_SAMPLE_CONFLICT' });
        }
        const sampled = Date.parse(sample.sampledAt);
        if (current.fingerprint === fingerprint && Number.isFinite(sampled) && (newest === null || sampled > newest)) newest = sampled;
        continue;
      }
      const record = recordFrom(actor, deviceId, employeeId, sample, fingerprint);
      try {
        const created = await db.create('AgentHealthSample', { id: `hs-${deviceId}-${sample.clientSampleId}`, ...record, createdBy: actor.userId });
        existing.push(created);
        accepted += 1;
        acceptedIds.push(sample.clientSampleId);
      } catch (error) {
        if (!isDuplicate(error)) throw error;
        const raced = (await db.list('AgentHealthSample', { deviceId, clientSampleId: sample.clientSampleId }))[0];
        if (!raced) throw error;
        existing.push(raced);
        if (raced.fingerprint === fingerprint) {
          duplicate += 1;
          duplicateIds.push(sample.clientSampleId);
        } else {
          rejected.push({ clientSampleId: sample.clientSampleId, code: 'HEALTH_SAMPLE_CONFLICT' });
          continue;
        }
      }
      const sampled = Date.parse(sample.sampledAt);
      if (Number.isFinite(sampled) && (newest === null || sampled > newest)) newest = sampled;
    }

    const uploadedAt = new Date();
    await this.saveStatus(actor, deviceId, uploadedAt, newest === null ? null : new Date(newest));
    return {
      accepted,
      duplicate,
      acceptedIds,
      duplicateIds,
      rejected,
      lastSuccessfulUploadAt: uploadedAt.toISOString(),
    };
  }

  async own(actor: EnrollmentActor, deviceId: string, secret: string): Promise<Record<string, unknown>> {
    await enrollment.assertHealthDevice(actor, deviceId, secret);
    await purgeExpired(actor.organizationId, deviceId, Date.now());
    return this.view(actor.organizationId, deviceId);
  }

  async summary(actor: EnrollmentActor, deviceId: string | undefined): Promise<Record<string, unknown>> {
    const db = database.forOrganization(actor.organizationId);
    if (deviceId) {
      const row = await db.get('AgentEnrollment', deviceId);
      if (!row) throw new HttpError(404, 'Device enrollment not found');
      await purgeExpired(actor.organizationId, deviceId, Date.now());
      return { data: [await this.view(actor.organizationId, deviceId)] };
    }
    const rows = await db.list('AgentEnrollment', {});
    const data = [];
    for (const row of rows.slice(0, 100)) {
      await purgeExpired(actor.organizationId, row.id, Date.now());
      data.push(await this.view(actor.organizationId, row.id));
    }
    return { data };
  }

  private async view(organizationId: string, deviceId: string): Promise<Record<string, unknown>> {
    const db = database.forOrganization(organizationId);
    const row = await db.get('AgentEnrollment', deviceId);
    if (!row) throw new HttpError(404, 'Device enrollment not found');
    const published = publicEnrollment(row);
    const samples = await db.list('AgentHealthSample', { deviceId });
    const latest = samples.reduce<AppRecord | undefined>((best, sample) => {
      const time = instant(sample.sampledAt);
      const bestTime = best ? instant(best.sampledAt) : null;
      if (time === null) return best;
      if (!best || bestTime === null || time > bestTime) return sample;
      return best;
    }, undefined);
    const status = (await db.list('AgentHealthStatus', { deviceId }))[0];
    const metrics = latest ? publicSample(latest) : null;
    return {
      deviceId,
      deviceName: published.deviceName,
      employeeId: published.employeeId,
      enrollmentStatus: published.status,
      connectionStatus: published.connectionStatus,
      lastSeenAt: published.lastSeenAt,
      agentVersion: published.agentVersion,
      lastSuccessfulUploadAt: iso(status?.lastSuccessfulUploadAt),
      lastSampleAt: latest ? iso(latest.sampledAt) : iso(status?.lastSampleAt),
      sample: metrics,
      retentionDays: HEALTH_RETENTION_DAYS,
    };
  }

  private async saveStatus(actor: EnrollmentActor, deviceId: string, uploadedAt: Date, sampleAt: Date | null): Promise<void> {
    const db = database.forOrganization(actor.organizationId);
    const existing = (await db.list('AgentHealthStatus', { deviceId }))[0];
    const patch: Record<string, unknown> = {
      userId: actor.userId,
      deviceId,
      lastSuccessfulUploadAt: uploadedAt.toISOString(),
      updatedBy: actor.userId,
    };
    if (sampleAt) patch.lastSampleAt = sampleAt.toISOString();
    if (existing) {
      await db.update('AgentHealthStatus', existing.id, patch);
      return;
    }
    try {
      await db.create('AgentHealthStatus', { id: `health-status-${deviceId}`, ...patch, createdBy: actor.userId });
    } catch (error) {
      if (!isDuplicate(error)) throw error;
      const raced = (await db.list('AgentHealthStatus', { deviceId }))[0];
      if (raced) await db.update('AgentHealthStatus', raced.id, patch);
    }
  }
}
