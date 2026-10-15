import { database } from '../db/database.js';
import { legacyDatabase } from '../db/legacy.js';
import type { DatabasePageOptions, PageResult } from '../db/query.js';
import { relationshipIssue, RequestValidationError } from '../middleware/validate.js';
import type { AppRecord, UserRecord } from '../types/entities.js';
import { id } from '../utils/id.js';
import { auditService } from './audit.js';
import { assertAttachableFile } from './fileAccess.js';

class ChatAccessError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 403) {
    super(message);
    this.name = 'ChatAccessError';
    this.statusCode = statusCode;
  }
}

type ChatInput = Record<string, unknown>;

function stringIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function isParticipant(conversation: AppRecord | undefined, userId: string): conversation is AppRecord {
  return Boolean(conversation && stringIds(conversation.participantIds).includes(userId));
}

function isGroupMember(group: AppRecord | undefined, userId: string): group is AppRecord {
  return Boolean(group && stringIds(group.memberIds).includes(userId));
}

function notFound(): ChatAccessError {
  return new ChatAccessError('Chat record not found', 404);
}

function forbidden(message: string): ChatAccessError {
  return new ChatAccessError(message, 403);
}

function attachmentSize(sizeBytes: unknown): string {
  const bytes = typeof sizeBytes === 'number' && Number.isFinite(sizeBytes) ? sizeBytes : 0;
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('fa-IR')} کیلوبایت`;
}

async function validateUsers(user: UserRecord, ids: string[], path: string): Promise<void> {
  const db = database.forOrganization(user.organizationId);
  for (const [index, userId] of ids.entries()) {
    const participant = await db.get<UserRecord>('User', userId);
    if (!participant || !participant.isActive) throw relationshipIssue(`${path}.${index}`, 'Chat participant is not an active user in this organization');
  }
}

async function validateProject(user: UserRecord, projectId: unknown): Promise<void> {
  if (typeof projectId === 'string' && !await database.forOrganization(user.organizationId).get('Project', projectId)) {
    throw relationshipIssue('body.projectId');
  }
}

async function conversationFor(user: UserRecord, conversationId: string): Promise<AppRecord> {
  const conversation = await legacyDatabase.get(user.organizationId, 'conversations', conversationId);
  if (!isParticipant(conversation, user.id)) throw notFound();
  return conversation;
}

async function groupFor(user: UserRecord, groupId: string): Promise<AppRecord> {
  const group = await legacyDatabase.get(user.organizationId, 'chat-groups', groupId);
  if (!isGroupMember(group, user.id)) throw notFound();
  return group;
}

async function accessibleConversations(user: UserRecord): Promise<AppRecord[]> {
  return (await legacyDatabase.list(user.organizationId, 'conversations')).filter((row) => isParticipant(row, user.id));
}

function messageForUser(message: AppRecord, userId: string): AppRecord {
  const readBy = stringIds(message.readBy);
  return { ...message, read: message.senderId === userId || readBy.includes(userId) || (readBy.length === 0 && message.read === true) };
}

async function chatContacts(user: UserRecord): Promise<AppRecord[]> {
  const db = database.forOrganization(user.organizationId);
  const [users, employees] = await Promise.all([db.list<UserRecord>('User'), db.list('Employee')]);
  return users.filter((candidate) => candidate.isActive && candidate.role !== 'customer').map((candidate) => {
    const employee = employees.find((row) => row.userId === candidate.id);
    return {
      id: candidate.id, organizationId: user.organizationId, name: candidate.name, title: candidate.title,
      status: candidate.status, employeeId: employee?.id, personnelCode: employee?.personnelCode,
      jobTitle: employee?.jobTitle, department: employee?.department,
    };
  });
}

function conversationForDisplay(conversation: AppRecord, contacts: AppRecord[]): AppRecord {
  const details = stringIds(conversation.participantIds).map((participantId) => contacts.find((contact) => contact.id === participantId))
    .filter((contact): contact is AppRecord => Boolean(contact));
  return { ...conversation, participantDetails: details };
}

async function normalizedAttachments(user: UserRecord, attachments: unknown, conversationId: string): Promise<Record<string, unknown>[]> {
  if (!Array.isArray(attachments)) return [];
  const output: Record<string, unknown>[] = [];
  for (const [index, item] of attachments.entries()) {
    const fileId = item && typeof item === 'object' && typeof (item as Record<string, unknown>).id === 'string'
      ? String((item as Record<string, unknown>).id)
      : '';
    if (!fileId) throw relationshipIssue(`body.attachments.${index}.id`, 'Attachment must reference an uploaded file');
    const file = await assertAttachableFile(user.organizationId, user.id, fileId, `body.attachments.${index}.id`, {});
    if (file.contextKind && (file.contextKind !== 'conversation' || file.contextId !== conversationId)) {
      throw relationshipIssue(`body.attachments.${index}.id`, 'Attachment belongs to a different context');
    }
    output.push({
      id: file.id, name: file.name, type: file.mimeType, size: attachmentSize(file.sizeBytes), uploadedBy: file.uploadedBy,
      uploadedAt: file.createdAt, source: 'seaweedfs', projectId: file.projectId, customerId: file.customerId, customerVisible: false,
    });
  }
  return output;
}

async function record(action: string, user: UserRecord, entityType: string, entityId: string, before?: unknown, after?: unknown): Promise<void> {
  await auditService.record({ organizationId: user.organizationId, actorId: user.id, action, entityType, entityId, before, after });
}

export const chatService = {
  async listConversations(user: UserRecord, options: DatabasePageOptions): Promise<PageResult<AppRecord>> {
    options.accessFilter = { 'payload.participantIds': user.id };
    options.accessPredicate = (row) => isParticipant(row as AppRecord, user.id);
    const page = await legacyDatabase.page(user.organizationId, 'conversations', options);
    const contacts = await chatContacts(user);
    return { ...page, data: page.data.map((conversation) => conversationForDisplay(conversation, contacts)) };
  },

  async listContacts(user: UserRecord): Promise<AppRecord[]> {
    return chatContacts(user);
  },

  async getConversation(user: UserRecord, conversationId: string): Promise<AppRecord> {
    return conversationForDisplay(await conversationFor(user, conversationId), await chatContacts(user));
  },

  async createConversation(user: UserRecord, input: ChatInput): Promise<{ data: AppRecord; created: boolean }> {
    const participantIds = [...new Set([...stringIds(input.participantIds), user.id])];
    if (participantIds.length < 2) throw new RequestValidationError([{ location: 'body', path: 'body.participantIds', code: 'too_small', message: 'A conversation requires at least two participants' }]);
    await validateUsers(user, participantIds, 'body.participantIds');
    await validateProject(user, input.projectId);
    const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim() : undefined;
    if (!title && participantIds.length === 2) {
      const existing = (await accessibleConversations(user)).find((row) => {
        const members = stringIds(row.participantIds);
        return !row.title && members.length === 2 && participantIds.every((participantId) => members.includes(participantId));
      });
      if (existing) return { data: conversationForDisplay(existing, await chatContacts(user)), created: false };
    }
    const now = new Date().toISOString();
    const data = await legacyDatabase.create(user.organizationId, 'conversations', {
      ...(typeof input.id === 'string' ? { id: input.id } : {}), participantIds, ...(title ? { title } : {}),
      ...(typeof input.groupId === 'string' ? { groupId: input.groupId } : {}),
      ...(typeof input.projectId === 'string' ? { projectId: input.projectId } : {}),
      unreadCount: 0, updatedAt: now, createdAt: now, createdBy: user.id,
    });
    await record('chat.conversation_created', user, 'Legacy:conversations', data.id, undefined, data);
    return { data: conversationForDisplay(data, await chatContacts(user)), created: true };
  },

  async updateConversation(user: UserRecord, conversationId: string, input: ChatInput): Promise<AppRecord> {
    const current = await conversationFor(user, conversationId);
    if (('title' in input || 'projectId' in input) && current.createdBy !== user.id && user.role !== 'admin') throw forbidden('Only the conversation creator can change shared conversation details');
    await validateProject(user, input.projectId);
    const patch: ChatInput = {};
    for (const key of ['title', 'groupId', 'projectId', 'unreadCount'] as const) if (key in input) patch[key] = input[key];
    const data = await legacyDatabase.update(user.organizationId, 'conversations', conversationId, patch);
    if (!data) throw notFound();
    await record('chat.conversation_updated', user, 'Legacy:conversations', data.id, current, data);
    return conversationForDisplay(data, await chatContacts(user));
  },

  async deleteConversation(user: UserRecord, conversationId: string): Promise<void> {
    const current = await conversationFor(user, conversationId);
    if (current.createdBy !== user.id && user.role !== 'admin') throw forbidden('Only the conversation creator can delete this conversation');
    const messages = (await legacyDatabase.list(user.organizationId, 'messages')).filter((row) => row.conversationId === conversationId);
    for (const message of messages) await legacyDatabase.remove(user.organizationId, 'messages', message.id);
    await legacyDatabase.remove(user.organizationId, 'conversations', conversationId);
    await record('chat.conversation_deleted', user, 'Legacy:conversations', conversationId, current);
  },

  async listMessages(user: UserRecord, options: DatabasePageOptions): Promise<PageResult<AppRecord>> {
    const conversationIds = (await accessibleConversations(user)).map((row) => row.id);
    if (!conversationIds.length) return { data: [], page: { limit: options.limit, hasMore: false } };
    options.accessFilter = { 'payload.conversationId': { $in: conversationIds } };
    options.accessPredicate = (row) => conversationIds.includes(String(row.conversationId));
    const page = await legacyDatabase.page(user.organizationId, 'messages', options);
    return { ...page, data: page.data.map((message) => messageForUser(message, user.id)) };
  },

  async getMessage(user: UserRecord, messageId: string): Promise<AppRecord> {
    const message = await legacyDatabase.get(user.organizationId, 'messages', messageId);
    if (!message || typeof message.conversationId !== 'string') throw notFound();
    await conversationFor(user, message.conversationId);
    return messageForUser(message, user.id);
  },

  async createMessage(user: UserRecord, input: ChatInput): Promise<AppRecord> {
    const conversationId = String(input.conversationId || '');
    const conversation = await conversationFor(user, conversationId);
    const body = typeof input.body === 'string' ? input.body.trim() : '';
    const attachments = await normalizedAttachments(user, input.attachments, conversationId);
    if (!body && !attachments.length) throw new RequestValidationError([{ location: 'body', path: 'body', code: 'empty_message', message: 'A message requires text or an attachment' }]);
    const now = new Date().toISOString();
    const data = await legacyDatabase.create(user.organizationId, 'messages', {
      ...(typeof input.id === 'string' ? { id: input.id } : {}), conversationId, senderId: user.id,
      body: body || 'پیوست ارسال شد.', sentAt: now, readBy: [user.id], read: true, attachments,
      createdAt: now, createdBy: user.id,
    });
    await legacyDatabase.update(user.organizationId, 'conversations', conversationId, { updatedAt: now });
    const recipientIds = stringIds(conversation.participantIds).filter((participantId) => participantId !== user.id);
    await Promise.allSettled(recipientIds.map((recipientId) => legacyDatabase.create(user.organizationId, 'notifications', {
      id: id('notification'), title: `پیام جدید از ${user.name}`, body: body || 'یک پیوست برای شما ارسال شد.', createdAt: now,
      read: false, type: 'chat', conversationId, projectId: conversation.projectId, recipientId, actorId: user.id,
      entityType: 'conversation', entityId: conversationId, channel: 'in_app', createdBy: user.id,
    })));
    await record('chat.message_sent', user, 'Legacy:messages', data.id, undefined, { id: data.id, conversationId, senderId: user.id, sentAt: now, attachmentIds: attachments.map((item) => item.id) });
    return messageForUser(data, user.id);
  },

  async updateMessage(user: UserRecord, messageId: string, input: ChatInput): Promise<AppRecord> {
    const current = await legacyDatabase.get(user.organizationId, 'messages', messageId);
    if (!current || typeof current.conversationId !== 'string') throw notFound();
    const conversation = await conversationFor(user, current.conversationId);
    const contentChange = 'body' in input || 'attachments' in input;
    if (contentChange && current.senderId !== user.id) throw forbidden('Only the sender can edit message content');
    const patch: ChatInput = {};
    if ('body' in input) patch.body = String(input.body || '').trim();
    if ('attachments' in input) patch.attachments = await normalizedAttachments(user, input.attachments, current.conversationId);
    if ('read' in input) {
      const readBy = new Set(stringIds(current.readBy));
      if (input.read === true) readBy.add(user.id); else readBy.delete(user.id);
      patch.readBy = [...readBy];
      patch.read = stringIds(conversation.participantIds).every((participantId) => readBy.has(participantId));
    }
    if (contentChange && !String(patch.body ?? current.body ?? '').trim() && !((patch.attachments ?? current.attachments) as unknown[] | undefined)?.length) {
      throw new RequestValidationError([{ location: 'body', path: 'body', code: 'empty_message', message: 'A message requires text or an attachment' }]);
    }
    const data = await legacyDatabase.update(user.organizationId, 'messages', messageId, patch);
    if (!data) throw notFound();
    await record(contentChange ? 'chat.message_edited' : 'chat.message_read_state_changed', user, 'Legacy:messages', messageId, current, data);
    return messageForUser(data, user.id);
  },

  async deleteMessage(user: UserRecord, messageId: string): Promise<void> {
    const current = await legacyDatabase.get(user.organizationId, 'messages', messageId);
    if (!current || typeof current.conversationId !== 'string') throw notFound();
    await conversationFor(user, current.conversationId);
    if (current.senderId !== user.id) throw forbidden('Only the sender can delete a message');
    await legacyDatabase.remove(user.organizationId, 'messages', messageId);
    await record('chat.message_deleted', user, 'Legacy:messages', messageId, { id: current.id, conversationId: current.conversationId, senderId: current.senderId, sentAt: current.sentAt });
  },

  async listGroups(user: UserRecord, options: DatabasePageOptions): Promise<PageResult<AppRecord>> {
    options.accessFilter = { 'payload.memberIds': user.id };
    options.accessPredicate = (row) => isGroupMember(row as AppRecord, user.id);
    return legacyDatabase.page(user.organizationId, 'chat-groups', options);
  },

  async getGroup(user: UserRecord, groupId: string): Promise<AppRecord> {
    return groupFor(user, groupId);
  },

  async createGroup(user: UserRecord, input: ChatInput): Promise<AppRecord> {
    const memberIds = [...new Set([...stringIds(input.memberIds), user.id])];
    await validateUsers(user, memberIds, 'body.memberIds');
    await validateProject(user, input.projectId);
    const now = new Date().toISOString();
    const data = await legacyDatabase.create(user.organizationId, 'chat-groups', {
      ...(typeof input.id === 'string' ? { id: input.id } : {}), name: input.name, memberIds,
      ...(typeof input.projectId === 'string' ? { projectId: input.projectId } : {}), isDefault: Boolean(input.isDefault),
      createdAt: now, createdBy: user.id,
    });
    await record('chat.group_created', user, 'Legacy:chat-groups', data.id, undefined, data);
    return data;
  },

  async updateGroup(user: UserRecord, groupId: string, input: ChatInput): Promise<AppRecord> {
    const current = await groupFor(user, groupId);
    if (current.createdBy !== user.id && user.role !== 'admin') throw forbidden('Only the group creator can update this group');
    const patch: ChatInput = {};
    if ('memberIds' in input) {
      const memberIds = [...new Set([...stringIds(input.memberIds), user.id])];
      await validateUsers(user, memberIds, 'body.memberIds');
      patch.memberIds = memberIds;
    }
    if ('projectId' in input) await validateProject(user, input.projectId);
    for (const key of ['name', 'projectId', 'isDefault'] as const) if (key in input) patch[key] = input[key];
    const data = await legacyDatabase.update(user.organizationId, 'chat-groups', groupId, patch);
    if (!data) throw notFound();
    await record('chat.group_updated', user, 'Legacy:chat-groups', data.id, current, data);
    return data;
  },

  async deleteGroup(user: UserRecord, groupId: string): Promise<void> {
    const current = await groupFor(user, groupId);
    if (current.createdBy !== user.id && user.role !== 'admin') throw forbidden('Only the group creator can delete this group');
    await legacyDatabase.remove(user.organizationId, 'chat-groups', groupId);
    await record('chat.group_deleted', user, 'Legacy:chat-groups', groupId, current);
  },
};
