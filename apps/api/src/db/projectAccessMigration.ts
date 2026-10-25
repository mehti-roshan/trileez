import { models } from '../models/index.js';
import { encryptProjectAccessSecret, extractEmbeddedSecret } from '../security/projectAccessSecrets.js';
import { readLegacyRowsForMigration, removeLegacyRowAfterMigration } from './legacy.js';
import { logger } from '../observability/logger.js';

function normalizedRecord(row: Record<string, unknown>): Record<string, unknown> {
  const extracted = extractEmbeddedSecret(String(row.content || ''));
  const plaintext = typeof row.secret === 'string' && row.secret.trim() ? row.secret : extracted.secret;
  const organizationId = String(row.organizationId);
  const resource = String(row.resource || row.system || extracted.content || 'project-access');
  return {
    ...row, content: extracted.content, resource, permission: String(row.permission || 'use'),
    ...(plaintext ? encryptProjectAccessSecret(plaintext, organizationId) : { hasSecret: false }),
    createdBy: typeof row.createdBy === 'string' ? row.createdBy : 'system:migration',
    grantedBy: typeof row.grantedBy === 'string' ? row.grantedBy : 'system:migration',
  };
}

export async function migrateProjectAccessRecords(): Promise<void> {
  for (const row of await readLegacyRowsForMigration('project-accesses')) {
    try {
      if (!await models.ProjectAccess.exists({ _id: row.id, organizationId: row.organizationId })) {
        const { id, secret: _secret, ...record } = normalizedRecord(row) as Record<string, unknown> & { id?: string; secret?: string };
        await models.ProjectAccess.create({ ...record, _id: id || row.id });
      }
      await removeLegacyRowAfterMigration(row.organizationId, 'project-accesses', row.id);
    } catch (error) { logger.warn('legacy_migration_record_failed', { resource: 'project-accesses', recordId: row.id, organizationId: row.organizationId, preserved: true, error }); }
  }

  const rawRows = await models.ProjectAccess.collection.find({
    $or: [
      { secret: { $type: 'string' } },
      { content: { $regex: '(password|passwd|secret|token|api[ _-]?key|رمز)', $options: 'i' } },
      { resource: { $exists: false } }, { resource: null }, { resource: '' },
      { permission: { $exists: false } }, { permission: null }, { permission: '' },
    ],
  }).toArray();
  for (const row of rawRows) {
    const normalized = normalizedRecord(row as unknown as Record<string, unknown>);
    const { secret: _secret, _id: _id, ...safe } = normalized;
    await models.ProjectAccess.collection.updateOne({ _id: row._id }, { $set: safe, $unset: { secret: '' } });
  }
}
