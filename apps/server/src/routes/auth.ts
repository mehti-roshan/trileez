import { Router } from 'express';
import type { Request, Response } from 'express';
import { database } from '../db/database.js';
import { validateRequest } from '../middleware/validate.js';
import { loginSchema, passwordChangeSchema, passwordResetConfirmSchema, passwordResetRequestSchema } from '../config/requestValidation.js';
import { requireAuth } from '../middleware/auth.js';
import { assertPasswordPolicy, comparePassword, hashPassword } from '../utils/password.js';
import { permissionsFor } from '../config/permissions.js';
import type { UserRecord } from '../types/entities.js';
import { isUserRecord } from '../types/entities.js';
import { env } from '../config/env.js';
import { clearRateLimit, consumeRateLimit, inspectRateLimit } from '../security/authRateLimit.js';
import {
  consumePasswordResetToken, createPasswordResetToken, issueSession, markPasswordResetUsed, revokeAllSessions,
  revokeSession, rotateRefreshToken, writeAuthAudit,
} from '../services/auth.js';
import { logSecurityEvent, securityPrincipal } from '../observability/security.js';
import { linkedEmployee, associationOf } from '../services/employeeIdentity.js';

const router = Router();
const refreshCookieName = 'trivix_refresh';
const dummyPasswordHash = hashPassword('Timing#Equalizer9472!');

const publicUser = (user: UserRecord) => {
  const {
    passwordHash: _passwordHash, failedLoginAttempts: _failedLoginAttempts, lastFailedLoginAt: _lastFailedLoginAt,
    lockoutUntil: _lockoutUntil, ...safe
  } = user;
  return { ...safe, permissions: permissionsFor(user) };
};

function clientIp(req: Request): string { return req.ip || req.socket.remoteAddress || 'unknown'; }
function sessionMetadata(req: Request): { ip: string; userAgent?: string } {
  const userAgent = req.get('user-agent');
  return { ip: clientIp(req), ...(userAgent ? { userAgent } : {}) };
}
function cookieValue(req: Request, name: string): string | undefined {
  const cookie = req.get('cookie');
  if (!cookie) return undefined;
  for (const part of cookie.split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === name) return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return undefined;
}
function setRefreshCookie(res: Response, token: string): void {
  res.cookie(refreshCookieName, token, {
    httpOnly: true, sameSite: 'strict', secure: env.nodeEnv === 'production', path: '/api/auth',
    maxAge: env.refreshTokenDays * 86_400_000,
  });
}
function clearRefreshCookie(res: Response): void {
  res.clearCookie(refreshCookieName, { httpOnly: true, sameSite: 'strict', secure: env.nodeEnv === 'production', path: '/api/auth' });
}
function rateLimited(res: Response, retryAfterSeconds: number, event = 'auth.rate_limited', fields: Record<string, unknown> = {}): Response {
  logSecurityEvent(event, { retryAfterSeconds, ...fields });
  res.set('retry-after', String(retryAfterSeconds));
  return res.status(429).json({ error: 'Too many attempts. Try again later.', code: 'RATE_LIMITED', retryAfterSeconds });
}

