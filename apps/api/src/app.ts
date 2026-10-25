import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import dashboardRoutes from './routes/dashboard.js';
import { employeeRoutes } from './routes/resources.js';
import { meetingRoutes, projectEventRoutes } from './routes/collaborationDomain.js';
import { projectDomainDataRoutes, projectRoutes, taskRoutes } from './routes/projectDomain.js';
import { performanceEventRoutes, performancePeriodRoutes, performanceSummaryRoutes } from './routes/performance.js';
import { errorHandler, notFound } from './middleware/errors.js';
import legacyRoutes from './routes/legacy.js';
import fileRoutes from './routes/files.js';
import { objectStorage } from './storage/objectStorage.js';
import type { Express } from 'express';
import { sensitiveResourceRoutes } from './routes/sensitiveResources.js';
import projectAccessRoutes from './routes/projectAccess.js';
import { requestContextMiddleware } from './middleware/requestContext.js';
import auditRoutes from './routes/audit.js';
import jobRoutes from './routes/jobs.js';
import { requestLoggingMiddleware } from './middleware/requestLogging.js';
import { renderMetrics, requestMetricsMiddleware } from './observability/metrics.js';
import { runtimeState } from './observability/runtimeState.js';
import { mongoReadiness } from './db/mongo.js';
import chatRoutes from './routes/chat.js';
import notificationRoutes from './routes/notifications.js';
import employeeSelfRoutes from './routes/employeeSelf.js';
import agentDeviceEmployeeRoutes, { agentDeviceManagementRoutes } from './routes/agentDevices.js';
import applicationUsageEmployeeRoutes, { applicationUsageManagementRoutes } from './routes/applicationUsage.js';
import deviceHealthEmployeeRoutes, { deviceHealthManagementRoutes } from './routes/deviceHealth.js';
import screenShareEmployeeRoutes, { screenShareManagementRoutes } from './routes/screenShare.js';

async function readiness() {
  const started = process.hrtime.bigint();
  const [mongodb, storageOk] = await Promise.all([mongoReadiness(), objectStorage.healthy()]);
  const runtimeReady = runtimeState.isReady();
  const ok = runtimeReady && mongodb.ok && storageOk;
  return {
    ok, service: env.serviceName, version: env.serviceVersion, status: ok ? 'ready' : 'not_ready',
    checks: { runtime: { ok: runtimeReady, shuttingDown: runtimeState.isShuttingDown() }, mongodb, storage: { ok: storageOk, driver: objectStorage.driver } },
    uptimeSeconds: process.uptime(), latencyMs: Number((Number(process.hrtime.bigint() - started) / 1e6).toFixed(3)), timestamp: new Date().toISOString(),
  };
}

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  if (env.trustProxyHops > 0) app.set('trust proxy', env.trustProxyHops);
  app.use(requestContextMiddleware);
  app.use(requestMetricsMiddleware);
  app.use(requestLoggingMiddleware);
  app.use((_req, res, next) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('referrer-policy', 'no-referrer');
    if (env.nodeEnv === 'production') res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
    next();
  });
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  runtimeState.markReady();

  app.get('/api/health/live', (_req, res) => res.json({ ok: true, service: env.serviceName, version: env.serviceVersion, status: 'alive', uptimeSeconds: process.uptime(), timestamp: new Date().toISOString() }));
  app.get('/api/health/ready', async (_req, res, next) => { try { const result = await readiness(); res.status(result.ok ? 200 : 503).json(result); } catch (error) { next(error); } });
  app.get('/api/health', async (_req, res, next) => { try { const result = await readiness(); res.status(result.ok ? 200 : 503).json(result); } catch (error) { next(error); } });
  app.get('/api/metrics', (_req, res) => {
    if (!env.metricsEnabled) return res.status(404).json({ error: 'Metrics are disabled', code: 'METRICS_DISABLED' });
    res.type('text/plain; version=0.0.4; charset=utf-8').send(renderMetrics());
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/me', employeeSelfRoutes);
  app.use('/api/me', agentDeviceEmployeeRoutes);
  app.use('/api/me', applicationUsageEmployeeRoutes);
  app.use('/api/me', deviceHealthEmployeeRoutes);
  app.use('/api/me', screenShareEmployeeRoutes);
  app.use('/api/agent-devices', agentDeviceManagementRoutes);
  app.use('/api/agent-usage', applicationUsageManagementRoutes);
  app.use('/api/agent-health', deviceHealthManagementRoutes);
  app.use('/api', screenShareManagementRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/jobs', jobRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/employees', employeeRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/meetings', meetingRoutes);
  app.use('/api/project-events', projectEventRoutes);
  app.use('/api/performance/events', performanceEventRoutes);
  app.use('/api/performance/periods', performancePeriodRoutes);
  app.use('/api/performance/summary', performanceSummaryRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/files', fileRoutes);
  app.use('/api/data/project-accesses', projectAccessRoutes);
  app.use('/api/data', chatRoutes);
  app.use('/api/data', notificationRoutes);
  for (const [resource, routes] of projectDomainDataRoutes) app.use(`/api/data/${resource}`, routes);
  for (const [resource, routes] of sensitiveResourceRoutes) app.use(`/api/data/${resource}`, routes);
  app.use('/api/data', legacyRoutes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
