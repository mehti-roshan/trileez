import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { database } from '../db/database.js';
import { models } from '../models/index.js';
import { pageQuery } from '../db/query.js';
import type { DatabasePageOptions, PageResult } from '../db/query.js';
import { selfIdentity } from './employeeIdentity.js';
import { HttpError } from '../utils/httpError.js';
import type { AppRecord } from '../types/entities.js';

export const ENROLLMENT_CAPABILITIES = ['employee-dashboard', 'time-entry', 'attendance-read', 'application-usage', 'device-health', 'screen-share', 'remote-control'] as const;
const STALE_AFTER_MS = 3 * 60 * 1000;
const allowedCapabilities = new Set<string>(ENROLLMENT_CAPABILITIES);

export interface EnrollmentActor {
  organizationId: string;
  userId: string;
}

export interface EnrollmentInput {
  installationId: string;
  deviceName: string;
  agentVersion: string;
  capabilities?: string[];
  platform?: string;
  osDescription?: string;
}

export interface EnrollmentResult {
  enrollment: Record<string, unknown>;
  created: boolean;
  credential?: string;
}

function asRecord(value: unknown): AppRecord | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as { toObject?: () => Record<string, unknown> };
  const row = typeof source.toObject === 'function' ? source.toObject() : { ...(value as Record<string, unknown>) };
  if (row._id !== undefined) {
    row.id = String(row._id);
    delete row._id;
    delete row.__v;
  }
  return row as AppRecord;
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

export function allowedCapabilityList(input: readonly string[] | undefined): string[] {
  const requested = new Set(input || []);
  return ENROLLMENT_CAPABILITIES.filter((item) => requested.has(item));
}

function reportedConnection(row: AppRecord, now: number): 'online' | 'offline' {
  if (row.status !== 'active' || row.connectionStatus !== 'online') return 'offline';
  const seen = instant(row.lastSeenAt);
  if (seen === null || now - seen > STALE_AFTER_MS) return 'offline';
  return 'online';
}

export function publicEnrollment(row: AppRecord, now = Date.now()): Record<string, unknown> {
  const capabilities = Array.isArray(row.capabilities)
    ? row.capabilities.filter((item): item is string => typeof item === 'string' && allowedCapabilities.has(item))
    : [];
  return {
    id: row.id,
    installationId: row.installationId,
    deviceName: row.deviceName,
    agentVersion: row.agentVersion,
    capabilities,
    platform: typeof row.platform === 'string' ? row.platform : null,
    osDescription: typeof row.osDescription === 'string' ? row.osDescription : null,
    status: row.status,
    connectionStatus: reportedConnection(row, now),
    lastSeenAt: iso(row.lastSeenAt),
    enrolledAt: iso(row.enrolledAt),
    revokedAt: iso(row.revokedAt),
    disabledAt: iso(row.disabledAt),
    employeeId: typeof row.employeeId === 'string' && row.employeeId ? row.employeeId : null,
    userId: row.userId,
  };
}

function hashCredential(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

function newCredential(): string {
  return randomBytes(32).toString('base64url');
}

function credentialMatches(secret: string, hash: unknown): boolean {
  if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) return false;
  const actual = createHash('sha256').update(secret, 'utf8').digest();
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function isDuplicate(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 11000);
}

function notFound(): HttpError {
  return new HttpError(404, 'Device enrollment not found');
}

function rejectedCredential(): HttpError {
  return new HttpError(401, 'Device credential was rejected', 'DEVICE_CREDENTIAL_REJECTED');
}

function revoked(): HttpError {
  return new HttpError(403, 'This device enrollment is revoked', 'DEVICE_REVOKED');
}

function disabled(): HttpError {
  return new HttpError(403, 'This device enrollment is disabled', 'DEVICE_DISABLED');
}

async function loadById(organizationId: string, id: string): Promise<AppRecord | undefined> {
  if (database.mode() === 'mock') return database.forOrganization(organizationId).get('AgentEnrollment', id);
  return asRecord(await models.AgentEnrollment.findOne({ _id: id, organizationId }).select('+credentialHash').lean());
}

async function loadByInstallation(organizationId: string, installationId: string): Promise<AppRecord | undefined> {
  if (database.mode() === 'mock') {
    const rows = await database.forOrganization(organizationId).list('AgentEnrollment', { installationId });
    return rows[0];
  }
  return asRecord(await models.AgentEnrollment.findOne({ organizationId, installationId }).select('+credentialHash').lean());
}

