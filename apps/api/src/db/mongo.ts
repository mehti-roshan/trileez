import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../observability/logger.js';
import { retryWithBackoff } from '../utils/retry.js';

export async function connectMongo(): Promise<boolean> {
  if (env.useMockDb || !env.mongoUri) return false;
  await retryWithBackoff('mongodb.connect', async () => {
    await mongoose.connect(env.mongoUri, {
      maxPoolSize: env.mongoMaxPoolSize,
      minPoolSize: 0,
      serverSelectionTimeoutMS: env.dependencyTimeoutMs,
      connectTimeoutMS: env.dependencyTimeoutMs,
      socketTimeoutMS: Math.max(10_000, env.dependencyTimeoutMs * 2),
    });
  }, { attempts: env.startupMaxAttempts, baseDelayMs: env.startupRetryBaseMs });
  logger.info('mongodb_connected', { host: mongoose.connection.host, database: mongoose.connection.name, maxPoolSize: env.mongoMaxPoolSize });
  return true;
}

export async function mongoReadiness(): Promise<{ ok: boolean; mode: 'mongo' | 'mock'; latencyMs: number; state: number }> {
  const started = process.hrtime.bigint();
  if (env.useMockDb || !env.mongoUri) return { ok: true, mode: 'mock', latencyMs: 0, state: 0 };
  const state = mongoose.connection.readyState;
  if (state !== 1 || !mongoose.connection.db) return { ok: false, mode: 'mongo', latencyMs: 0, state };
  try {
    await Promise.race([
      mongoose.connection.db.admin().ping(),
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('MongoDB readiness check timed out')), env.dependencyTimeoutMs)),
    ]);
    return { ok: true, mode: 'mongo', latencyMs: Number(process.hrtime.bigint() - started) / 1e6, state };
  } catch { return { ok: false, mode: 'mongo', latencyMs: Number(process.hrtime.bigint() - started) / 1e6, state }; }
}

export async function disconnectMongo(): Promise<void> {
  if (mongoose.connection.readyState) {
    await mongoose.disconnect();
    logger.info('mongodb_disconnected');
  }
}
