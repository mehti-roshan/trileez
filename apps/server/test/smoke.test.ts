import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initializeDatabase } from '../src/db/database.js';

await initializeDatabase();
const app = createApp();

test('health, JWT login, authorization and protected resources work', async () => {
  const health = await request(app).get('/api/health').expect(200);
  assert.equal(health.body.ok, true);

  const login = await request(app).post('/api/auth/login').send({ email: 'admin@trileez.ir', password: 'Admin123!' }).expect(200);
  assert.equal(login.body.user.role, 'admin');
  assert.ok(login.body.token);

  await request(app).get('/api/projects').expect(401);
  const projects = await request(app).get('/api/projects').set('authorization', `Bearer ${login.body.token}`).expect(200);
  assert.ok(Array.isArray(projects.body.data));

  const summary = await request(app).get('/api/dashboard/summary').set('authorization', `Bearer ${login.body.token}`).expect(200);
  assert.equal(summary.body.data.database, 'mock');
  assert.ok(summary.body.data.employees >= 2);
});

test('backend accepts a complete meeting and free-text performance reason', async () => {
  const login = await request(app).post('/api/auth/login').send({ email: 'admin@trileez.ir', password: 'Admin123!' }).expect(200);
  const authorization = `Bearer ${login.body.token}`;
  const meeting = await request(app).post('/api/meetings').set('authorization', authorization).send({ title: 'جلسه تست API', startAt: '2026-09-24T10:00:00.000Z', durationMinutes: 45, organizerId: 'u1', departments: ['فنی', 'محصول'], agenda: 'بررسی برنامه', discussionSummary: 'موارد بررسی شد.', decisions: 'تصمیم نهایی ثبت شد.', actionItems: 'اقدام اول — مسئول: مدیر پروژه', meetingDocument: { name: 'minutes.pdf', type: 'application/pdf', size: 1200 } }).expect(201);
  assert.deepEqual(meeting.body.data.departments, ['فنی', 'محصول']);

  const score = await request(app).post('/api/performance/events').set('authorization', authorization).send({ employeeId: 'e1', reason: 'تحویل با کیفیت بالاتر از انتظار', points: 8, date: '2026-09-24' }).expect(201);
  assert.equal(score.body.data.reason, 'تحویل با کیفیت بالاتر از انتظار');
});

test('generic panel resources support bulk seeding and CRUD', async () => {
  const login = await request(app).post('/api/auth/login').send({ email: 'admin@trileez.ir', password: 'Admin123!' }).expect(200);
  const authorization = `Bearer ${login.body.token}`;
  const resource = 'goals';
  const suffix = Date.now();
  const firstId = `row-1-${suffix}`;
  const secondId = `row-2-${suffix}`;
  const seeded = await request(app).post(`/api/data/${resource}/bulk`).set('authorization', authorization).send({ items: [{ id: firstId, title: 'اول' }, { id: secondId, title: 'دوم' }] }).expect(201);
  assert.equal(seeded.body.data.length, 2);
  const updated = await request(app).patch(`/api/data/${resource}/${firstId}`).set('authorization', authorization).send({ title: 'ویرایش‌شده' }).expect(200);
  assert.equal(updated.body.data.title, 'ویرایش‌شده');
  await request(app).delete(`/api/data/${resource}/${secondId}`).set('authorization', authorization).expect(204);
  const rows = await request(app).get(`/api/data/${resource}`).set('authorization', authorization).expect(200);
  assert.ok(rows.body.data.some((row: { id: string; title: string }) => row.id === firstId && row.title === 'ویرایش‌شده'));
  assert.ok(!rows.body.data.some((row: { id: string }) => row.id === secondId));
});

test('authenticated file upload, metadata, download and deletion work', async () => {
  const login = await request(app).post('/api/auth/login').send({ email: 'admin@trileez.ir', password: 'Admin123!' }).expect(200);
  const authorization = `Bearer ${login.body.token}`;
  const uploaded = await request(app)
    .post('/api/files')
    .set('authorization', authorization)
    .field('projectId', 'p1')
    .field('tags', JSON.stringify(['contract', 'signed']))
    .attach('file', Buffer.from('secure file body'), { filename: 'contract.txt', contentType: 'text/plain' })
    .expect(201);
  assert.equal(uploaded.body.data.originalName, 'contract.txt');
  assert.equal(uploaded.body.data.sizeBytes, 16);

  const content = await request(app).get(`/api/files/${uploaded.body.data.id}/content`).set('authorization', authorization).expect(200);
  assert.equal(content.text, 'secure file body');

  await request(app).delete(`/api/files/${uploaded.body.data.id}`).set('authorization', authorization).expect(204);
  await request(app).get(`/api/files/${uploaded.body.data.id}`).set('authorization', authorization).expect(404);
});
