import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { database } from '../db/database.js';
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';
import { signUserToken } from '../utils/jwt.js';
import type { AppRecord, UserRecord } from '../types/entities.js';
import { auditService } from './audit.js';
import { logSecurityEvent } from '../observability/security.js';

export interface SessionMetadata { ip?: string; userAgent?: string }
export interface IssuedSession { token: string; refreshToken: string; refreshExpiresAt: string; session: AppRecord }

function tokenHash(token: string): string { return createHash('sha256').update(token, 'utf8').digest('hex'); }
function expiresInDays(days: number): string { return new Date(Date.now() + days * 86_400_000).toISOString(); }
function tokenParts(token: string): { id: string; validShape: boolean } {
  const separator = token.indexOf('.');
  return { id: separator > 0 ? token.slice(0, separator) : '', validShape: separator > 0 && token.length - separator > 20 };
}
function hashesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'hex'); const b = Buffer.from(right, 'hex');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

async function audit(organizationId: string, actorId: string, action: string, entityId: string, metadata: Record<string, unknown> = {}, ip?: string): Promise<void> {
  await auditService.record({ organizationId, actorId, action, entityType: 'User', entityId, metadata, ...(ip ? { ip } : {}) });
}

export async function issueSession(user: UserRecord, metadata: SessionMetadata = {}): Promise<IssuedSession> {
  const sessionId = `session-${randomUUID()}`;
  const refreshToken = `${sessionId}.${randomBytes(48).toString('base64url')}`;
  const refreshExpiresAt = expiresInDays(env.refreshTokenDays);
  const session = await database.forOrganization(user.organizationId).create('AuthSession', {
    id: sessionId, userId: user.id, refreshTokenHash: tokenHash(refreshToken), status: 'active', expiresAt: refreshExpiresAt,
    ...(metadata.ip ? { ip: metadata.ip } : {}), ...(metadata.userAgent ? { userAgent: metadata.userAgent.slice(0, 1000) } : {}),
  });
  return { token: signUserToken(user, session.id), refreshToken, refreshExpiresAt, session };
}

export async function activeSession(organizationId: string, sessionId: string, userId: string): Promise<AppRecord | undefined> {
  const session = await database.forOrganization(organizationId).get('AuthSession', sessionId);
  if (!session || session.userId !== userId || session.status !== 'active') return undefined;
  if (Date.parse(String(session.expiresAt)) <= Date.now()) return undefined;
  return session;
}

export async function revokeSession(organizationId: string, sessionId: string, reason: string, actorId?: string, ip?: string): Promise<boolean> {
  const db = database.forOrganization(organizationId);
  const session = await db.get('AuthSession', sessionId);
  if (!session || session.status !== 'active') return false;
  await db.update('AuthSession', sessionId, { status: 'revoked', revokedAt: new Date().toISOString(), revokedReason: reason });
  if (actorId) await audit(organizationId, actorId, 'auth.session_revoked', String(session.userId), { sessionId, reason }, ip);
  return true;
}

export async function revokeAllSessions(organizationId: string, userId: string, reason: string, actorId = userId, ip?: string): Promise<number> {
  const db = database.forOrganization(organizationId);
  const sessions = (await db.list('AuthSession', { userId })).filter((session) => session.status === 'active');
  await Promise.all(sessions.map((session) => db.update('AuthSession', session.id, {
    status: 'revoked', revokedAt: new Date().toISOString(), revokedReason: reason,
  })));
  if (sessions.length) await audit(organizationId, actorId, 'auth.sessions_revoked_all', userId, { count: sessions.length, reason }, ip);
  return sessions.length;
}

export async function rotateRefreshToken(refreshToken: string, metadata: SessionMetadata = {}): Promise<{ user: UserRecord; issued: IssuedSession }> {
  const parts = tokenParts(refreshToken);
  if (!parts.validShape) throw new HttpError(401, 'Invalid or expired refresh token');
  const session = await database.findAuthenticationRecord('AuthSession', parts.id);
  if (!session || session.status !== 'active' || Date.parse(String(session.expiresAt)) <= Date.now() || !hashesEqual(String(session.refreshTokenHash || ''), tokenHash(refreshToken))) {
    throw new HttpError(401, 'Invalid or expired refresh token');
  }
  const user = await database.findUserForAuthentication({ id: String(session.userId) });
  if (!user || !user.isActive || user.organizationId !== session.organizationId) {
    await revokeSession(String(session.organizationId), session.id, 'user_unavailable');
    throw new HttpError(401, 'Invalid or expired refresh token');
  }
  const issued = await issueSession(user, metadata);
  await database.forOrganization(user.organizationId).update('AuthSession', session.id, {
    status: 'revoked', revokedAt: new Date().toISOString(), revokedReason: 'rotated', replacedBySessionId: issued.session.id, lastUsedAt: new Date().toISOString(),
  });
  return { user, issued };
}

export async function createPasswordResetToken(user: UserRecord, requestedIp?: string): Promise<string> {
  const db = database.forOrganization(user.organizationId);
  const previous = (await db.list('PasswordResetToken', { userId: user.id })).filter((row) => !row.usedAt && !row.revokedAt);
  await Promise.all(previous.map((row) => db.update('PasswordResetToken', row.id, { revokedAt: new Date().toISOString() })));
  const id = `reset-${randomUUID()}`;
  const token = `${id}.${randomBytes(48).toString('base64url')}`;
  await db.create('PasswordResetToken', {
    id, userId: user.id, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + env.passwordResetMinutes * 60_000).toISOString(),
    ...(requestedIp ? { requestedIp } : {}),
  });
  await audit(user.organizationId, user.id, 'auth.password_reset_requested', user.id, {}, requestedIp);
  return token;
}

export async function consumePasswordResetToken(token: string): Promise<{ user: UserRecord; record: AppRecord }> {
  const parts = tokenParts(token);
  if (!parts.validShape) throw new HttpError(400, 'Password reset token is invalid or expired');
  const record = await database.findAuthenticationRecord('PasswordResetToken', parts.id);
  if (!record || record.usedAt || record.revokedAt || Date.parse(String(record.expiresAt)) <= Date.now() || !hashesEqual(String(record.tokenHash || ''), tokenHash(token))) {
    throw new HttpError(400, 'Password reset token is invalid or expired');
  }
  const user = await database.findUserForAuthentication({ id: String(record.userId), includePassword: true });
  if (!user || !user.isActive || user.organizationId !== record.organizationId) throw new HttpError(400, 'Password reset token is invalid or expired');
  return { user, record };
}

export async function markPasswordResetUsed(record: AppRecord, ip?: string): Promise<void> {
  await database.forOrganization(record.organizationId).update('PasswordResetToken', record.id, { usedAt: new Date().toISOString() });
  await audit(record.organizationId, String(record.userId), 'auth.password_reset_completed', String(record.userId), {}, ip);
}

export async function writeAuthAudit(user: Pick<UserRecord, 'id' | 'organizationId'>, action: string, metadata: Record<string, unknown> = {}, ip?: string, actorId = user.id): Promise<void> {
  await audit(user.organizationId, actorId, action, user.id, metadata, ip);
  logSecurityEvent(action, { actorId, subjectId: user.id, organizationId: user.organizationId, ...metadata }, action.includes('failed') || action.includes('locked') ? 'warn' : 'info');
}
