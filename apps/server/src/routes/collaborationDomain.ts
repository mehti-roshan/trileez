import { Router } from 'express';
import { dedicatedMutationSchemas, idParamsSchema } from '../config/requestValidation.js';
import { requireAuth, requireResourceAccess } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { CollaborationDomainService } from '../services/collaborationDomain.js';
import { meetingListConfig, meetingListQuerySchema, projectEventListConfig, projectEventListQuerySchema } from '../config/listQueries.js';
import { pageQuery } from '../db/query.js';
import { database } from '../db/database.js';

const service = new CollaborationDomainService();

export const meetingRoutes = Router();
const meetingSchemas = dedicatedMutationSchemas.Meeting!;
meetingRoutes.get('/', requireAuth, requireResourceAccess('meetings', 'read'), validateRequest({ query: meetingListQuerySchema }), async (req, res, next) => { try { res.json(await database.forOrganization(req.user!.organizationId).page('Meeting', pageQuery(req.validatedQuery || {}, meetingListConfig, 'meetings'))); } catch (error) { next(error); } });
meetingRoutes.get('/:id', requireAuth, requireResourceAccess('meetings', 'read'), validateRequest({ params: idParamsSchema }), async (req, res, next) => { try { const data = await service.getMeeting(req.user!.organizationId, req.params.id as string); if (!data) return res.status(404).json({ error: 'Meeting not found' }); res.json({ data }); } catch (error) { next(error); } });
meetingRoutes.post('/', requireAuth, requireResourceAccess('meetings', 'create'), validateRequest({ body: meetingSchemas.create }), async (req, res, next) => { try { res.status(201).json({ data: await service.createMeeting(req.user!.organizationId, req.user!.id, req.body, req.ip) }); } catch (error) { next(error); } });
meetingRoutes.patch('/:id', requireAuth, requireResourceAccess('meetings', 'update'), validateRequest({ params: idParamsSchema, body: meetingSchemas.update }), async (req, res, next) => { try { const data = await service.updateMeeting(req.user!.organizationId, req.user!.id, req.params.id as string, req.body, req.ip); if (!data) return res.status(404).json({ error: 'Meeting not found' }); res.json({ data }); } catch (error) { next(error); } });
meetingRoutes.delete('/:id', requireAuth, requireResourceAccess('meetings', 'delete'), validateRequest({ params: idParamsSchema }), async (req, res, next) => { try { if (!await service.removeMeeting(req.user!.organizationId, req.user!.id, req.params.id as string, req.ip)) return res.status(404).json({ error: 'Meeting not found' }); res.status(204).send(); } catch (error) { next(error); } });

export const projectEventRoutes = Router();
const eventSchemas = dedicatedMutationSchemas.ProjectEvent!;
projectEventRoutes.get('/', requireAuth, requireResourceAccess('project-events', 'read'), validateRequest({ query: projectEventListQuerySchema }), async (req, res, next) => { try { res.json(await database.forOrganization(req.user!.organizationId).page('ProjectEvent', pageQuery(req.validatedQuery || {}, projectEventListConfig, 'project-events'))); } catch (error) { next(error); } });
projectEventRoutes.get('/:id', requireAuth, requireResourceAccess('project-events', 'read'), validateRequest({ params: idParamsSchema }), async (req, res, next) => { try { const data = await service.getEvent(req.user!.organizationId, req.params.id as string); if (!data) return res.status(404).json({ error: 'Project event not found' }); res.json({ data }); } catch (error) { next(error); } });
projectEventRoutes.post('/', requireAuth, requireResourceAccess('project-events', 'create'), validateRequest({ body: eventSchemas.create }), async (req, res, next) => { try { res.status(201).json({ data: await service.createEvent(req.user!.organizationId, req.user!.id, req.body, req.ip) }); } catch (error) { next(error); } });
projectEventRoutes.patch('/:id', requireAuth, requireResourceAccess('project-events', 'update'), validateRequest({ params: idParamsSchema, body: eventSchemas.update }), async (req, res, next) => { try { const data = await service.updateEvent(req.user!.organizationId, req.user!.id, req.params.id as string, req.body, req.ip); if (!data) return res.status(404).json({ error: 'Project event not found' }); res.json({ data }); } catch (error) { next(error); } });
projectEventRoutes.delete('/:id', requireAuth, requireResourceAccess('project-events', 'delete'), validateRequest({ params: idParamsSchema }), async (req, res, next) => { try { if (!await service.removeEvent(req.user!.organizationId, req.user!.id, req.params.id as string, req.ip)) return res.status(404).json({ error: 'Project event not found' }); res.status(204).send(); } catch (error) { next(error); } });
