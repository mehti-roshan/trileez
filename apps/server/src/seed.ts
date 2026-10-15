import { initializeDatabase } from './db/database.js';
import { seedMongoData } from './db/seedData.js';
import { disconnectMongo } from './db/mongo.js';
import { logger } from './observability/logger.js';
import { initializeObjectStorage } from './storage/objectStorage.js';
import { assertPasswordPolicy } from './utils/password.js';
import { snapshotOrganizationRecordIds } from './db/seedVerification.js';
import { DEFAULT_ORGANIZATION_ID } from './config/organizations.js';

try {
  if (!process.env.SEED_ADMIN_EMAIL || !process.env.SEED_ADMIN_PASSWORD) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required for explicit database seeding');
  }
  assertPasswordPolicy(process.env.SEED_ADMIN_PASSWORD, { email: process.env.SEED_ADMIN_EMAIL }, 'SEED_ADMIN_PASSWORD');
  const database = await initializeDatabase();
  if (database.mode !== 'mongo') throw new Error('MongoDB seeding requires USE_MOCK_DB=false and a valid MONGO_URI');
  await initializeObjectStorage();
  const summary = await seedMongoData();
  if (process.argv.includes('--verify-idempotency')) {
    const firstSnapshot = await snapshotOrganizationRecordIds(DEFAULT_ORGANIZATION_ID);
    const secondSummary = await seedMongoData();
    const secondSnapshot = await snapshotOrganizationRecordIds(DEFAULT_ORGANIZATION_ID);
    if (JSON.stringify(firstSnapshot) !== JSON.stringify(secondSnapshot)) {
      throw new Error('Seed idempotency verification failed: a repeat run changed organization record identities');
    }
    logger.info('seed_idempotency_verified', { databaseMode: database.mode, summary: secondSummary });
  } else {
    logger.info('seed_completed', { databaseMode: database.mode, summary });
  }
} finally {
  await disconnectMongo();
}