router.post('/login', validateRequest({ body: loginSchema }), async (req, res, next) => {
  try {
    const ip = clientIp(req);
    const email = String(req.body.email).toLowerCase();
    const loginKey = `login:${email}:${ip}`;
    const ipKey = `login-ip:${ip}`;
    const precheck = inspectRateLimit(loginKey, env.loginMaxFailures);
    const ipPrecheck = inspectRateLimit(ipKey, env.loginMaxFailures * 10);
    const principal = securityPrincipal(email);
    if (!precheck.allowed || !ipPrecheck.allowed) return rateLimited(res, Math.max(precheck.retryAfterSeconds, ipPrecheck.retryAfterSeconds), 'auth.login_rate_limited', { principal });

    const user = await database.findUserForAuthentication({ email, includePassword: true });
    const lockoutUntil = user?.lockoutUntil ? Date.parse(String(user.lockoutUntil)) : 0;
    if (user && lockoutUntil > Date.now()) return rateLimited(res, Math.ceil((lockoutUntil - Date.now()) / 1000), 'auth.account_lockout_enforced', { principal, actorId: user.id, organizationId: user.organizationId });
    const candidateHash = typeof user?.passwordHash === 'string' ? user.passwordHash : await dummyPasswordHash;
    const passwordMatches = await comparePassword(req.body.password, candidateHash);
    if (!isUserRecord(user) || !passwordMatches) {
      const rate = consumeRateLimit(loginKey, env.loginMaxFailures, env.loginWindowMinutes * 60_000);
      const ipRate = consumeRateLimit(ipKey, env.loginMaxFailures * 10, env.loginWindowMinutes * 60_000);
      if (user) {
        const failures = (lockoutUntil > 0 && lockoutUntil <= Date.now() ? 0 : Number(user.failedLoginAttempts || 0)) + 1;
        const locked = failures >= env.loginMaxFailures;
        await database.forOrganization(user.organizationId).update('User', user.id, {
          failedLoginAttempts: failures, lastFailedLoginAt: new Date().toISOString(),
          ...(locked ? { lockoutUntil: new Date(Date.now() + env.accountLockMinutes * 60_000).toISOString() } : {}),
        });
        await writeAuthAudit(user, locked ? 'auth.account_locked' : 'auth.login_failed', { failures }, ip);
        if (locked) return rateLimited(res, env.accountLockMinutes * 60, 'auth.account_locked', { principal, actorId: user.id, organizationId: user.organizationId });
      } else logSecurityEvent('auth.login_failed_unknown_principal', { principal });
      if (!rate.allowed || !ipRate.allowed) return rateLimited(res, Math.max(rate.retryAfterSeconds, ipRate.retryAfterSeconds), 'auth.login_rate_limited', { principal });
      return res.status(401).json({ error: 'ایمیل یا رمز عبور صحیح نیست.' });
    }
    if (!user.isActive) {
      logSecurityEvent('auth.inactive_user_login', { principal, actorId: user.id, organizationId: user.organizationId });
      return res.status(401).json({ error: 'ایمیل یا رمز عبور صحیح نیست.' });
    }
    clearRateLimit(loginKey);
    const updated = await database.forOrganization(user.organizationId).update<UserRecord>('User', user.id, {
      lastLoginAt: new Date().toISOString(), status: 'online', failedLoginAttempts: 0, lockoutUntil: undefined,
    });
    const current = updated || user;
    const issued = await issueSession(current, sessionMetadata(req));
    setRefreshCookie(res, issued.refreshToken);
    await writeAuthAudit(current, 'auth.login_succeeded', { sessionId: issued.session.id }, ip);
    res.json({ token: issued.token, user: publicUser(current), refreshExpiresAt: issued.refreshExpiresAt });
  } catch (error) { next(error); }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken = cookieValue(req, refreshCookieName);
    if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });
    const { user, issued } = await rotateRefreshToken(refreshToken, sessionMetadata(req));
    setRefreshCookie(res, issued.refreshToken);
    res.json({ token: issued.token, user: publicUser(user), refreshExpiresAt: issued.refreshExpiresAt });
  } catch (error) { logSecurityEvent('auth.refresh_failed'); clearRefreshCookie(res); next(error); }
});

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await revokeSession(req.user!.organizationId, req.authSession!.id, 'logout', req.user!.id, clientIp(req));
    clearRefreshCookie(res);
    res.status(204).send();
  } catch (error) { next(error); }
});

router.post('/logout-all', requireAuth, async (req, res, next) => {
  try {
    await revokeAllSessions(req.user!.organizationId, req.user!.id, 'logout_all', req.user!.id, clientIp(req));
    clearRefreshCookie(res);
    res.status(204).send();
  } catch (error) { next(error); }
});

