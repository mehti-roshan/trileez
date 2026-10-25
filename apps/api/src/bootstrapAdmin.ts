import mongoose from 'mongoose';
import { initializeDatabase } from './db/database.js';
import { disconnectMongo } from './db/mongo.js';
import { models } from './models/index.js';
import { auditService } from './services/audit.js';
import { logger } from './observability/logger.js';
import { assertPasswordPolicy, hashPassword } from './utils/password.js';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function bootstrapAdmin(): Promise<void> {
  const email = required('BOOTSTRAP_ADMIN_EMAIL').toLowerCase();
  const password = required('BOOTSTRAP_ADMIN_PASSWORD');
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'System administrator';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('BOOTSTRAP_ADMIN_EMAIL must be a valid email address');
  assertPasswordPolicy(password, { email, name }, 'BOOTSTRAP_ADMIN_PASSWORD');

  const database = await initializeDatabase();
  if (database.mode !== 'mongo') throw new Error('Administrator bootstrap requires MongoDB; USE_MOCK_DB must be false');

  const existing = await models.User.findOne({ email }).lean();
  if (existing) {
    if (existing.role === 'admin' && existing.isActive) {
      logger.info('bootstrap_admin_already_exists', { organizationId: existing.organizationId, userId: String(existing._id) });
      return;
    }
    throw new Error('BOOTSTRAP_ADMIN_EMAIL is already assigned to another user');
  }

  const organizationId = new mongoose.Types.ObjectId().toString();

  const admin = await models.User.create({
    organizationId,
    name,
    email,
    role: 'admin',
    status: 'offline',
    isActive: true,
    title: 'System administrator',
    passwordHash: await hashPassword(password),
    mustChangePassword: true,
    passwordChangedAt: new Date(),
    permissionOverrides: { additions: [], removals: [] },
  });

  await auditService.record({
    organizationId,
    actorId: 'system',
    action: 'security.bootstrap-admin-created',
    entityType: 'User',
    entityId: String(admin._id),
    after: { id: String(admin._id), organizationId, role: 'admin', isActive: true, mustChangePassword: true },
    reason: 'Explicit deployment bootstrap command',
  });
  logger.info('bootstrap_admin_created', { organizationId, userId: String(admin._id) });
}

try {
  await bootstrapAdmin();
} catch (error) {
  logger.error('bootstrap_admin_failed', { error });
  process.exitCode = 1;
} finally {
  await disconnectMongo();
}
