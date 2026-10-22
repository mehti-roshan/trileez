import { database } from '../db/database.js';
import { HttpError } from '../utils/httpError.js';
import { id } from '../utils/id.js';
import type { AppRecord } from '../types/entities.js';
import { selfIdentity } from './employeeIdentity.js';
import { auditService } from './audit.js';
import { AgentEnrollmentService, type EnrollmentActor } from './agentEnrollment.js';

/**
 * Screen assistance over the existing HTTPS API.
 * TLS encrypts signaling and the latest JPEG. Frames stay in process memory for a few seconds.
 * They are not written to Mongo, disk, or object storage.
 * WebRTC is not used: this server has no WebSocket, ICE, STUN, or TURN service.
 * High-quality mode uses the same slot. The latest JPEG replaces the previous one.
 * Remote control is a separate grant on that session. Screen viewing does not grant it.
 * This service does not accept shell commands, keystrokes, or operating-system input.
 */
const enrollment = new AgentEnrollmentService();
const REQUEST_TTL_MS = 2 * 60 * 1000;
const ACTIVE_TTL_MS = 30 * 60 * 1000;
const AGENT_SILENCE_MS = 20 * 1000;
const FRAME_TTL_MS = 3 * 1000;
const RELAY_WINDOW_MS = 1000;
const PERSIST_INTERVAL_MS = 1000;
const CONTROL_TTL_MS = 10 * 60 * 1000;
export const MAX_FRAME_BYTES = 400_000;
const controlStates = new Set(['off', 'requested', 'granted', 'denied', 'revoked', 'expired']);

type FrameSlot = { bytes: Buffer; at: number; count: number; persistedAt: number; acceptedAt: number[] };
const frames = new Map<string, FrameSlot>();

export interface ScreenSessionInput {
  requestNote?: string | undefined;
  qualityMode?: string | undefined;
  maxFps?: number | undefined;
  maxEdge?: number | undefined;
  jpegQuality?: number | undefined;
}

export function clampQuality(input: ScreenSessionInput): { qualityMode: 'assistance' | 'high'; maxFps: number; maxEdge: number; jpegQuality: number } {
  const high = input.qualityMode === 'high';
  return {
    qualityMode: high ? 'high' : 'assistance',
    maxFps: clampInt(input.maxFps, high ? 30 : 2, high ? 15 : 1, high ? 30 : 5),
    maxEdge: clampInt(input.maxEdge, high ? 1920 : 1280, 640, high ? 1920 : 1280),
    jpegQuality: clampInt(input.jpegQuality, high ? 75 : 60, high ? 40 : 30, high ? 85 : 70),
  };
}

const endReasons = new Set(['employee_stop', 'rejected', 'shutdown', 'agent_lost', 'support_end', 'timeout']);

function http(status: number, message: string, code: string): HttpError {
  return new HttpError(status, message, code);
}

function notFound(): HttpError {
  return new HttpError(404, 'Screen session not found');
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

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function hasScreenCapability(row: AppRecord): boolean {
  return Array.isArray(row.capabilities) && row.capabilities.includes('screen-share');
}

function hasRemoteControl(row: AppRecord): boolean {
  return Array.isArray(row.capabilities) && row.capabilities.includes('remote-control');
}

function controlStateOf(row: AppRecord, now: number): string {
  const state = typeof row.controlState === 'string' && controlStates.has(row.controlState) ? row.controlState : 'off';
  if (state !== 'granted') return state;
  const expires = instant(row.controlExpiresAt);
  if (expires === null || now > expires) return 'expired';
  return 'granted';
}

function recordedCapabilities(row: AppRecord, now: number): string[] {
  const capabilities: string[] = [];
  if (row.state === 'requested' || row.state === 'active') capabilities.push('screen-share');
  if (controlStateOf(row, now) === 'granted') capabilities.push('remote-control');
  return capabilities;
}

function controlView(row: AppRecord, now: number): Record<string, unknown> {
  const state = controlStateOf(row, now);
  const closed = state === 'denied' || state === 'revoked' || state === 'expired';
  return {
    controlState: state,
    controlGrantId: text(row.controlGrantId),
    controlRequestedAt: iso(row.controlRequestedAt),
    controlGrantedAt: state === 'granted' ? iso(row.controlGrantedAt) : null,
    controlExpiresAt: state === 'granted' ? iso(row.controlExpiresAt) : null,
    controlEndedAt: closed ? iso(row.controlEndedAt) : null,
    controlEndReason: closed ? text(row.controlEndReason) : null,
    permittedCapabilities: recordedCapabilities(row, now),
    inputPlane: 'unavailable',
  };
}

async function auditSession(organizationId: string, actorId: string, action: string, row: AppRecord, now: number, reason?: string, permittedCapabilities?: string[]): Promise<void> {
  await auditService.record({
    organizationId,
    actorId,
    action,
    entityType: 'AgentScreenSession',
    entityId: String(row.id),
    ...(reason ? { reason } : {}),
    metadata: {
      deviceId: row.deviceId,
      supportUserId: row.supportUserId,
      employeeUserId: row.userId,
      employeeId: text(row.employeeId),
      permittedCapabilities: permittedCapabilities ?? recordedCapabilities(row, now),
      controlState: controlStateOf(row, now),
      controlGrantId: text(row.controlGrantId),
    },
  });
}

function clearFrame(sessionId: string): void {
  frames.delete(sessionId);
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, parsed));
}

