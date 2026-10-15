import { models } from '../models/index.js';
import { readLegacyRowsForMigration, removeLegacyRowAfterMigration } from './legacy.js';
import type { ResourceName } from '../types/entities.js';
import { logger } from '../observability/logger.js';

const resources = {
  'project-phases': 'ProjectPhase', 'project-roles': 'ProjectRole', 'project-activities': 'ProjectActivity',
  'project-members': 'ProjectMember', timesheets: 'TimeEntry',
} as const satisfies Record<string, ResourceName>;

export async function migrateProjectDomainLegacyRecords(): Promise<void> {
  for (const [legacyResource, modelName] of Object.entries(resources)) {
    for (const row of await readLegacyRowsForMigration(legacyResource)) {
      try {
        const model = models[modelName];
        if (!await model.exists({ _id: row.id, organizationId: row.organizationId })) {
          const { id, ...record } = row;
          await model.create({ ...record, _id: id, createdBy: typeof row.createdBy === 'string' ? row.createdBy : 'system:migration' });
        }
        await removeLegacyRowAfterMigration(row.organizationId, legacyResource, row.id);
      } catch (error) { logger.warn('legacy_migration_record_failed', { resource: legacyResource, recordId: row.id, organizationId: row.organizationId, preserved: true, error }); }
    }
  }
}
