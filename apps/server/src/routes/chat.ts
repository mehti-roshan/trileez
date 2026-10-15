import { Router, type RequestHandler } from 'express';
import { idParamsSchema } from '../config/requestValidation.js';
import { listQuerySchema, pageQuery } from '../db/query.js';
import { requireAuth, requireResourceAccess } from '../middleware/auth.js';
import { validateRequest, v } from '../middleware/validate.js';
import { chatService } from '../services/chat.js';

const router = Router();
const listConfig = { sortFields: ['createdAt'] as const, defaultSort: 'createdAt', defaultDirection: 'desc' as const };
const listSchema = listQuerySchema(listConfig);
const protectedFields = ['organizationId', 'createdBy', 'updatedBy', 'permissions', 'ownership'] as const;
const optionalId = v.optional(v.id);
const optionalText = v.optional(v.string({ min: 1, max: 10_000 }));
const optionalShort = v.optional(v.string({ min: 1, max: 250 }));
const attachments = v.optional(v.array(v.jsonObject, { max: 20 }));

const conversationCreateSchema = v.object({
  id: optionalId, participantIds: v.array(v.id, { max: 100 }), title: optionalShort, groupId: optionalId,
  projectId: optionalId, unreadCount: v.optional(v.number({ min: 0, integer: true })), updatedAt: v.optional(v.date),
}, { strip: protectedFields });
const conversationUpdateSchema = v.object({
  title: optionalShort, groupId: optionalId, projectId: optionalId, unreadCount: v.optional(v.number({ min: 0, integer: true })),
}, { strip: protectedFields, atLeastOne: true });

const messageCreateSchema = v.object({
  id: optionalId, conversationId: v.id, body: optionalText, attachments,
  // Accepted for backward-compatible clients, but ignored in favor of the authenticated actor and server clock.
  senderId: optionalId, sentAt: v.optional(v.date), read: v.optional(v.boolean()),
}, { strip: protectedFields });
const messageUpdateSchema = v.object({
  body: optionalText, attachments, read: v.optional(v.boolean()),
}, { strip: protectedFields, atLeastOne: true });

const groupCreateSchema = v.object({
  id: optionalId, name: v.string({ min: 1, max: 250 }), memberIds: v.array(v.id, { max: 100 }),
  projectId: optionalId, isDefault: v.optional(v.boolean()), createdAt: v.optional(v.date),
}, { strip: protectedFields });
const groupUpdateSchema = v.object({
  name: optionalShort, memberIds: v.optional(v.array(v.id, { max: 100 })), projectId: optionalId, isDefault: v.optional(v.boolean()),
}, { strip: protectedFields, atLeastOne: true });

const rejectBulk: RequestHandler = (_req, res) => { res.status(405).json({ error: 'Bulk chat mutations are not supported', code: 'METHOD_NOT_ALLOWED' }); };

router.get('/chat-contacts', requireAuth, requireResourceAccess('conversations', 'read'), async (req, res, next) => {
  try {
    const data = await chatService.listContacts(req.user!);
    res.json({ data, page: { limit: data.length, hasMore: false } });
  } catch (error) { next(error); }
});

