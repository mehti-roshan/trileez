import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initializeDatabase } from '../src/db/database.js';

await initializeDatabase();
const app = createApp();

async function login(email: string, password = 'Manager123!'): Promise<string> {
  const response = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  return `Bearer ${response.body.token}`;
}

test('chat routes require authentication', async () => {
  await request(app).get('/api/data/conversations').expect(401);
  await request(app).get('/api/data/messages').expect(401);
  await request(app).post('/api/data/messages').send({ conversationId: 'known', body: 'unauthorized' }).expect(401);
});

test('conversations and groups are visible only to their members', async () => {
  const manager = await login('manager@trileez.ir');
  const member = await login('member@trileez.ir');
  const admin = await login('admin@trileez.ir', 'Admin123!');
  const otherOrganization = await login('admin.org2@trileez.ir', 'Admin123!');
  const suffix = Date.now();

  const created = await request(app)
    .post('/api/data/conversations')
    .set('authorization', manager)
    .send({ id: `chat-conversation-${suffix}`, participantIds: ['u3'], unreadCount: 99, updatedAt: '2000-01-01T00:00:00.000Z' })
    .expect(201);
  const conversationId = created.body.data.id as string;
  assert.deepEqual(new Set(created.body.data.participantIds), new Set(['u2', 'u3']));
  assert.equal(created.body.data.createdBy, 'u2');
  assert.equal(created.body.data.unreadCount, 0);
  assert.notEqual(created.body.data.updatedAt, '2000-01-01T00:00:00.000Z');
  assert.equal(created.body.data.participantDetails.find((item: { id: string }) => item.id === 'u2')?.name, 'علی رضایی');
  assert.equal(created.body.data.participantDetails.find((item: { id: string }) => item.id === 'u3')?.name, 'مریم حسینی');

  const contacts = await request(app).get('/api/data/chat-contacts').set('authorization', member).expect(200);
  assert.ok(contacts.body.data.some((contact: { id: string; name: string }) => contact.id === 'u2' && contact.name === 'علی رضایی'));
  assert.ok(contacts.body.data.every((contact: Record<string, unknown>) => !('passwordHash' in contact) && !('email' in contact)));

  const duplicate = await request(app)
    .post('/api/data/conversations')
    .set('authorization', manager)
    .send({ participantIds: ['u3'] })
    .expect(200);
  assert.equal(duplicate.body.data.id, conversationId);

  const memberList = await request(app).get('/api/data/conversations').set('authorization', member).expect(200);
  assert.ok(memberList.body.data.some((row: { id: string }) => row.id === conversationId));
  const adminList = await request(app).get('/api/data/conversations').set('authorization', admin).expect(200);
  assert.ok(!adminList.body.data.some((row: { id: string }) => row.id === conversationId));
  await request(app).get(`/api/data/conversations/${conversationId}`).set('authorization', admin).expect(404);
  await request(app).patch(`/api/data/conversations/${conversationId}`).set('authorization', admin).send({ unreadCount: 0 }).expect(404);
  await request(app).delete(`/api/data/conversations/${conversationId}`).set('authorization', admin).expect(404);
  await request(app).get(`/api/data/conversations/${conversationId}`).set('authorization', otherOrganization).expect(404);

  await request(app)
    .patch(`/api/data/conversations/${conversationId}`)
    .set('authorization', member)
    .send({ participantIds: ['u1', 'u3'] })
    .expect(400);
  await request(app)
    .post('/api/data/conversations')
    .set('authorization', manager)
    .send({ participantIds: ['e2'] })
    .expect(400);

  const group = await request(app)
    .post('/api/data/chat-groups')
    .set('authorization', manager)
    .send({ id: `chat-group-${suffix}`, name: 'گروه امن', memberIds: ['u3'] })
    .expect(201);
  assert.deepEqual(new Set(group.body.data.memberIds), new Set(['u2', 'u3']));
  const memberGroups = await request(app).get('/api/data/chat-groups').set('authorization', member).expect(200);
  assert.ok(memberGroups.body.data.some((row: { id: string }) => row.id === group.body.data.id));
  const adminGroups = await request(app).get('/api/data/chat-groups').set('authorization', admin).expect(200);
  assert.ok(!adminGroups.body.data.some((row: { id: string }) => row.id === group.body.data.id));
  await request(app).post('/api/data/conversations/bulk').set('authorization', manager).send({ items: [] }).expect(405);

  await request(app).delete(`/api/data/chat-groups/${group.body.data.id}`).set('authorization', manager).expect(204);
  await request(app).delete(`/api/data/conversations/${conversationId}`).set('authorization', manager).expect(204);
});

test('message identity and timestamps come from the authenticated session', async () => {
  const manager = await login('manager@trileez.ir');
  const member = await login('member@trileez.ir');
  const admin = await login('admin@trileez.ir', 'Admin123!');
  const suffix = Date.now();

  const conversation = await request(app)
    .post('/api/data/conversations')
    .set('authorization', manager)
    .send({ id: `chat-message-conversation-${suffix}`, participantIds: ['u3'], title: `Message test ${suffix}` })
    .expect(201);
  const conversationId = conversation.body.data.id as string;

  const sent = await request(app)
    .post('/api/data/messages')
    .set('authorization', manager)
    .send({
      id: `chat-message-${suffix}`, conversationId, body: 'Backend-owned identity', senderId: 'u1',
      sentAt: '2000-01-01T00:00:00.000Z', read: false,
    })
    .expect(201);
  const messageId = sent.body.data.id as string;
  assert.equal(sent.body.data.senderId, 'u2');
  assert.equal(sent.body.data.createdBy, 'u2');
  assert.notEqual(sent.body.data.sentAt, '2000-01-01T00:00:00.000Z');
  assert.equal(sent.body.data.read, true);

  const memberMessages = await request(app).get('/api/data/messages').set('authorization', member).expect(200);
  const memberCopy = memberMessages.body.data.find((row: { id: string }) => row.id === messageId);
  assert.ok(memberCopy);
  assert.equal(memberCopy.senderId, 'u2');
  assert.equal(memberCopy.read, false);

  const adminMessages = await request(app).get('/api/data/messages').set('authorization', admin).expect(200);
  assert.ok(!adminMessages.body.data.some((row: { id: string }) => row.id === messageId));
  await request(app).get(`/api/data/messages/${messageId}`).set('authorization', admin).expect(404);
  await request(app).post('/api/data/messages').set('authorization', admin).send({ conversationId, body: 'intrusion' }).expect(404);
  await request(app).patch(`/api/data/messages/${messageId}`).set('authorization', admin).send({ read: true }).expect(404);
  await request(app).delete(`/api/data/messages/${messageId}`).set('authorization', admin).expect(404);

  const markedRead = await request(app)
    .patch(`/api/data/messages/${messageId}`)
    .set('authorization', member)
    .send({ read: true })
    .expect(200);
  assert.equal(markedRead.body.data.read, true);
  await request(app).patch(`/api/data/messages/${messageId}`).set('authorization', member).send({ body: 'forged edit' }).expect(403);
  await request(app).delete(`/api/data/messages/${messageId}`).set('authorization', member).expect(403);
  await request(app).patch(`/api/data/messages/${messageId}`).set('authorization', manager).send({ senderId: 'u1' }).expect(400);

  await request(app).delete(`/api/data/messages/${messageId}`).set('authorization', manager).expect(204);
  await request(app).delete(`/api/data/conversations/${conversationId}`).set('authorization', manager).expect(204);
});
