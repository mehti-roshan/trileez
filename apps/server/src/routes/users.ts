import { Router } from 'express';
import { database } from '../db/database.js';
import { requireAuth, requireResourceAccess } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamsSchema, userCreateSchema, userUpdateSchema } from '../config/requestValidation.js';
import { assertPasswordPolicy, generatePassword, hashPassword } from '../utils/password.js';
import type { UserRecord } from '../types/entities.js';
import { revokeAllSessions } from '../services/auth.js';
import { auditService } from '../services/audit.js';
import { userListConfig, userListQuerySchema } from '../config/listQueries.js';
import { pageQuery } from '../db/query.js';
import { relationshipIssue } from '../middleware/validate.js';
import { HttpError } from '../utils/httpError.js';

const router = Router();
const safe = ({
  passwordHash: _passwordHash, failedLoginAttempts: _failedLoginAttempts, lastFailedLoginAt: _lastFailedLoginAt,
  lockoutUntil: _lockoutUntil, ...user
}: UserRecord): Omit<UserRecord, 'passwordHash'> => user;

async function validateCustomerAccount(
  organizationId: string,
  input: { role?: unknown; customerId?: unknown },
  current?: UserRecord,
) {
  const role = String(input.role ?? current?.role ?? 'member');
  const customerId = String(input.customerId ?? current?.customerId ?? '');
  if (role !== 'customer') {
    if (customerId) throw relationshipIssue('body.customerId', 'Only customer users may be linked to a customer');
    return;
  }
  if (!customerId) throw relationshipIssue('body.customerId', 'Customer users must be linked to a customer');
  const db = database.forOrganization(organizationId);
  const customer = await db.get('Customer', customerId);
  if (!customer) throw relationshipIssue('body.customerId');
  if (customer.entityType === 'person') {
    const existing = (await db.list<UserRecord>('User', { customerId })).find((user) => user.id !== current?.id);
    if (existing) throw new HttpError(409, 'An individual customer can have only one user account');
  }
}

router.get('/', requireAuth, requireResourceAccess('users', 'read'), validateRequest({ query: userListQuerySchema }), async (req, res, next) => { try {
  const result = await database.forOrganization(req.user!.organizationId).page<UserRecord>('User', pageQuery(req.validatedQuery || {}, userListConfig, 'users'));
  res.json({ ...result, data: result.data.map(safe) });
} catch (error) { next(error); } });
router.post('/', requireAuth, requireResourceAccess('users', 'create'), validateRequest({ body: userCreateSchema }), async (req, res, next) => {
  try {
    const { password, ...input } = req.body;
    await validateCustomerAccount(req.user!.organizationId, input);
    assertPasswordPolicy(password, input);
    const user = await database.forOrganization(req.user!.organizationId).create<UserRecord>('User', {
      role: 'member', status: 'offline', isActive: true, title: 'همکار', ...input, passwordHash: await hashPassword(password),
      mustChangePassword: true, permissionOverrides: { additions: [], removals: [] },
    });
    await auditService.record({ organizationId: user.organizationId, actorId: req.user!.id, action: 'user.created_with_temporary_password', entityType: 'User', entityId: user.id, after: user, metadata: { deliveryMethod: 'admin_provided' } });
    res.status(201).json({ data: safe(user) });
  } catch (error) { next(error); }
});
router.patch('/:id', requireAuth, requireResourceAccess('users', 'update'), validateRequest({ params: idParamsSchema, body: userUpdateSchema }), async (req, res, next) => {
  try {
    const db = database.forOrganization(req.user!.organizationId);
    const current = await db.get<UserRecord>('User', req.params.id as string);
    if (!current) return res.status(404).json({ error: 'User not found' });
    const patch = { ...req.body };
    await validateCustomerAccount(req.user!.organizationId, patch, current);
    const adminSetPassword = typeof patch.password === 'string';
    if (adminSetPassword) {
      assertPasswordPolicy(patch.password, current);
      patch.passwordHash = await hashPassword(patch.password); patch.mustChangePassword = true; patch.passwordChangedAt = new Date().toISOString(); delete patch.password;
    }
    const user = await db.update<UserRecord>('User', req.params.id as string, patch);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (adminSetPassword || patch.isActive === false) {
      await revokeAllSessions(user.organizationId, user.id, adminSetPassword ? 'admin_password_changed' : 'account_deactivated', req.user!.id, req.ip);
    }
    const action = adminSetPassword ? 'user.password_set_by_admin' : current.role !== user.role ? 'user.role_changed' : 'user.updated';
    await auditService.record({ organizationId: user.organizationId, actorId: req.user!.id, action, entityType: 'User', entityId: user.id, before: current, after: user,
      metadata: adminSetPassword ? { mustChangePassword: true } : {} });
    res.json({ data: safe(user) });
  } catch (error) { next(error); }
});
router.post('/:id/password-reset', requireAuth, requireResourceAccess('users', 'update'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const generatedPassword = generatePassword();
    const db = database.forOrganization(req.user!.organizationId);
    const current = await db.get<UserRecord>('User', req.params.id as string);
    if (!current) return res.status(404).json({ error: 'User not found' });
    const user = await db.update<UserRecord>('User', req.params.id as string, {
      passwordHash: await hashPassword(generatedPassword), mustChangePassword: true, passwordChangedAt: new Date().toISOString(),
      failedLoginAttempts: 0, lockoutUntil: undefined,
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    await revokeAllSessions(user.organizationId, user.id, 'admin_password_reset', req.user!.id, req.ip);
    await auditService.record({ organizationId: user.organizationId, actorId: req.user!.id, action: 'user.password_reset', entityType: 'User', entityId: user.id,
      before: current, after: user, metadata: { deliveryMethod: 'one_time_admin_display' } });
    res.json({ data: { user: safe(user), generatedPassword, oneTime: true } });
  } catch (error) { next(error); }
});

export default router;