router.post('/change-password', requireAuth, validateRequest({ body: passwordChangeSchema }), async (req, res, next) => {
  try {
    const user = await database.findUserForAuthentication({ id: req.user!.id, includePassword: true });
    if (!user || typeof user.passwordHash !== 'string' || !await comparePassword(req.body.currentPassword, user.passwordHash)) {
      logSecurityEvent('auth.password_change_current_password_failed', { actorId: req.user!.id, organizationId: req.user!.organizationId });
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    if (await comparePassword(req.body.newPassword, user.passwordHash)) return res.status(400).json({ error: 'New password must be different from the current password' });
    assertPasswordPolicy(req.body.newPassword, user, 'body.newPassword');
    const updated = await database.forOrganization(user.organizationId).update<UserRecord>('User', user.id, {
      passwordHash: await hashPassword(req.body.newPassword), mustChangePassword: false, passwordChangedAt: new Date().toISOString(),
      failedLoginAttempts: 0, lockoutUntil: undefined,
    });
    await revokeAllSessions(user.organizationId, user.id, 'password_changed', user.id, clientIp(req));
    const issued = await issueSession(updated || user, sessionMetadata(req));
    setRefreshCookie(res, issued.refreshToken);
    await writeAuthAudit(user, 'auth.password_changed', {}, clientIp(req));
    res.json({ token: issued.token, user: publicUser(updated || user), refreshExpiresAt: issued.refreshExpiresAt });
  } catch (error) { next(error); }
});

router.post('/password-reset/request', validateRequest({ body: passwordResetRequestSchema }), async (req, res, next) => {
  try {
    const ip = clientIp(req);
    const email = String(req.body.email).toLowerCase();
    const rate = consumeRateLimit(`password-reset:${email}:${ip}`, env.passwordResetMaxRequests, env.passwordResetWindowMinutes * 60_000);
    const principal = securityPrincipal(email);
    if (!rate.allowed) return rateLimited(res, rate.retryAfterSeconds, 'auth.password_reset_rate_limited', { principal });
    const user = await database.findUserForAuthentication({ email });
    let resetToken: string | undefined;
    if (user?.isActive) resetToken = await createPasswordResetToken(user, ip);
    else logSecurityEvent('auth.password_reset_unknown_principal', { principal }, 'info');
    res.status(202).json({ accepted: true, ...(env.nodeEnv === 'test' && resetToken ? { resetToken } : {}) });
  } catch (error) { logSecurityEvent('auth.password_reset_request_failed'); next(error); }
});

router.post('/password-reset/confirm', validateRequest({ body: passwordResetConfirmSchema }), async (req, res, next) => {
  try {
    const { user, record } = await consumePasswordResetToken(req.body.token);
    assertPasswordPolicy(req.body.newPassword, user, 'body.newPassword');
    if (typeof user.passwordHash === 'string' && await comparePassword(req.body.newPassword, user.passwordHash)) {
      return res.status(400).json({ error: 'New password must be different from the current password' });
    }
    await database.forOrganization(user.organizationId).update('User', user.id, {
      passwordHash: await hashPassword(req.body.newPassword), mustChangePassword: false, passwordChangedAt: new Date().toISOString(),
      failedLoginAttempts: 0, lockoutUntil: undefined,
    });
    await markPasswordResetUsed(record, clientIp(req));
    await revokeAllSessions(user.organizationId, user.id, 'password_reset', user.id, clientIp(req));
    clearRefreshCookie(res);
    res.json({ success: true });
  } catch (error) { logSecurityEvent('auth.password_reset_confirmation_failed'); next(error); }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const employee = await linkedEmployee(req.user!.organizationId, req.user!.id);
    const association = associationOf(employee);
    res.json({ user: { ...publicUser(req.user!), employeeId: association.employeeId }, employee: association });
  } catch (error) { next(error); }
});
export default router;
