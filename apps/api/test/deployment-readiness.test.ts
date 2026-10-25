import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initializeDatabase } from '../src/db/database.js';

await initializeDatabase();
const app = createApp();

test('liveness, readiness, and backward-compatible health endpoints expose operational state', async () => {
  const live = await request(app).get('/api/health/live').expect(200);
  assert.equal(live.body.ok, true);
  assert.equal(live.body.status, 'alive');
  assert.equal(typeof live.body.version, 'string');

  const ready = await request(app).get('/api/health/ready').expect(200);
  assert.equal(ready.body.ok, true);
  assert.equal(ready.body.status, 'ready');
  assert.equal(ready.body.checks.mongodb.ok, true);
  assert.equal(ready.body.checks.storage.ok, true);

  const legacy = await request(app).get('/api/health').expect(200);
  assert.equal(legacy.body.ok, true);
});

test('request and correlation IDs are validated, propagated, and included in errors', async () => {
  const suppliedRequestId = `request-${Date.now()}`;
  const suppliedCorrelationId = `correlation-${Date.now()}`;
  const response = await request(app).get('/api/not-a-route')
    .set('x-request-id', suppliedRequestId).set('x-correlation-id', suppliedCorrelationId).expect(404);
  assert.equal(response.headers['x-request-id'], suppliedRequestId);
  assert.equal(response.headers['x-correlation-id'], suppliedCorrelationId);
  assert.equal(response.body.requestId, suppliedRequestId);
  assert.equal(response.body.correlationId, suppliedCorrelationId);
  assert.equal(response.body.code, 'ROUTE_NOT_FOUND');

  const generated = await request(app).get('/api/not-a-route').set('x-request-id', 'bad').expect(404);
  assert.match(String(generated.headers['x-request-id']), /^[a-f0-9-]{36}$/);
  assert.equal(generated.headers['x-correlation-id'], generated.headers['x-request-id']);
});

test('centralized error handling returns stable JSON for malformed request bodies', async () => {
  const response = await request(app).post('/api/auth/login').set('content-type', 'application/json').send('{bad json').expect(400);
  assert.equal(response.body.code, 'INVALID_JSON');
  assert.equal(response.body.error, 'Request body contains invalid JSON');
  assert.equal(response.body.requestId, response.headers['x-request-id']);
});

test('metrics expose bounded HTTP, process, security, and background-job series', async () => {
  await request(app).get('/api/projects').expect(401);
  const response = await request(app).get('/api/metrics').expect(200);
  assert.match(response.text, /trileez_http_requests_total\{method="GET",status_class="4xx"\}/);
  assert.match(response.text, /trileez_http_request_duration_seconds_count/);
  assert.match(response.text, /trileez_security_events_total\{event="auth\.missing_token"\}/);
  assert.match(response.text, /trileez_background_jobs_total/);
  assert.match(response.text, /process_resident_memory_bytes/);
});