function metadata(actor: EnrollmentActor, input: EnrollmentInput, employeeId: string | null): Record<string, unknown> {
  return {
    deviceName: input.deviceName,
    agentVersion: input.agentVersion,
    capabilities: allowedCapabilityList(input.capabilities),
    platform: input.platform ?? null,
    osDescription: input.osDescription ?? null,
    employeeId,
    updatedBy: actor.userId,
  };
}

async function linkedEmployeeId(actor: EnrollmentActor): Promise<string | null> {
  const identity = await selfIdentity(actor.organizationId, actor.userId);
  return identity.association.state === 'active' ? identity.association.employeeId : null;
}

export class AgentEnrollmentService {
  async register(actor: EnrollmentActor, input: EnrollmentInput, presentedSecret?: string): Promise<EnrollmentResult> {
    const employeeId = await linkedEmployeeId(actor);
    const existing = await loadByInstallation(actor.organizationId, input.installationId);
    if (existing) return this.reconcile(actor, existing, input, employeeId, presentedSecret);
    const credential = newCredential();
    const now = new Date().toISOString();
    try {
      const created = await database.forOrganization(actor.organizationId).create('AgentEnrollment', {
        ...metadata(actor, input, employeeId),
        userId: actor.userId,
        installationId: input.installationId,
        status: 'active',
        connectionStatus: 'offline',
        enrolledAt: now,
        credentialHash: hashCredential(credential),
        createdBy: actor.userId,
      });
      return { enrollment: publicEnrollment(created), created: true, credential };
    } catch (error) {
      if (!isDuplicate(error)) throw error;
      const raced = await loadByInstallation(actor.organizationId, input.installationId);
      if (!raced) throw error;
      return this.reconcile(actor, raced, input, employeeId, presentedSecret);
    }
  }

  private async reconcile(actor: EnrollmentActor, existing: AppRecord, input: EnrollmentInput, employeeId: string | null, presentedSecret?: string): Promise<EnrollmentResult> {
    if (existing.userId !== actor.userId) throw new HttpError(409, 'This installation is enrolled to another account', 'DEVICE_INSTALLATION_CONFLICT');
    if (existing.status === 'revoked') throw revoked();
    const db = database.forOrganization(actor.organizationId);
    if (existing.status === 'disabled') {
      const updated = await db.update('AgentEnrollment', existing.id, metadata(actor, input, employeeId));
      return { enrollment: publicEnrollment(updated || existing), created: false };
    }
    if (presentedSecret && credentialMatches(presentedSecret, existing.credentialHash)) {
      const updated = await db.update('AgentEnrollment', existing.id, metadata(actor, input, employeeId));
      return { enrollment: publicEnrollment(updated || existing), created: false };
    }
    const credential = newCredential();
    const updated = await db.update('AgentEnrollment', existing.id, { ...metadata(actor, input, employeeId), credentialHash: hashCredential(credential) });
    return { enrollment: publicEnrollment(updated || existing), created: false, credential };
  }

  async listMine(actor: EnrollmentActor, options: DatabasePageOptions): Promise<PageResult<Record<string, unknown>>> {
    options.accessFilter = { userId: actor.userId };
    options.accessPredicate = (row) => row.userId === actor.userId;
    const page = await database.forOrganization(actor.organizationId).page('AgentEnrollment', options);
    return { ...page, data: page.data.map((row) => publicEnrollment(row)) };
  }

  async getMine(actor: EnrollmentActor, id: string): Promise<Record<string, unknown>> {
    const row = await database.forOrganization(actor.organizationId).get('AgentEnrollment', id);
    if (!row || row.userId !== actor.userId) throw notFound();
    return publicEnrollment(row);
  }

  async heartbeat(actor: EnrollmentActor, id: string, secret: string, patch: { agentVersion?: string; capabilities?: string[] }): Promise<Record<string, unknown>> {
    const row = await this.ownedActive(actor, id, secret);
    const update: Record<string, unknown> = {
      lastSeenAt: new Date().toISOString(),
      connectionStatus: 'online',
      updatedBy: actor.userId,
    };
    if (patch.agentVersion) update.agentVersion = patch.agentVersion;
    if (patch.capabilities) update.capabilities = allowedCapabilityList(patch.capabilities);
    const updated = await database.forOrganization(actor.organizationId).update('AgentEnrollment', row.id, update);
    return publicEnrollment(updated || row);
  }

  async disconnect(actor: EnrollmentActor, id: string, secret: string): Promise<Record<string, unknown>> {
    const row = await this.ownedActive(actor, id, secret);
    const updated = await database.forOrganization(actor.organizationId).update('AgentEnrollment', row.id, {
      connectionStatus: 'offline',
      lastSeenAt: new Date().toISOString(),
      updatedBy: actor.userId,
    });
    return publicEnrollment(updated || row);
  }

