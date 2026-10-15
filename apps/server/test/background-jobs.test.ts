import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initializeDatabase } from '../src/db/database.js';
import { database } from '../src/db/database.js';
import { legacyDatabase } from '../src/db/legacy.js';
import { jobQueue } from '../src/jobs/queue.js';
import { getJobHandler } from '../src/jobs/handlers.js';
import { backgroundWorker } from '../src/jobs/worker.js';

await initializeDatabase();
const app = createApp();

async function login(email = 'admin@trileez.ir', password = 'Admin123!'): Promise<string> {
  const response = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  return `Bearer ${response.body.token}`;
}

test('jobs are idempotent and stale leases can be reclaimed without duplicate side effects', async () => {
  const now = new Date();
  const input = {
    organizationId: 'org1', type: 'notification.create' as const, createdBy: 'u1', idempotencyKey: `queue-idempotency-${Date.now()}`,
    runAt: now, payload: { recipientId: 'u2', title: 'Queue test', body: 'Only one notification should be created.' },
  };
  const first = await jobQueue.enqueue(input);
  const duplicate = await jobQueue.enqueue(input);
  assert.equal(duplicate.id, first.id);

  const claimed = await jobQueue.claim('worker-a', 1, now);
  assert.equal(claimed?.id, first.id);
  assert.equal(await jobQueue.claim('worker-b', 1, new Date(now.getTime() + 500)), undefined);
  const reclaimed = await jobQueue.claim('worker-b', 30, new Date(now.getTime() + 2_000));
  assert.equal(reclaimed?.id, first.id);
  assert.equal(reclaimed?.attempts, 2);
  const handler = getJobHandler('notification.create');
  assert.ok(handler && reclaimed);
  const result = await handler({ job: reclaimed, now: new Date(now.getTime() + 2_000) });
  await jobQueue.complete(reclaimed, 'worker-b', result);

  const notification = await legacyDatabase.get('org1', 'notifications', `notification-${first.id}`);
  assert.ok(notification);
  assert.equal((await legacyDatabase.list('org1', 'notifications')).filter((row) => row.sourceJobId === first.id).length, 1);
  assert.equal((await database.forOrganization('org1').get('BackgroundJob', first.id))?.status, 'completed');
  await request(app).get(`/api/jobs/${first.id}`).expect(401);
  const member = await login('member@trileez.ir', 'Manager123!');
  await request(app).get('/api/jobs').set('authorization', member).expect(403);
  const otherOrganization = await login('admin.org2@trileez.ir');
  await request(app).get(`/api/jobs/${first.id}`).set('authorization', otherOrganization).expect(404);
});

test('failed jobs retry with backoff, become observable failures, and can be retried or cancelled', async () => {
  const authorization = await login();
  const job = await jobQueue.enqueue({ organizationId: 'org1', type: 'file.process', payload: { fileId: `missing-${Date.now()}` }, createdBy: 'u1', maxAttempts: 2 });
  await backgroundWorker.runOnce(new Date(), { dispatchRecurring: false });
  let current = await database.forOrganization('org1').get('BackgroundJob', job.id);
  assert.equal(current?.status, 'retry_wait');
  assert.equal(current?.attempts, 1);
  assert.match(String(current?.lastError), /no longer exists/i);

  await database.forOrganization('org1').update('BackgroundJob', job.id, { runAt: new Date(0).toISOString() });
  await backgroundWorker.runOnce(new Date(), { dispatchRecurring: false });
  current = await database.forOrganization('org1').get('BackgroundJob', job.id);
  assert.equal(current?.status, 'failed');
  assert.equal(current?.attempts, 2);

  await request(app).post(`/api/jobs/${job.id}/retry`).set('authorization', authorization).expect(200);
  assert.equal((await database.forOrganization('org1').get('BackgroundJob', job.id))?.status, 'queued');
  await request(app).delete(`/api/jobs/${job.id}`).set('authorization', authorization).expect(204);
  assert.equal((await database.forOrganization('org1').get('BackgroundJob', job.id))?.status, 'cancelled');
});

