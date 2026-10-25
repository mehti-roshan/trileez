import type { Server } from 'node:http';
import { createApp } from './app.js';
import { initializeDatabase } from './db/database.js';
import { disconnectMongo } from './db/mongo.js';
import { env } from './config/env.js';
import { initializeObjectStorage } from './storage/objectStorage.js';
import { recurringTasks } from './jobs/recurring.js';
import { backgroundWorker } from './jobs/worker.js';
import { logger } from './observability/logger.js';
import { runtimeState } from './observability/runtimeState.js';

let server: Server | undefined;
let shuttingDown: Promise<void> | undefined;

async function closeHttpServer(httpServer: Server): Promise<void> {
  if (!httpServer.listening) return;
  httpServer.closeIdleConnections?.();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      new Promise<void>((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve())),
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          logger.warn('http_server_shutdown_timeout', { timeoutMs: env.shutdownTimeoutMs });
          httpServer.closeAllConnections?.();
          resolve();
        }, env.shutdownTimeoutMs);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function shutdown(reason: string, exitCode = 0): Promise<void> {
  if (shuttingDown) return shuttingDown;
  shuttingDown = (async () => {
    runtimeState.markShuttingDown();
    logger.info('service_shutdown_started', { reason, exitCode });
    const operations: Promise<unknown>[] = [backgroundWorker.stopAndDrain(env.shutdownTimeoutMs)];
    if (server) operations.push(closeHttpServer(server));
    const results = await Promise.allSettled(operations);
    for (const result of results) if (result.status === 'rejected') logger.error('service_shutdown_operation_failed', { reason, error: result.reason });
    try { await disconnectMongo(); } catch (error) { logger.error('mongodb_disconnect_failed', { error }); }
    logger.info('service_shutdown_completed', { reason, exitCode });
    process.exitCode = exitCode;
  })();
  return shuttingDown;
}

async function main(): Promise<void> {
  logger.info('service_startup_started', { nodeEnv: env.nodeEnv, storageDriver: env.storageDriver, jobsEnabled: env.jobsEnabled });
  const database = await initializeDatabase();
  await initializeObjectStorage();
  if (env.jobsEnabled) await recurringTasks.ensureDefaults();
  const app = createApp();
  const httpServer = app.listen(env.port);
  server = httpServer;
  httpServer.keepAliveTimeout = 65_000;
  httpServer.headersTimeout = 66_000;
  httpServer.requestTimeout = 120_000;
  await new Promise<void>((resolve, reject) => {
    const listening = () => { httpServer.off('error', failed); resolve(); };
    const failed = (error: Error) => { httpServer.off('listening', listening); reject(error); };
    httpServer.once('listening', listening);
    httpServer.once('error', failed);
  });
  httpServer.on('error', (error) => {
    logger.error('http_server_error', { error });
    void shutdown('http_server_error', 1);
  });
  backgroundWorker.start();
  logger.info('service_started', { port: env.port, databaseMode: database.mode, storageDriver: env.storageDriver, jobsEnabled: env.jobsEnabled });
}

process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.once('SIGINT', () => { void shutdown('SIGINT'); });
process.once('uncaughtException', (error) => { logger.error('uncaught_exception', { error }); void shutdown('uncaughtException', 1); });
process.once('unhandledRejection', (error) => { logger.error('unhandled_rejection', { error }); void shutdown('unhandledRejection', 1); });

try { await main(); }
catch (error) {
  runtimeState.markNotReady();
  logger.error('service_startup_failed', { error });
  await shutdown('startup_failed', 1);
}
