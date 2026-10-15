import 'dotenv/config';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Environment {
  nodeEnv: 'development' | 'test' | 'production';
  serviceName: string;
  serviceVersion: string;
  logLevel: LogLevel;
  port: number;
  trustProxyHops: number;
  shutdownTimeoutMs: number;
  dependencyTimeoutMs: number;
  startupMaxAttempts: number;
  startupRetryBaseMs: number;
  metricsEnabled: boolean;
  jwtSecret: string;
  jwtExpiresIn: string;
  refreshTokenDays: number;
  passwordResetMinutes: number;
  loginMaxFailures: number;
  loginWindowMinutes: number;
  accountLockMinutes: number;
  passwordResetMaxRequests: number;
  passwordResetWindowMinutes: number;
  mongoUri: string;
  mongoMaxPoolSize: number;
  useMockDb: boolean;
  clientOrigin: string;
  storageDriver: 'memory' | 's3';
  s3Endpoint: string;
  s3Port: number;
  s3UseSsl: boolean;
  s3AccessKey: string;
  s3SecretKey: string;
  s3Bucket: string;
  maxUploadBytes: number;
  organizationStorageQuotaBytes: number;
  uploadOrphanGraceMinutes: number;
  autoSeed: boolean;
  seedAdminEmail: string;
  seedAdminPassword: string;
  projectAccessEncryptionKey: string;
  jobsEnabled: boolean;
  jobPollIntervalMs: number;
  jobConcurrency: number;
  jobLeaseSeconds: number;
  jobRetentionDays: number;
  emailDeliveryWebhookUrl: string;
  emailFrom: string;
}

function integer(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  return value;
}

function boolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

function enumValue<T extends string>(name: string, fallback: T, values: readonly T[]): T {
  const value = (process.env[name] || fallback) as T;
  if (!values.includes(value)) throw new Error(`${name} must be one of: ${values.join(', ')}`);
  return value;
}

function validUrl(name: string, value: string, protocols: string[]): void {
  try {
    const parsed = new URL(value);
    if (!protocols.includes(parsed.protocol)) throw new Error('protocol');
  } catch { throw new Error(`${name} must be a valid ${protocols.join(' or ')} URL`); }
}

function placeholder(value: string): boolean {
  return !value || /(replace|change|example|local-only|changeme|placeholder)|^Admin123!$/i.test(value);
}

function reservedExampleHost(value: string): boolean {
  const hostname = new URL(value).hostname.toLowerCase();
  return hostname === 'example.com' || hostname.endsWith('.example.com') || hostname.endsWith('.invalid');
}

const nodeEnv = enumValue('NODE_ENV', 'development', ['development', 'test', 'production'] as const);
const storageDriver = enumValue('STORAGE_DRIVER', 'memory', ['memory', 's3'] as const);
const logLevel = enumValue('LOG_LEVEL', nodeEnv === 'production' ? 'info' : nodeEnv === 'test' ? 'error' : 'debug', ['debug', 'info', 'warn', 'error'] as const);