function rememberFrame(sessionId: string, bytes: Buffer, now: number, previousCount: number): FrameSlot {
  const existing = frames.get(sessionId);
  const acceptedAt = (existing?.acceptedAt ?? []).filter((time) => now - time <= RELAY_WINDOW_MS);
  acceptedAt.push(now);
  const slot: FrameSlot = {
    bytes: Buffer.from(bytes),
    at: now,
    count: (existing?.count ?? previousCount) + 1,
    persistedAt: existing?.persistedAt ?? 0,
    acceptedAt,
  };
  frames.set(sessionId, slot);
  return slot;
}

function relayOf(slot: FrameSlot | undefined, now: number): Record<string, unknown> {
  if (!slot) return { retainedFrames: 0, actualFps: null, acceptedInWindow: 0, windowMs: 0, lastBytes: 0 };
  const times = slot.acceptedAt.filter((time) => now - time <= RELAY_WINDOW_MS);
  const first = times[0];
  const last = times[times.length - 1];
  const windowMs = times.length >= 2 && first !== undefined && last !== undefined ? last - first : 0;
  const actualFps = windowMs >= 500 ? Number((((times.length - 1) * 1000) / windowMs).toFixed(2)) : null;
  return { retainedFrames: 1, actualFps, acceptedInWindow: times.length, windowMs, lastBytes: slot.bytes.length };
}

function publicSession(row: AppRecord, supportName: string | null, now = Date.now()): Record<string, unknown> {
  const slot = frames.get(String(row.id));
  const storedCount = typeof row.frameCount === 'number' ? row.frameCount : 0;
  const quality = clampQuality({
    qualityMode: row.qualityMode === 'high' ? 'high' : 'assistance',
    maxFps: typeof row.maxFps === 'number' ? row.maxFps : undefined,
    maxEdge: typeof row.maxEdge === 'number' ? row.maxEdge : undefined,
    jpegQuality: typeof row.jpegQuality === 'number' ? row.jpegQuality : undefined,
  });
  return {
    id: row.id,
    deviceId: row.deviceId,
    state: row.state,
    supportUserId: row.supportUserId,
    supportName,
    employeeUserId: row.userId,
    employeeId: text(row.employeeId),
    requestedAt: iso(row.requestedAt),
    startedAt: iso(row.startedAt),
    endedAt: iso(row.endedAt),
    endReason: text(row.endReason),
    expiresAt: iso(row.expiresAt),
    lastAgentAt: iso(row.lastAgentAt),
    requestNote: text(row.requestNote),
    frameCount: slot && slot.count > storedCount ? slot.count : storedCount,
    qualityMode: quality.qualityMode,
    maxFps: quality.maxFps,
    maxEdge: quality.maxEdge,
    jpegQuality: quality.jpegQuality,
    relay: relayOf(slot, now),
    ...controlView(row, now),
  };
}

