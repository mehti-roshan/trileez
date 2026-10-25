import { env } from './config/env.js';
import { initializeDatabase } from './db/database.js';
import { disconnectMongo } from './db/mongo.js';
import { initializeObjectStorage } from './storage/objectStorage.js';
import { recurringTasks } from './jobs/recurring.js';
import { backgroundWorker } from './jobs/worker.js';
import { logger } from './observability/logger.js';

let shuttingDown: Promise<void> | undefined;

async function shutdown(reason: string, exitCode = 0): Promise<void> {
  if (shuttingDown) return shuttingDown;
  shuttingDown = (async () => {
    logger.info('worker_shutdown_started', { reason, exitCode });
    await backgroundWorker.stopAndDrain(env.shutdownTimeoutMs);
    await disconnectMongo();
    logger.info('worker_shutdown_completed', { reason, exitCode });
    process.exitCode = exitCode;
  })();
  return shuttingDown;
}

async function main(): Promise<void> {
  const database = await initializeDatabase();
  await initializeObjectStorage();
  await recurringTasks.ensureDefaults();
  backgroundWorker.start();
  logger.info('background_worker_started', { databaseMode: database.mode, workerId: backgroundWorker.workerId });
}

process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.once('SIGINT', () => { void shutdown('SIGINT'); });
process.once('uncaughtException', (error) => { logger.error('worker_uncaught_exception', { error }); void shutdown('uncaughtException', 1); });
process.once('unhandledRejection', (error) => { logger.error('worker_unhandled_rejection', { error }); void shutdown('unhandledRejection', 1); });

try { await main(); }
catch (error) { logger.error('background_worker_startup_failed', { error }); await shutdown('startup_failed', 1); }