export const env: Environment = {
  nodeEnv,
  serviceName: process.env.SERVICE_NAME || 'trivix-panel-api',
  serviceVersion: process.env.APP_VERSION || '0.1.0',
  logLevel,
  port: integer('PORT', 4000, 1, 65_535),
  trustProxyHops: integer('TRUST_PROXY_HOPS', nodeEnv === 'production' ? 1 : 0, 0, 10),
  shutdownTimeoutMs: integer('SHUTDOWN_TIMEOUT_MS', 25_000, 1_000, 120_000),
  dependencyTimeoutMs: integer('DEPENDENCY_TIMEOUT_MS', 5_000, 250, 60_000),
  startupMaxAttempts: integer('STARTUP_MAX_ATTEMPTS', 10, 1, 100),
  startupRetryBaseMs: integer('STARTUP_RETRY_BASE_MS', 500, 50, 30_000),
  metricsEnabled: boolean('METRICS_ENABLED', true),
  jwtSecret: process.env.JWT_SECRET || 'local-only-change-me',
  jwtExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || process.env.JWT_EXPIRES_IN || '15m',
  refreshTokenDays: integer('REFRESH_TOKEN_DAYS', 30, 1, 365),
  passwordResetMinutes: integer('PASSWORD_RESET_MINUTES', 30, 5, 1_440),
  loginMaxFailures: integer('LOGIN_MAX_FAILURES', 5, 2, 100),
  loginWindowMinutes: integer('LOGIN_WINDOW_MINUTES', 15, 1, 1_440),
  accountLockMinutes: integer('ACCOUNT_LOCK_MINUTES', 15, 1, 10_080),
  passwordResetMaxRequests: integer('PASSWORD_RESET_MAX_REQUESTS', 3, 1, 100),
  passwordResetWindowMinutes: integer('PASSWORD_RESET_WINDOW_MINUTES', 60, 1, 10_080),
  mongoUri: process.env.MONGO_URI || '',
  mongoMaxPoolSize: integer('MONGO_MAX_POOL_SIZE', 20, 1, 500),
  useMockDb: boolean('USE_MOCK_DB', true),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  storageDriver,
  s3Endpoint: process.env.S3_ENDPOINT || 'localhost',
  s3Port: integer('S3_PORT', 8333, 1, 65_535),
  s3UseSsl: boolean('S3_USE_SSL', false),
  s3AccessKey: process.env.S3_ACCESS_KEY || 'trivix-storage',
  s3SecretKey: process.env.S3_SECRET_KEY || 'trivix-storage-local-secret',
  s3Bucket: process.env.S3_BUCKET || 'trivix-files',
  maxUploadBytes: integer('MAX_UPLOAD_BYTES', 10 * 1024 * 1024, 1_024, 5 * 1024 * 1024 * 1024),
  organizationStorageQuotaBytes: integer('ORGANIZATION_STORAGE_QUOTA_BYTES', 1024 * 1024 * 1024, 0, Number.MAX_SAFE_INTEGER),
  uploadOrphanGraceMinutes: integer('UPLOAD_ORPHAN_GRACE_MINUTES', 60, 5, 43_200),
  autoSeed: boolean('AUTO_SEED', false),
  seedAdminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@trileez.ir',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin123!',
  projectAccessEncryptionKey: process.env.PROJECT_ACCESS_ENCRYPTION_KEY || process.env.JWT_SECRET || 'local-project-access-secret-change-me',
  jobsEnabled: boolean('JOBS_ENABLED', true),
  jobPollIntervalMs: integer('JOB_POLL_INTERVAL_MS', 2_000, 250, 300_000),
  jobConcurrency: integer('JOB_CONCURRENCY', 2, 1, 20),
  jobLeaseSeconds: integer('JOB_LEASE_SECONDS', 120, 15, 3_600),
  jobRetentionDays: integer('JOB_RETENTION_DAYS', 30, 1, 3_650),
  emailDeliveryWebhookUrl: process.env.EMAIL_DELIVERY_WEBHOOK_URL || '',
  emailFrom: process.env.EMAIL_FROM || 'noreply@trivix.local',
};

if (!/^\d+[smhd]$/.test(env.jwtExpiresIn)) throw new Error('ACCESS_TOKEN_EXPIRES_IN must use a duration such as 15m, 1h, or 1d');
validUrl('CLIENT_ORIGIN', env.clientOrigin, ['http:', 'https:']);
if (env.emailDeliveryWebhookUrl) validUrl('EMAIL_DELIVERY_WEBHOOK_URL', env.emailDeliveryWebhookUrl, ['https:', ...(nodeEnv === 'production' ? [] : ['http:'])]);
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.emailFrom)) throw new Error('EMAIL_FROM must be a valid email address');

if (nodeEnv === 'production') {
  const errors: string[] = [];
  if (env.useMockDb) errors.push('USE_MOCK_DB must be false');
  if (!env.mongoUri) errors.push('MONGO_URI is required');
  else if (!/^mongodb(\+srv)?:\/\//.test(env.mongoUri)) errors.push('MONGO_URI must be a MongoDB URI');
  else if (/(replace-with|changeme|placeholder|example)/i.test(env.mongoUri)) errors.push('MONGO_URI must not contain placeholder credentials');
  if (env.storageDriver !== 's3') errors.push('STORAGE_DRIVER must be s3');
  if (env.jwtSecret.length < 32 || placeholder(env.jwtSecret)) errors.push('JWT_SECRET must be a non-placeholder secret of at least 32 characters');
  if (env.projectAccessEncryptionKey.length < 32 || placeholder(env.projectAccessEncryptionKey)) errors.push('PROJECT_ACCESS_ENCRYPTION_KEY must be a non-placeholder secret of at least 32 characters');
  if (env.projectAccessEncryptionKey === env.jwtSecret) errors.push('PROJECT_ACCESS_ENCRYPTION_KEY must be different from JWT_SECRET');
  if (!env.s3AccessKey || env.s3AccessKey === 'trivix-storage' || placeholder(env.s3AccessKey)) errors.push('S3_ACCESS_KEY must be explicitly configured');
  if (env.s3SecretKey.length < 16 || placeholder(env.s3SecretKey)) errors.push('S3_SECRET_KEY must be a non-placeholder secret of at least 16 characters');
  if (reservedExampleHost(env.clientOrigin)) errors.push('CLIENT_ORIGIN must be the deployed panel origin, not an example domain');
  if (/@(?:[^@]*\.)?example\.(?:com|org|net)$|@[^@]*\.invalid$|@[^@]*\.local$/i.test(env.emailFrom)) errors.push('EMAIL_FROM must use a deployable mail domain');
  if (env.autoSeed) errors.push('AUTO_SEED must be false in production');
  if (errors.length) throw new Error(`Invalid production environment: ${errors.join('; ')}`);
}
