import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initializeDatabase, database } from '../src/db/database.js';
import { objectStorage } from '../src/storage/objectStorage.js';
import { cleanupOrganizationFiles } from '../src/services/fileLifecycle.js';
import { storageQuota } from '../src/services/storageQuota.js';

await initializeDatabase();
const app = createApp();

async function login(email = 'admin@trileez.ir', password = 'Admin123!'): Promise<string> {
  const response = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  return `Bearer ${response.body.token}`;
}

test('uploads use detected content type, reject active content, and serve with anti-sniffing headers', async () => {
  const admin = await login();
  const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
  const uploaded = await request(app).post('/api/files').set('authorization', admin)
    .attach('file', pdf, { filename: 'renamed.txt', contentType: 'text/plain' }).expect(201);
  assert.equal(uploaded.body.data.declaredMimeType, 'text/plain');
  assert.equal(uploaded.body.data.detectedMimeType, 'application/pdf');
  assert.match(uploaded.body.data.sha256, /^[a-f0-9]{64}$/);

  const content = await request(app).get(`/api/files/${uploaded.body.data.id}/content`).query({ disposition: 'inline' }).set('authorization', admin).expect(200);
  assert.equal(content.headers['content-type'], 'application/pdf');
  assert.equal(content.headers['x-content-type-options'], 'nosniff');
  assert.match(content.headers['content-disposition'], /^inline;/);

  await request(app).post('/api/files').set('authorization', admin)
    .attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'harmless.txt', contentType: 'text/plain' }).expect(415);
  await request(app).post('/api/files').set('authorization', admin)
    .attach('file', Buffer.from([0x4d, 0x5a, 0x90, 0x00]), { filename: 'image.png', contentType: 'image/png' }).expect(415);
  await request(app).delete(`/api/files/${uploaded.body.data.id}`).set('authorization', admin).expect(204);
});

test('knowing a file ID does not grant project file metadata or download access', async () => {
  const admin = await login();
  const member = await login('member@trileez.ir', 'Manager123!');
  const project = await request(app).post('/api/projects').set('authorization', admin).send({ name: `Private file project ${Date.now()}` }).expect(201);
  const uploaded = await request(app).post('/api/files').set('authorization', admin).field('projectId', project.body.data.id)
    .attach('file', Buffer.from('project-only secret'), { filename: 'secret.txt', contentType: 'text/plain' }).expect(201);

  await request(app).get(`/api/files/${uploaded.body.data.id}`).set('authorization', member).expect(404);
  await request(app).get(`/api/files/${uploaded.body.data.id}/content`).set('authorization', member).expect(404);
  const listed = await request(app).get('/api/files').set('authorization', member).expect(200);
  assert.ok(!listed.body.data.some((file: { id: string }) => file.id === uploaded.body.data.id));

  await request(app).delete(`/api/files/${uploaded.body.data.id}`).set('authorization', admin).expect(204);
});

test('attachment validation enforces access and project relationships and safe deletion', async () => {
  const admin = await login();
  const suffix = Date.now();
  const projectA = await request(app).post('/api/projects').set('authorization', admin).send({ name: `Attachment A ${suffix}` }).expect(201);
  const projectB = await request(app).post('/api/projects').set('authorization', admin).send({ name: `Attachment B ${suffix}` }).expect(201);
  const uploaded = await request(app).post('/api/files').set('authorization', admin).field('projectId', projectA.body.data.id)
    .attach('file', Buffer.from('meeting attachment'), { filename: 'meeting.txt', contentType: 'text/plain' }).expect(201);

  const mismatch = await request(app).post('/api/meetings').set('authorization', admin).send({
    title: 'Wrong project attachment', startAt: '2026-10-10T10:00:00.000Z', durationMinutes: 30, organizerId: 'u1',
    projectId: projectB.body.data.id, attachments: [uploaded.body.data.id],
  }).expect(400);
  assert.ok(mismatch.body.issues.some((issue: { path: string }) => issue.path === 'body.attachments'));

  const meeting = await request(app).post('/api/meetings').set('authorization', admin).send({
    title: 'Correct attachment', startAt: '2026-10-10T10:00:00.000Z', durationMinutes: 30, organizerId: 'u1',
    projectId: projectA.body.data.id, attachments: [uploaded.body.data.id],
  }).expect(201);
  await request(app).delete(`/api/files/${uploaded.body.data.id}`).set('authorization', admin).expect(400);
  await request(app).delete(`/api/meetings/${meeting.body.data.id}`).set('authorization', admin).expect(204);
  await request(app).delete(`/api/files/${uploaded.body.data.id}`).set('authorization', admin).expect(204);
});

test('metadata integrity is checked before download', async () => {
  const admin = await login();
  const uploaded = await request(app).post('/api/files').set('authorization', admin)
    .attach('file', Buffer.from('integrity body'), { filename: 'integrity.txt', contentType: 'text/plain' }).expect(201);
  const db = database.forOrganization('org1');
  const original = await db.get('FileRecord', uploaded.body.data.id);
  await db.update('FileRecord', uploaded.body.data.id, { sizeBytes: Number(original!.sizeBytes) + 1 });
  await request(app).get(`/api/files/${uploaded.body.data.id}/content`).set('authorization', admin).expect(409);
  await db.update('FileRecord', uploaded.body.data.id, { sizeBytes: original!.sizeBytes });
  await request(app).delete(`/api/files/${uploaded.body.data.id}`).set('authorization', admin).expect(204);
});

test('organization quota reservations are atomic and recoverable', async () => {
  const organizationId = `quota-org-${Date.now()}`;
  await storageQuota.setLimit(organizationId, 6);
  const attempts = await Promise.allSettled([storageQuota.reserve(organizationId, 6), storageQuota.reserve(organizationId, 6)]);
  assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter((result) => result.status === 'rejected').length, 1);
  const reservation = attempts.find((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof storageQuota.reserve>>> => result.status === 'fulfilled')!.value;
  await storageQuota.commit(reservation);
  assert.equal((await storageQuota.get(organizationId)).usedBytes, 6);
  assert.equal((await storageQuota.get(organizationId)).reservedBytes, 0);
  await storageQuota.releaseUsed(organizationId, 6);
});

test('orphan cleanup removes untracked objects only after the grace window and reconciles quota', async () => {
  const objectKey = `org1/orphan-test/${Date.now()}.txt`;
  await objectStorage.put(objectKey, Buffer.from('orphan'), 'text/plain');
  assert.ok((await objectStorage.list('org1/orphan-test/')).some((object) => object.objectKey === objectKey));
  await cleanupOrganizationFiles('org1', new Date(Date.now() + 61 * 60_000));
  assert.ok(!(await objectStorage.list('org1/orphan-test/')).some((object) => object.objectKey === objectKey));
  const usage = await storageQuota.get('org1');
  assert.ok(usage.usedBytes >= 0);
  assert.equal(usage.reservedBytes, 0);
});