router.post('/conversations/bulk', requireAuth, requireResourceAccess('conversations', 'create'), rejectBulk);
router.get('/conversations', requireAuth, requireResourceAccess('conversations', 'read'), validateRequest({ query: listSchema }), async (req, res, next) => {
  try { res.json(await chatService.listConversations(req.user!, pageQuery(req.validatedQuery || {}, listConfig, `chat:conversations:${req.user!.id}`))); } catch (error) { next(error); }
});
router.get('/conversations/:id', requireAuth, requireResourceAccess('conversations', 'read'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try { res.json({ data: await chatService.getConversation(req.user!, req.params.id as string) }); } catch (error) { next(error); }
});
router.post('/conversations', requireAuth, requireResourceAccess('conversations', 'create'), validateRequest({ body: conversationCreateSchema }), async (req, res, next) => {
  try { const result = await chatService.createConversation(req.user!, req.body); res.status(result.created ? 201 : 200).json({ data: result.data }); } catch (error) { next(error); }
});
router.patch('/conversations/:id', requireAuth, requireResourceAccess('conversations', 'update'), validateRequest({ params: idParamsSchema, body: conversationUpdateSchema }), async (req, res, next) => {
  try { res.json({ data: await chatService.updateConversation(req.user!, req.params.id as string, req.body) }); } catch (error) { next(error); }
});
router.delete('/conversations/:id', requireAuth, requireResourceAccess('conversations', 'delete'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try { await chatService.deleteConversation(req.user!, req.params.id as string); res.status(204).send(); } catch (error) { next(error); }
});

router.post('/messages/bulk', requireAuth, requireResourceAccess('messages', 'create'), rejectBulk);
router.get('/messages', requireAuth, requireResourceAccess('messages', 'read'), validateRequest({ query: listSchema }), async (req, res, next) => {
  try { res.json(await chatService.listMessages(req.user!, pageQuery(req.validatedQuery || {}, listConfig, `chat:messages:${req.user!.id}`))); } catch (error) { next(error); }
});
router.get('/messages/:id', requireAuth, requireResourceAccess('messages', 'read'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try { res.json({ data: await chatService.getMessage(req.user!, req.params.id as string) }); } catch (error) { next(error); }
});
router.post('/messages', requireAuth, requireResourceAccess('messages', 'create'), validateRequest({ body: messageCreateSchema }), async (req, res, next) => {
  try { res.status(201).json({ data: await chatService.createMessage(req.user!, req.body) }); } catch (error) { next(error); }
});
router.patch('/messages/:id', requireAuth, requireResourceAccess('messages', 'update'), validateRequest({ params: idParamsSchema, body: messageUpdateSchema }), async (req, res, next) => {
  try { res.json({ data: await chatService.updateMessage(req.user!, req.params.id as string, req.body) }); } catch (error) { next(error); }
});
router.delete('/messages/:id', requireAuth, requireResourceAccess('messages', 'delete'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try { await chatService.deleteMessage(req.user!, req.params.id as string); res.status(204).send(); } catch (error) { next(error); }
});

router.post('/chat-groups/bulk', requireAuth, requireResourceAccess('chat-groups', 'create'), rejectBulk);
router.get('/chat-groups', requireAuth, requireResourceAccess('chat-groups', 'read'), validateRequest({ query: listSchema }), async (req, res, next) => {
  try { res.json(await chatService.listGroups(req.user!, pageQuery(req.validatedQuery || {}, listConfig, `chat:groups:${req.user!.id}`))); } catch (error) { next(error); }
});
router.get('/chat-groups/:id', requireAuth, requireResourceAccess('chat-groups', 'read'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try { res.json({ data: await chatService.getGroup(req.user!, req.params.id as string) }); } catch (error) { next(error); }
});
router.post('/chat-groups', requireAuth, requireResourceAccess('chat-groups', 'create'), validateRequest({ body: groupCreateSchema }), async (req, res, next) => {
  try { res.status(201).json({ data: await chatService.createGroup(req.user!, req.body) }); } catch (error) { next(error); }
});
router.patch('/chat-groups/:id', requireAuth, requireResourceAccess('chat-groups', 'update'), validateRequest({ params: idParamsSchema, body: groupUpdateSchema }), async (req, res, next) => {
  try { res.json({ data: await chatService.updateGroup(req.user!, req.params.id as string, req.body) }); } catch (error) { next(error); }
});
router.delete('/chat-groups/:id', requireAuth, requireResourceAccess('chat-groups', 'delete'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try { await chatService.deleteGroup(req.user!, req.params.id as string); res.status(204).send(); } catch (error) { next(error); }
});

export default router;