  async unregister(actor: EnrollmentActor, id: string, secret: string): Promise<Record<string, unknown>> {
    const row = await loadById(actor.organizationId, id);
    if (!row || row.userId !== actor.userId) throw notFound();
    if (!credentialMatches(secret, row.credentialHash)) throw rejectedCredential();
    if (row.status === 'revoked') throw revoked();
    const updated = await database.forOrganization(actor.organizationId).update('AgentEnrollment', row.id, {
      status: 'revoked',
      revokedAt: new Date().toISOString(),
      connectionStatus: 'offline',
      updatedBy: actor.userId,
    });
    return publicEnrollment(updated || row);
  }

  async listManaged(organizationId: string, options: DatabasePageOptions): Promise<PageResult<Record<string, unknown>>> {
    const page = await database.forOrganization(organizationId).page('AgentEnrollment', options);
    return { ...page, data: page.data.map((row) => publicEnrollment(row)) };
  }

  async revoke(actor: EnrollmentActor, id: string): Promise<Record<string, unknown>> {
    const row = await this.managed(actor.organizationId, id);
    if (row.status === 'revoked') return publicEnrollment(row);
    const updated = await database.forOrganization(actor.organizationId).update('AgentEnrollment', row.id, {
      status: 'revoked',
      revokedAt: new Date().toISOString(),
      connectionStatus: 'offline',
      updatedBy: actor.userId,
    });
    return publicEnrollment(updated || row);
  }

  async disable(actor: EnrollmentActor, id: string): Promise<Record<string, unknown>> {
    const row = await this.managed(actor.organizationId, id);
    if (row.status === 'revoked') throw revoked();
    if (row.status === 'disabled') return publicEnrollment(row);
    const updated = await database.forOrganization(actor.organizationId).update('AgentEnrollment', row.id, {
      status: 'disabled',
      disabledAt: new Date().toISOString(),
      connectionStatus: 'offline',
      updatedBy: actor.userId,
    });
    return publicEnrollment(updated || row);
  }

  async enable(actor: EnrollmentActor, id: string): Promise<Record<string, unknown>> {
    const row = await this.managed(actor.organizationId, id);
    if (row.status === 'revoked') throw revoked();
    if (row.status === 'active') return publicEnrollment(row);
    const updated = await database.forOrganization(actor.organizationId).update('AgentEnrollment', row.id, {
      status: 'active',
      updatedBy: actor.userId,
    });
    return publicEnrollment(updated || row);
  }

  async assertUsageDevice(actor: EnrollmentActor, id: string, secret: string): Promise<AppRecord> {
    const row = await this.ownedActive(actor, id, secret);
    const capabilities = Array.isArray(row.capabilities) ? row.capabilities : [];
    if (!capabilities.includes('application-usage')) {
      throw new HttpError(403, 'Device is not allowed to report application usage', 'USAGE_CAPABILITY');
    }
    return row;
  }

  async assertHealthDevice(actor: EnrollmentActor, id: string, secret: string): Promise<AppRecord> {
    const row = await this.ownedActive(actor, id, secret);
    const capabilities = Array.isArray(row.capabilities) ? row.capabilities : [];
    if (!capabilities.includes('device-health')) {
      throw new HttpError(403, 'Device is not allowed to report device health', 'HEALTH_CAPABILITY');
    }
    return row;
  }

  async assertScreenDevice(actor: EnrollmentActor, id: string, secret: string): Promise<AppRecord> {
    const row = await this.ownedActive(actor, id, secret);
    const capabilities = Array.isArray(row.capabilities) ? row.capabilities : [];
    if (!capabilities.includes('screen-share')) {
      throw new HttpError(403, 'Device is not allowed to share its screen', 'SCREEN_CAPABILITY');
    }
    return row;
  }

  private async ownedActive(actor: EnrollmentActor, id: string, secret: string): Promise<AppRecord> {
    const row = await loadById(actor.organizationId, id);
    if (!row || row.userId !== actor.userId) throw notFound();
    if (!credentialMatches(secret, row.credentialHash)) throw rejectedCredential();
    if (row.status === 'revoked') throw revoked();
    if (row.status === 'disabled') throw disabled();
    return row;
  }

  private async managed(organizationId: string, id: string): Promise<AppRecord> {
    const row = await database.forOrganization(organizationId).get('AgentEnrollment', id);
    if (!row) throw notFound();
    return row;
  }
}

export function enrollmentListOptions(query: Record<string, unknown>, context: string): DatabasePageOptions {
  return pageQuery(query, { sortFields: ['enrolledAt', 'createdAt', 'deviceName'], defaultSort: 'enrolledAt', defaultDirection: 'desc' }, context);
}
