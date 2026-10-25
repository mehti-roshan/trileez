import { database } from '../db/database.js';
import type { DatabasePageOptions, PageResult } from '../db/query.js';
import { HttpError } from '../utils/httpError.js';
import type { AppRecord } from '../types/entities.js';
import { publicEnrollment, type EnrollmentActor } from './agentEnrollment.js';
import { ScreenShareService } from './screenShare.js';

const screenShare = new ScreenShareService();
const sessionFields = ['id', 'deviceId', 'state', 'supportUserId', 'supportName', 'employeeUserId', 'employeeId', 'requestedAt', 'startedAt', 'endedAt', 'endReason', 'expiresAt', 'lastAgentAt', 'qualityMode', 'controlState', 'inputPlane', 'permittedCapabilities', 'requestNote'] as const;

interface Directory {
  users: Map<string, string>;
  employees: Map<string, string>;
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

function later(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (!Number.isFinite(leftTime)) return right;
  if (!Number.isFinite(rightTime)) return left;
  return leftTime >= rightTime ? left : right;
}

function metric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function healthView(row: AppRecord | undefined, uploadedAt: string | null): Record<string, unknown> | null {
  if (!row) return null;
  return {
    sampledAt: iso(row.sampledAt),
    cpuPercent: metric(row.cpuPercent),
    memoryUsedBytes: metric(row.memoryUsedBytes),
    memoryTotalBytes: metric(row.memoryTotalBytes),
    diskFreeBytes: metric(row.diskFreeBytes),
    diskTotalBytes: metric(row.diskTotalBytes),
    osName: text(row.osName),
    osVersion: text(row.osVersion),
    architecture: text(row.architecture),
    agentVersion: text(row.agentVersion),
    collectorPhase: text(row.collectorPhase),
    syncPhase: text(row.syncPhase),
    queueDepth: metric(row.queueDepth),
    pendingBytes: metric(row.pendingBytes),
    lastSuccessfulUploadAt: uploadedAt,
  };
}

function latestSample(rows: AppRecord[]): AppRecord | undefined {
  return rows.reduce<AppRecord | undefined>((best, sample) => {
    const time = instant(sample.sampledAt);
    if (time === null) return best;
    const bestTime = best ? instant(best.sampledAt) : null;
    if (!best || bestTime === null || time > bestTime) return sample;
    return best;
  }, undefined);
}

function usageProcesses(rows: AppRecord[]): { processName: string; durationMs: number }[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const name = text(row.processName);
    const duration = metric(row.durationMs);
    if (!name || duration === null || duration <= 0) continue;
    totals.set(name, (totals.get(name) ?? 0) + duration);
  }
  return [...totals.entries()]
    .map(([processName, durationMs]) => ({ processName, durationMs }))
    .sort((left, right) => right.durationMs - left.durationMs || left.processName.localeCompare(right.processName))
    .slice(0, 12);
}

function notices(row: AppRecord, published: Record<string, unknown>, health: Record<string, unknown> | null): { code: string; source: 'enrollment' | 'health' }[] {
  const items: { code: string; source: 'enrollment' | 'health' }[] = [];
  const status = published.status;
  const seen = iso(row.lastSeenAt);
  if (status === 'revoked') items.push({ code: 'DEVICE_REVOKED', source: 'enrollment' });
  else if (status === 'disabled') items.push({ code: 'DEVICE_DISABLED', source: 'enrollment' });
  else if (status === 'active' && row.connectionStatus === 'online' && published.connectionStatus === 'offline' && seen) items.push({ code: 'HEARTBEAT_STALE', source: 'enrollment' });
  else if (status === 'active' && published.connectionStatus === 'offline' && seen) items.push({ code: 'CONNECTION_OFFLINE', source: 'enrollment' });
  const syncPhase = health ? text(health.syncPhase) : null;
  const collectorPhase = health ? text(health.collectorPhase) : null;
  if (syncPhase === 'retrying' || syncPhase === 'offline' || syncPhase === 'revoked') items.push({ code: `HEALTH_SYNC_${syncPhase.toUpperCase()}`, source: 'health' });
  if (collectorPhase === 'offline' || collectorPhase === 'stopped' || collectorPhase === 'disabled') items.push({ code: `HEALTH_COLLECTOR_${collectorPhase.toUpperCase()}`, source: 'health' });
  return items;
}

function managementSession(session: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!session) return null;
  const copy: Record<string, unknown> = {};
  for (const key of sessionFields) {
    if (key in session) copy[key] = session[key];
  }
  return copy;
}

export class AgentDeviceOverviewService {
  async list(actor: EnrollmentActor, options: DatabasePageOptions): Promise<PageResult<Record<string, unknown>>> {
    const page = await database.forOrganization(actor.organizationId).page('AgentEnrollment', options);
    const names = await this.directory(actor.organizationId);
    const now = Date.now();
    const data: Record<string, unknown>[] = [];
    for (const row of page.data) data.push(await this.project(actor, row, names, now));
    return { ...page, data };
  }

  async get(actor: EnrollmentActor, id: string): Promise<Record<string, unknown>> {
    const row = await database.forOrganization(actor.organizationId).get('AgentEnrollment', id);
    if (!row) throw new HttpError(404, 'Device enrollment not found');
    return this.project(actor, row, await this.directory(actor.organizationId), Date.now());
  }

  private async directory(organizationId: string): Promise<Directory> {
    const db = database.forOrganization(organizationId);
    const users = new Map<string, string>();
    const employees = new Map<string, string>();
    for (const user of await db.list('User', {})) {
      const name = text(user.name);
      if (name) users.set(user.id, name);
    }
    for (const employee of await db.list('Employee', {})) {
      const name = text(employee.fullName);
      if (name) employees.set(employee.id, name);
    }
    return { users, employees };
  }

  private async project(actor: EnrollmentActor, row: AppRecord, names: Directory, now: number): Promise<Record<string, unknown>> {
    const published = publicEnrollment(row, now);
    const db = database.forOrganization(actor.organizationId);
    const samples = await db.list('AgentHealthSample', { deviceId: row.id });
    const healthStatus = (await db.list('AgentHealthStatus', { deviceId: row.id }))[0];
    const usageStatus = (await db.list('AgentUsageStatus', { deviceId: row.id }))[0];
    const intervals = await db.list('AgentUsageInterval', { deviceId: row.id });
    const healthUploadedAt = iso(healthStatus?.lastSuccessfulUploadAt);
    const usageUploadedAt = iso(usageStatus?.lastSuccessfulUploadAt);
    const health = healthView(latestSample(samples), healthUploadedAt);
    const employeeId = typeof published.employeeId === 'string' ? published.employeeId : null;
    const userId = typeof published.userId === 'string' ? published.userId : '';
    const visibility = await screenShare.managerVisibility(actor, row.id);
    return {
      ...published,
      employeeName: employeeId ? names.employees.get(employeeId) ?? null : null,
      userName: names.users.get(userId) ?? null,
      connectionVerified: published.connectionStatus === 'online',
      telemetry: {
        healthLastSuccessfulUploadAt: healthUploadedAt,
        usageLastSuccessfulUploadAt: usageUploadedAt,
        lastSuccessfulSyncAt: later(healthUploadedAt, usageUploadedAt),
        health,
        usageProcesses: usageProcesses(intervals),
      },
      notices: notices(row, published, health),
      screen: {
        access: visibility.access,
        session: visibility.access === 'own' ? managementSession(visibility.session) : null,
      },
    };
  }
}