export class ScreenShareService {
  async create(actor: EnrollmentActor, deviceId: string, input: ScreenSessionInput): Promise<{ session: Record<string, unknown>; created: boolean }> {
    const now = Date.now();
    const db = database.forOrganization(actor.organizationId);
    const device = await this.supportDevice(actor.organizationId, deviceId, actor.userId, now);
    await this.sweepDevice(actor.organizationId, deviceId, actor.userId, now);
    const open = await this.openSessions(actor.organizationId, deviceId);
    const own = open.find((row) => row.supportUserId === actor.userId);
    if (own) return { session: await this.present(actor.organizationId, own), created: false };
    if (open.length > 0) throw http(409, 'This device already has an open screen session', 'SCREEN_SESSION_ACTIVE');
    const identity = await selfIdentity(actor.organizationId, String(device.userId));
    const employeeId = identity.association.state === 'active' ? identity.association.employeeId : null;
    const quality = clampQuality(input);
    const created = await db.create('AgentScreenSession', {
      id: id('ss'),
      deviceId,
      userId: device.userId,
      ...(employeeId ? { employeeId } : {}),
      supportUserId: actor.userId,
      state: 'requested',
      requestedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + REQUEST_TTL_MS).toISOString(),
      ...(input.requestNote ? { requestNote: input.requestNote } : {}),
      frameCount: 0,
      qualityMode: quality.qualityMode,
      maxFps: quality.maxFps,
      maxEdge: quality.maxEdge,
      jpegQuality: quality.jpegQuality,
      controlState: 'off',
      permittedCapabilities: ['screen-share'],
      createdBy: actor.userId,
      updatedBy: actor.userId,
    });
    await auditSession(actor.organizationId, actor.userId, 'screen.session_requested', created, now);
    return { session: await this.present(actor.organizationId, created), created: true };
  }

  async employeeCurrent(actor: EnrollmentActor, deviceId: string, secret: string): Promise<Record<string, unknown> | null> {
    const now = Date.now();
    await this.employeeDevice(actor, deviceId, secret, now);
    await this.sweepDevice(actor.organizationId, deviceId, actor.userId, now);
    const visible = await this.visibleSession(actor.organizationId, deviceId, now);
    if (!visible) return null;
    if (visible.state === 'requested' || visible.state === 'active') {
      const touched = await database.forOrganization(actor.organizationId).update('AgentScreenSession', visible.id, {
        lastAgentAt: new Date(now).toISOString(),
        updatedBy: actor.userId,
      });
      return this.present(actor.organizationId, touched || visible);
    }
    return this.present(actor.organizationId, visible);
  }

  async accept(actor: EnrollmentActor, deviceId: string, sessionId: string, secret: string): Promise<Record<string, unknown>> {
    const now = Date.now();
    await this.employeeDevice(actor, deviceId, secret, now);
    const row = await this.ownedSession(actor.organizationId, deviceId, sessionId, now);
    if (row.state === 'ended') throw http(409, 'Screen session has ended', 'SCREEN_SESSION_ENDED');
    if (row.state === 'active') {
      const touched = await database.forOrganization(actor.organizationId).update('AgentScreenSession', row.id, {
        lastAgentAt: new Date(now).toISOString(),
        updatedBy: actor.userId,
      });
      return this.present(actor.organizationId, touched || row);
    }
    const updated = await database.forOrganization(actor.organizationId).update('AgentScreenSession', row.id, {
      state: 'active',
      startedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ACTIVE_TTL_MS).toISOString(),
      lastAgentAt: new Date(now).toISOString(),
      permittedCapabilities: ['screen-share'],
      updatedBy: actor.userId,
    });
    const started = updated || row;
    await auditSession(actor.organizationId, actor.userId, 'screen.session_started', started, now);
    return this.present(actor.organizationId, started);
  }

  async employeeEnd(actor: EnrollmentActor, deviceId: string, sessionId: string, secret: string, reason: string): Promise<Record<string, unknown>> {
    const now = Date.now();
    await this.employeeDevice(actor, deviceId, secret, now);
    const row = await this.ownedSession(actor.organizationId, deviceId, sessionId, now);
    if (!endReasons.has(reason) || reason === 'support_end' || reason === 'timeout') {
      throw http(400, 'Screen session end reason is invalid', 'VALIDATION_ERROR');
    }
    const ended = row.state === 'ended' ? row : await this.finish(actor.organizationId, row, reason, actor.userId, now);
    return this.present(actor.organizationId, ended);
  }

  async uploadFrame(actor: EnrollmentActor, deviceId: string, sessionId: string, secret: string, bytes: Buffer): Promise<Record<string, unknown>> {
    const now = Date.now();
    await this.employeeDevice(actor, deviceId, secret, now);
    if (!Buffer.isBuffer(bytes) || bytes.length < 4 || bytes.length > MAX_FRAME_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      throw http(400, 'Screen frame is not a JPEG', 'SCREEN_FRAME_INVALID');
    }
    const row = await this.ownedSession(actor.organizationId, deviceId, sessionId, now);
    if (row.state === 'ended') throw http(409, 'Screen session has ended', 'SCREEN_SESSION_ENDED');
    if (row.state !== 'active') throw http(409, 'Screen session is not active', 'SCREEN_NOT_ACTIVE');
    const slot = rememberFrame(String(row.id), bytes, now, typeof row.frameCount === 'number' ? row.frameCount : 0);
    if (now - slot.persistedAt >= PERSIST_INTERVAL_MS) {
      await database.forOrganization(actor.organizationId).update('AgentScreenSession', row.id, {
        frameCount: slot.count,
        lastAgentAt: new Date(now).toISOString(),
        updatedBy: actor.userId,
      });
      slot.persistedAt = now;
    }
    const relay = relayOf(slot, now);
    return {
      accepted: true,
      frameCount: slot.count,
      receivedAt: new Date(now).toISOString(),
      bytes: bytes.length,
      retainedFrames: 1,
      actualFps: relay.actualFps,
    };
  }

  async setQuality(actor: EnrollmentActor, sessionId: string, input: ScreenSessionInput): Promise<Record<string, unknown>> {
    const now = Date.now();
    const row = await this.supportSession(actor, sessionId, now);
    if (row.state === 'ended') throw http(409, 'Screen session has ended', 'SCREEN_SESSION_ENDED');
    const quality = clampQuality(input);
    const updated = await database.forOrganization(actor.organizationId).update('AgentScreenSession', row.id, {
      qualityMode: quality.qualityMode,
      maxFps: quality.maxFps,
      maxEdge: quality.maxEdge,
      jpegQuality: quality.jpegQuality,
      updatedBy: actor.userId,
    });
    return this.present(actor.organizationId, updated || row);
  }

  async supportGet(actor: EnrollmentActor, sessionId: string): Promise<Record<string, unknown>> {
    const now = Date.now();
    const row = await this.supportSession(actor, sessionId, now);
    return this.present(actor.organizationId, row);
  }

  async supportEnd(actor: EnrollmentActor, sessionId: string): Promise<Record<string, unknown>> {
    const now = Date.now();
    const row = await this.supportSession(actor, sessionId, now);
    const ended = row.state === 'ended' ? row : await this.finish(actor.organizationId, row, 'support_end', actor.userId, now);
    return this.present(actor.organizationId, ended);
  }

  async supportFrame(actor: EnrollmentActor, sessionId: string, now = Date.now()): Promise<{ status: 200 | 204 | 409; bytes?: Buffer }> {
    const row = await this.supportSession(actor, sessionId, now);
    if (row.state === 'ended') return { status: 409 };
    if (row.state !== 'active') return { status: 204 };
    const slot = frames.get(row.id);
    if (!slot || now - slot.at > FRAME_TTL_MS) {
      clearFrame(row.id);
      return { status: 204 };
    }
    return { status: 200, bytes: slot.bytes };
  }

  private async employeeDevice(actor: EnrollmentActor, deviceId: string, secret: string, now: number): Promise<AppRecord> {
    try {
      return await enrollment.assertScreenDevice(actor, deviceId, secret);
    } catch (error) {
      if (error instanceof HttpError && (error.code === 'DEVICE_REVOKED' || error.code === 'DEVICE_DISABLED' || error.code === 'SCREEN_CAPABILITY')) {
        await this.closeOpen(actor.organizationId, deviceId, 'agent_lost', actor.userId, now);
      }
      throw error;
    }
  }

  private async supportDevice(organizationId: string, deviceId: string, actorId: string, now: number): Promise<AppRecord> {
    const row = await database.forOrganization(organizationId).get('AgentEnrollment', deviceId);
    if (!row) throw new HttpError(404, 'Device not found');
    if (row.status === 'revoked' || row.status === 'disabled' || !hasScreenCapability(row)) {
      await this.closeOpen(organizationId, deviceId, 'agent_lost', actorId, now);
    }
    if (row.status === 'revoked') throw http(403, 'Device enrollment was revoked', 'DEVICE_REVOKED');
    if (row.status !== 'active') throw http(403, 'Device is disabled', 'DEVICE_DISABLED');
    if (!hasScreenCapability(row)) throw http(403, 'Device is not allowed to share its screen', 'SCREEN_CAPABILITY');
    return row;
  }

  private async supportSession(actor: EnrollmentActor, sessionId: string, now: number): Promise<AppRecord> {
    const db = database.forOrganization(actor.organizationId);
    const existing = await db.get('AgentScreenSession', sessionId);
    if (!existing) throw notFound();
    if (existing.supportUserId !== actor.userId) throw http(403, 'Screen session belongs to another support user', 'SCREEN_VIEW_FORBIDDEN');
    const deviceId = String(existing.deviceId);
    const device = await db.get('AgentEnrollment', deviceId);
    if (device && (device.status === 'revoked' || device.status === 'disabled' || !hasScreenCapability(device))) {
      await this.closeOpen(actor.organizationId, deviceId, 'agent_lost', actor.userId, now);
      const closed = await db.get('AgentScreenSession', sessionId);
      return closed || existing;
    }
    return this.sweepOne(actor.organizationId, existing, actor.userId, now);
  }

  private async ownedSession(organizationId: string, deviceId: string, sessionId: string, now: number): Promise<AppRecord> {
    const row = await database.forOrganization(organizationId).get('AgentScreenSession', sessionId);
    if (!row || row.deviceId !== deviceId) throw notFound();
    return this.sweepOne(organizationId, row, row.userId as string, now);
  }

  private async openSessions(organizationId: string, deviceId: string): Promise<AppRecord[]> {
    const rows = await database.forOrganization(organizationId).list('AgentScreenSession', { deviceId });
    return rows.filter((row) => row.state === 'requested' || row.state === 'active');
  }

  private async visibleSession(organizationId: string, deviceId: string, now: number): Promise<AppRecord | undefined> {
    const rows = await database.forOrganization(organizationId).list('AgentScreenSession', { deviceId });
    const visible = rows.filter((row) => {
      if (row.state === 'requested' || row.state === 'active') return true;
      const ended = instant(row.endedAt);
      return ended !== null && now - ended < REQUEST_TTL_MS;
    });
    visible.sort((left, right) => (instant(right.requestedAt) ?? 0) - (instant(left.requestedAt) ?? 0));
    return visible[0];
  }

  private async sweepDevice(organizationId: string, deviceId: string, actorId: string, now: number): Promise<void> {
    const rows = await database.forOrganization(organizationId).list('AgentScreenSession', { deviceId });
    for (const row of rows) {
      if (row.state === 'requested' || row.state === 'active') await this.sweepOne(organizationId, row, actorId, now);
    }
  }

  private async sweepOne(organizationId: string, row: AppRecord, actorId: string, now: number): Promise<AppRecord> {
    if (row.state === 'ended') {
      clearFrame(row.id);
      return row;
    }
    const expires = instant(row.expiresAt);
    if (expires !== null && now > expires) return this.finish(organizationId, row, 'timeout', actorId, now);
    if (row.state === 'active') {
      const seen = instant(row.lastAgentAt);
      if (seen === null || now - seen > AGENT_SILENCE_MS) return this.finish(organizationId, row, 'agent_lost', actorId, now);
    }
    return this.expireControl(organizationId, row, actorId, now);
  }

  private async closeOpen(organizationId: string, deviceId: string, reason: string, actorId: string, now: number): Promise<void> {
    const open = await this.openSessions(organizationId, deviceId);
    for (const row of open) await this.finish(organizationId, row, reason, actorId, now);
  }

  private async finish(organizationId: string, row: AppRecord, reason: string, actorId: string, now: number): Promise<AppRecord> {
    clearFrame(row.id);
    if (row.state === 'ended') return row;
    const controlOpen = row.controlState === 'requested' || row.controlState === 'granted';
    const permittedBefore = recordedCapabilities(row, now);
    const updated = await database.forOrganization(organizationId).update('AgentScreenSession', row.id, {
      state: 'ended',
      endedAt: new Date(now).toISOString(),
      endReason: reason,
      ...(controlOpen ? {
        controlState: 'revoked',
        controlEndedAt: new Date(now).toISOString(),
        controlEndReason: 'session_ended',
        permittedCapabilities: [],
      } : {}),
      updatedBy: actorId,
    });
    const next = updated || row;
    await auditSession(organizationId, actorId, 'screen.session_ended', next, now, reason, permittedBefore);
    if (controlOpen) await auditSession(organizationId, actorId, 'screen.control_ended', next, now, 'session_ended', permittedBefore);
    return next;
  }

  private async expireControl(organizationId: string, row: AppRecord, actorId: string, now: number): Promise<AppRecord> {
    if (controlStateOf(row, now) !== 'expired' || row.controlState !== 'granted') return row;
    return this.closeControl(organizationId, row, 'expired', 'screen.control_expired', actorId, now);
  }

  private async closeControl(organizationId: string, row: AppRecord, reason: 'employee_revoke' | 'support_revoke' | 'denied' | 'expired' | 'session_ended' | 'capability_lost', action: string, actorId: string, now: number): Promise<AppRecord> {
    const open = row.controlState === 'requested' || row.controlState === 'granted';
    if (!open) return row;
    const permittedBefore = recordedCapabilities(row, now);
    const controlState = reason === 'denied' ? 'denied' : reason === 'expired' ? 'expired' : 'revoked';
    const updated = await database.forOrganization(organizationId).update('AgentScreenSession', row.id, {
      controlState,
      controlEndedAt: new Date(now).toISOString(),
      controlEndReason: reason,
      permittedCapabilities: row.state === 'active' || row.state === 'requested' ? ['screen-share'] : [],
      updatedBy: actorId,
    });
    const next = updated || row;
    await auditSession(organizationId, actorId, action, next, now, reason, permittedBefore);
    return next;
  }

  private async requireControlDevice(organizationId: string, row: AppRecord, actorId: string, now: number): Promise<AppRecord> {
    const device = await database.forOrganization(organizationId).get('AgentEnrollment', String(row.deviceId));
    if (!device || device.status === 'revoked' || device.status === 'disabled' || !hasScreenCapability(device)) return row;
    if (hasRemoteControl(device)) return row;
    await this.closeControl(organizationId, row, 'capability_lost', 'screen.control_revoked', actorId, now);
    throw http(403, 'Device is not allowed to accept remote control', 'REMOTE_CONTROL_CAPABILITY');
  }

  async supportControl(actor: EnrollmentActor, sessionId: string, action: 'request' | 'revoke'): Promise<Record<string, unknown>> {
    const now = Date.now();
    const existing = await this.supportSession(actor, sessionId, now);
    if (existing.state === 'ended') throw http(409, 'Screen session has ended', 'SCREEN_SESSION_ENDED');
    if (existing.state !== 'active') throw http(409, 'Screen session is not active', 'SCREEN_NOT_ACTIVE');
    const row = await this.requireControlDevice(actor.organizationId, existing, actor.userId, now);
    if (action === 'revoke') {
      const state = controlStateOf(row, now);
      if (state !== 'requested' && state !== 'granted') throw http(403, 'Remote control is not granted', 'REMOTE_CONTROL_REQUIRED');
      const closed = await this.closeControl(actor.organizationId, row, 'support_revoke', 'screen.control_revoked', actor.userId, now);
      return this.present(actor.organizationId, closed);
    }
    const state = controlStateOf(row, now);
    if (state === 'requested') return this.present(actor.organizationId, row);
    if (state === 'granted') throw http(409, 'Remote control is already granted', 'REMOTE_CONTROL_GRANTED');
    const updated = await database.forOrganization(actor.organizationId).update('AgentScreenSession', row.id, {
      controlState: 'requested',
      controlGrantId: id('cg'),
      controlRequestedAt: new Date(now).toISOString(),
      permittedCapabilities: ['screen-share'],
      updatedBy: actor.userId,
    });
    const next = updated || row;
    await auditSession(actor.organizationId, actor.userId, 'screen.control_requested', next, now);
    return this.present(actor.organizationId, next);
  }

  async employeeControl(actor: EnrollmentActor, deviceId: string, sessionId: string, secret: string, action: 'grant' | 'deny' | 'revoke', grantId: string): Promise<Record<string, unknown>> {
    const now = Date.now();
    await this.employeeDevice(actor, deviceId, secret, now);
    const existing = await this.ownedSession(actor.organizationId, deviceId, sessionId, now);
    if (existing.state === 'ended') throw http(409, 'Screen session has ended', 'SCREEN_SESSION_ENDED');
    if (existing.state !== 'active') throw http(409, 'Screen session is not active', 'SCREEN_NOT_ACTIVE');
    const row = await this.requireControlDevice(actor.organizationId, existing, actor.userId, now);
    if (grantId !== row.controlGrantId) throw http(409, 'Remote control grant is no longer valid', 'REMOTE_GRANT_INVALID');
    const state = controlStateOf(row, now);
    if (action === 'grant') {
      if (state !== 'requested') throw this.controlClosed(state);
      const sessionExpires = instant(row.expiresAt);
      const controlExpires = Math.min(now + CONTROL_TTL_MS, sessionExpires ?? now);
      if (controlExpires <= now) throw http(409, 'Remote control grant has expired', 'REMOTE_CONTROL_EXPIRED');
      const updated = await database.forOrganization(actor.organizationId).update('AgentScreenSession', row.id, {
        controlState: 'granted',
        controlGrantedAt: new Date(now).toISOString(),
        controlExpiresAt: new Date(controlExpires).toISOString(),
        permittedCapabilities: ['screen-share', 'remote-control'],
        updatedBy: actor.userId,
      });
      const next = updated || row;
      await auditSession(actor.organizationId, actor.userId, 'screen.control_granted', next, now);
      return this.present(actor.organizationId, next);
    }
    if (state !== 'requested' && state !== 'granted') throw this.controlClosed(state);
    if (action === 'deny' && state === 'granted') throw http(409, 'Remote control is already granted', 'REMOTE_CONTROL_GRANTED');
    if (action === 'deny' && state !== 'requested') throw this.controlClosed(state);
    const reason = action === 'deny' ? 'denied' : 'employee_revoke';
    const auditAction = action === 'deny' ? 'screen.control_denied' : 'screen.control_revoked';
    const closed = await this.closeControl(actor.organizationId, row, reason, auditAction, actor.userId, now);
    return this.present(actor.organizationId, closed);
  }

  async rejectInput(actor: EnrollmentActor, sessionId: string, grantId: string): Promise<never> {
    const now = Date.now();
    const existing = await this.supportSession(actor, sessionId, now);
    if (existing.state === 'ended') throw http(409, 'Screen session has ended', 'SCREEN_SESSION_ENDED');
    if (existing.state !== 'active') throw http(409, 'Screen session is not active', 'SCREEN_NOT_ACTIVE');
    const row = await this.requireControlDevice(actor.organizationId, existing, actor.userId, now);
    if (grantId !== row.controlGrantId) throw http(409, 'Remote control grant is no longer valid', 'REMOTE_GRANT_INVALID');
    const state = controlStateOf(row, now);
    if (state !== 'granted') throw this.controlClosed(state);
    await auditSession(actor.organizationId, actor.userId, 'screen.control_input_rejected', row, now, 'input_plane_unavailable');
    throw http(409, 'Remote input is not available on this agent', 'REMOTE_INPUT_UNAVAILABLE');
  }

  async managerVisibility(actor: EnrollmentActor, deviceId: string): Promise<{ access: 'own' | 'other' | 'none'; session: Record<string, unknown> | null }> {
    const now = Date.now();
    const device = await database.forOrganization(actor.organizationId).get('AgentEnrollment', deviceId);
    if (!device) throw new HttpError(404, 'Device not found');
    if (device.status === 'revoked' || device.status === 'disabled' || !hasScreenCapability(device)) {
      await this.closeOpen(actor.organizationId, deviceId, 'agent_lost', actor.userId, now);
      return { access: 'none', session: null };
    }
    await this.sweepDevice(actor.organizationId, deviceId, actor.userId, now);
    const open = await this.openSessions(actor.organizationId, deviceId);
    const own = open.find((row) => row.supportUserId === actor.userId);
    if (own) return { access: 'own', session: await this.present(actor.organizationId, own) };
    if (open.length > 0) return { access: 'other', session: null };
    return { access: 'none', session: null };
  }

  private controlClosed(state: string): HttpError {
    if (state === 'expired') return http(409, 'Remote control grant has expired', 'REMOTE_CONTROL_EXPIRED');
    if (state === 'revoked' || state === 'denied') return http(409, 'Remote control grant has been revoked', 'REMOTE_CONTROL_REVOKED');
    return http(403, 'Remote control is not granted', 'REMOTE_CONTROL_REQUIRED');
  }

  private async present(organizationId: string, row: AppRecord): Promise<Record<string, unknown>> {
    const support = await database.forOrganization(organizationId).get('User', String(row.supportUserId || ''));
    const name = support && typeof support.name === 'string' ? support.name : null;
    return publicSession(row, name);
  }
}