test('file processing, meeting reminders, performance refresh, cleanup, reports, and recurring dispatch use the queue', async () => {
  const authorization = await login();
  const suffix = Date.now();
  const uploaded = await request(app).post('/api/files').set('authorization', authorization)
    .field('name', `queued-file-${suffix}`).attach('file', Buffer.from('background-file-body'), { filename: `queued-${suffix}.txt`, contentType: 'text/plain' }).expect(201);
  assert.equal(uploaded.body.data.processingStatus, 'pending');
  await backgroundWorker.runUntilIdle({ dispatchRecurring: false });
  const processedFile = await database.forOrganization('org1').get('FileRecord', uploaded.body.data.id);
  assert.equal(processedFile?.processingStatus, 'processed');
  assert.match(String(processedFile?.sha256), /^[a-f0-9]{64}$/);

  const meeting = await request(app).post('/api/meetings').set('authorization', authorization).send({
    title: `Queued meeting ${suffix}`, startAt: new Date(Date.now() + 30 * 60_000).toISOString(), durationMinutes: 30, organizerId: 'u1', participantIds: ['u2'],
  }).expect(201);
  await jobQueue.enqueue({ organizationId: 'org1', type: 'meeting.reminders.scan', payload: { horizonMinutes: 60 }, createdBy: 'system', idempotencyKey: `meeting-scan-a-${suffix}` });
  await backgroundWorker.runUntilIdle({ dispatchRecurring: false });
  const reminderCount = (await legacyDatabase.list('org1', 'notifications')).filter((row) => row.entityId === meeting.body.data.id).length;
  assert.equal(reminderCount, 2);
  await jobQueue.enqueue({ organizationId: 'org1', type: 'meeting.reminders.scan', payload: { horizonMinutes: 60 }, createdBy: 'system', idempotencyKey: `meeting-scan-b-${suffix}` });
  await backgroundWorker.runUntilIdle({ dispatchRecurring: false });
  assert.equal((await legacyDatabase.list('org1', 'notifications')).filter((row) => row.entityId === meeting.body.data.id).length, reminderCount);

  await jobQueue.enqueue({ organizationId: 'org1', type: 'performance.period.refresh', payload: { employeeId: 'e1', period: new Date().toISOString() }, createdBy: 'system', idempotencyKey: `performance-refresh-a-${suffix}` });
  await backgroundWorker.runUntilIdle({ dispatchRecurring: false });
  const period = (await database.forOrganization('org1').list('PerformancePeriod', { employeeId: 'e1' }))[0];
  assert.ok(period);
  const version = period.version;
  await jobQueue.enqueue({ organizationId: 'org1', type: 'performance.period.refresh', payload: { employeeId: 'e1', period: new Date().toISOString() }, createdBy: 'system', idempotencyKey: `performance-refresh-b-${suffix}` });
  await backgroundWorker.runUntilIdle({ dispatchRecurring: false });
  assert.equal((await database.forOrganization('org1').get('PerformancePeriod', period.id))?.version, version);

  const expiredSession = await database.forOrganization('org1').create('AuthSession', { userId: 'u1', refreshTokenHash: 'expired', status: 'revoked', expiresAt: new Date(0).toISOString() });
  await jobQueue.enqueue({ organizationId: 'org1', type: 'cleanup.expired-records', payload: { retentionDays: 30 }, createdBy: 'system', idempotencyKey: `cleanup-${suffix}` });
  await backgroundWorker.runUntilIdle({ dispatchRecurring: false });
  assert.equal(await database.forOrganization('org1').get('AuthSession', expiredSession.id), undefined);

  const report = await request(app).post('/api/jobs/reports').set('authorization', authorization).send({ resource: 'employees', format: 'json', title: `employees-${suffix}` }).expect(202);
  await backgroundWorker.runUntilIdle({ dispatchRecurring: false });
  const completedReport = await database.forOrganization('org1').get('BackgroundJob', report.body.data.id);
  assert.equal(completedReport?.status, 'completed');
  const reportFileId = String((completedReport?.result as Record<string, unknown>)?.fileId);
  const reportFile = await database.forOrganization('org1').get('FileRecord', reportFileId);
  assert.equal(reportFile?.contextKind, 'generated-report');
  await request(app).get(`/api/files/${reportFileId}/content`).set('authorization', authorization).expect(200);

  const recurring = await request(app).post('/api/jobs/recurring').set('authorization', authorization).send({
    name: `test-cleanup-${suffix}`, jobType: 'cleanup.expired-records', payload: { retentionDays: 30 }, intervalMinutes: 60, nextRunAt: new Date().toISOString(),
  }).expect(201);
  await backgroundWorker.runOnce(new Date(Date.now() + 1000), { dispatchRecurring: true });
  const recurringJobs = await database.forOrganization('org1').list('BackgroundJob', { recurringTaskId: recurring.body.data.id });
  assert.equal(recurringJobs.length, 1);

  const list = await request(app).get('/api/jobs').query({ limit: 5 }).set('authorization', authorization).expect(200);
  assert.equal(list.body.page.limit, 5);
  const stats = await request(app).get('/api/jobs/stats').set('authorization', authorization).expect(200);
  assert.ok(stats.body.data.completed >= 1);
  assert.ok(stats.body.data.recurring >= 1);
});

test('recurring dispatch repairs compatibility with older rows that have no payload field', async () => {
  const suffix = Date.now();
  const recurring = await database.forOrganization('org1').create('RecurringTask', {
    id: `legacy-recurring-${suffix}`, name: `legacy-recurring-${suffix}`, jobType: 'cleanup.expired-records',
    intervalMinutes: 60, nextRunAt: new Date(0).toISOString(), enabled: true, createdBy: 'system',
  });
  await backgroundWorker.runOnce(new Date(), { dispatchRecurring: true });
  const jobs = await database.forOrganization('org1').list('BackgroundJob', { recurringTaskId: recurring.id });
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0]?.payload, {});
});

test('workers treat minimized legacy job payloads as empty objects', async () => {
  const suffix = Date.now();
  const job = await database.forOrganization('org1').create('BackgroundJob', {
    id: `legacy-job-${suffix}`, type: 'cleanup.expired-records', queue: 'maintenance', status: 'queued',
    priority: 0, runAt: new Date(0).toISOString(), attempts: 0, maxAttempts: 2, createdBy: 'system',
  });
  await backgroundWorker.runOnce(new Date(), { dispatchRecurring: false });
  assert.equal((await database.forOrganization('org1').get('BackgroundJob', job.id))?.status, 'completed');
});
