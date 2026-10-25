import { verifyUserToken } from '../utils/jwt.js';
import { database } from '../db/database.js';
import { hasPermission } from '../config/permissions.js';
import { canAccessResource, isLegacyResourceName } from '../config/resourceAccess.js';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AccessAction, ResourceAccessName } from '../config/resourceAccess.js';
import type { Permission, Role, UserRecord } from '../types/entities.js';
import { isUserRecord } from '../types/entities.js';
import { activeSession } from '../services/auth.js';
import { attachRequestActor } from './requestContext.js';
import { logSecurityEvent } from '../observability/security.js';

const forcedPasswordChangePaths = new Set([
  '/api/auth/me', '/api/auth/change-password', '/api/auth/logout', '/api/auth/logout-all',
]);

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    logSecurityEvent('auth.missing_token', { method: req.method, path: req.path });
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = verifyUserToken(token);
    const user = await database.findUserForAuthentication({ id: payload.sub });
    if (!isUserRecord(user) || !user.isActive) {
      logSecurityEvent('auth.user_inactive_or_missing', { subject: payload.sub });
      return res.status(401).json({ error: 'User is inactive or missing' });
    }
    const session = await activeSession(user.organizationId, payload.sid, user.id);
    if (!session) {
      logSecurityEvent('auth.session_rejected', { actorId: user.id, organizationId: user.organizationId, sessionId: payload.sid });
      return res.status(401).json({ error: 'Session is revoked or expired', code: 'SESSION_REVOKED' });
    }
    req.user = user;
    req.authSession = session;
    attachRequestActor(user.id, user.organizationId);
    if (user.mustChangePassword && !forcedPasswordChangePaths.has(req.originalUrl.split('?')[0]!)) {
      logSecurityEvent('auth.password_change_required', { actorId: user.id, organizationId: user.organizationId }, 'info');
      return res.status(403).json({ error: 'Password change required', code: 'PASSWORD_CHANGE_REQUIRED' });
    }
    next();
  } catch {
    logSecurityEvent('auth.invalid_token', { method: req.method, path: req.path });
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requirePermission(permission: Permission): RequestHandler {
  return (req, res, next) => {
    if (req.user && hasPermission(req.user, permission)) return next();
    logSecurityEvent('authorization.permission_denied', { permission, actorId: req.user?.id, organizationId: req.user?.organizationId });
    return res.status(403).json({ error: 'Insufficient permission', permission });
  };
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, res, next) => {
    if (req.user && roles.includes(req.user.role)) return next();
    logSecurityEvent('authorization.role_denied', { requiredRoles: roles, actorId: req.user?.id, organizationId: req.user?.organizationId });
    return res.status(403).json({ error: 'Insufficient role' });
  };
}

export function requireResourceAccess(resource: ResourceAccessName, action: AccessAction): RequestHandler {
  return (req, res, next) => {
    if (req.user && canAccessResource(req.user, resource, action)) return next();
    logSecurityEvent('authorization.resource_denied', { resource, action, actorId: req.user?.id, organizationId: req.user?.organizationId });
    return res.status(403).json({ error: 'Insufficient resource access', resource, action });
  };
}

export function requireLegacyResourceAccess(action: AccessAction): RequestHandler {
  return (req, res, next) => {
    const resource = req.params.resource;
    if (typeof resource !== 'string' || !isLegacyResourceName(resource)) {
      return res.status(404).json({ error: 'Unknown resource' });
    }
    if (req.user && canAccessResource(req.user, resource, action)) return next();
    logSecurityEvent('authorization.resource_denied', { resource, action, actorId: req.user?.id, organizationId: req.user?.organizationId });
    return res.status(403).json({ error: 'Insufficient resource access', resource, action });
  };
}
