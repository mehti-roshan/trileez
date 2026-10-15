import { Router } from 'express';
import { legacyDatabase } from '../db/legacy.js';
import { requireAuth, requireLegacyResourceAccess } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { relationshipIssue } from '../middleware/validate.js';
import { legacyBulkSchema, legacyMutationSchema, legacyRecordParamsSchema, legacyResourceParamsSchema } from '../config/requestValidation.js';
import type { LegacyResourceName } from '../config/resourceAccess.js';
import { database } from '../db/database.js';
import type { ResourceName } from '../types/entities.js';
import { auditService } from '../services/audit.js';
import { listQuerySchema, pageQuery } from '../db/query.js';

const legacyListConfig = { sortFields: ['createdAt'] as const, defaultSort: 'createdAt', defaultDirection: 'desc' as const };
const legacyListQuerySchema = listQuerySchema(legacyListConfig);

const router = Router();
const dedicatedRelations: Record<string, ResourceName> = { projectId: 'Project', taskId: 'Task', employeeId: 'Employee', userId: 'User' };
const legacyRelations: Record<string, LegacyResourceName> = { customerId: 'customers', invoiceId: 'invoices', contractId: 'contracts', leadId: 'leads', supplierId: 'suppliers', bankAccountId: 'bank-accounts' };

async function validateRelationships(organizationId: string, input: Record<string, unknown>): Promise<void> {
  const db = database.forOrganization(organizationId);
  for (const [field, resource] of Object.entries(dedicatedRelations)) if (input[field] && !await db.get(resource, String(input[field]))) throw relationshipIssue(`body.${field}`);
  for (const [field, resource] of Object.entries(legacyRelations)) if (input[field] && !await legacyDatabase.get(organizationId, resource, String(input[field]))) throw relationshipIssue(`body.${field}`);
}

router.get('/:resource', requireAuth, requireLegacyResourceAccess('read'), validateRequest({ params: legacyResourceParamsSchema, query: legacyListQuerySchema }), async (req, res, next) => {
  try { const resource = req.params.resource as string; res.json(await legacyDatabase.page(req.user!.organizationId, resource, pageQuery(req.validatedQuery || {}, legacyListConfig, `legacy:${resource}`))); } catch (error) { next(error); }
});

router.get('/:resource/:id', requireAuth, requireLegacyResourceAccess('read'), validateRequest({ params: legacyRecordParamsSchema }), async (req, res, next) => {
  try {
    const data = await legacyDatabase.get(req.user!.organizationId, req.params.resource as string, req.params.id as string);
    if (!data) return res.status(404).json({ error: 'Resource record not found' });
    if (req.params.resource === 'documents-v2') await auditService.record({ organizationId: req.user!.organizationId, actorId: req.user!.id,
      action: 'document.metadata_accessed', entityType: 'Legacy:documents-v2', entityId: data.id, metadata: { customerVisible: data.customerVisible } });
    res.json({ data });
  } catch (error) { next(error); }
});

router.post('/:resource/bulk', requireAuth, requireLegacyResourceAccess('create'), (req, res, next) => validateRequest({ params: legacyResourceParamsSchema, body: legacyBulkSchema(req.params.resource as LegacyResourceName) })(req, res, next), async (req, res, next) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    for (const item of items) await validateRelationships(req.user!.organizationId, item);
    const data = await legacyDatabase.bulkCreate(req.user!.organizationId, req.params.resource as string, items.map((item: Record<string, unknown>) => ({ ...item, createdBy: req.user!.id })));
    for (const row of data) await auditService.record({ organizationId: req.user!.organizationId, actorId: req.user!.id, action: `${req.params.resource}.created`, entityType: `Legacy:${req.params.resource}`, entityId: row.id, after: row });
    res.status(201).json({ data });
  } catch (error) { next(error); }
});

router.post('/:resource', requireAuth, requireLegacyResourceAccess('create'), (req, res, next) => validateRequest({ params: legacyResourceParamsSchema, body: legacyMutationSchema(req.params.resource as LegacyResourceName, false) })(req, res, next), async (req, res, next) => {
  try {
    await validateRelationships(req.user!.organizationId, req.body);
    const input = { ...req.body, createdBy: req.user!.id } as Record<string, unknown>;
    const data = await legacyDatabase.create(req.user!.organizationId, req.params.resource as string, input);
    await auditService.record({ organizationId: req.user!.organizationId, actorId: req.user!.id, action: `${req.params.resource}.created`, entityType: `Legacy:${req.params.resource}`, entityId: data.id, after: data });
    res.status(201).json({ data });
  } catch (error) { next(error); }
});

router.patch('/:resource/:id', requireAuth, requireLegacyResourceAccess('update'), (req, res, next) => validateRequest({ params: legacyRecordParamsSchema, body: legacyMutationSchema(req.params.resource as LegacyResourceName, true) })(req, res, next), async (req, res, next) => {
  try {
    const patch = { ...req.body } as Record<string, unknown>;
    await validateRelationships(req.user!.organizationId, patch);
    const current = await legacyDatabase.get(req.user!.organizationId, req.params.resource as string, req.params.id as string);
    if (!current) return res.status(404).json({ error: 'Resource record not found' });
    const data = await legacyDatabase.update(req.user!.organizationId, req.params.resource as string, req.params.id as string, patch);
    if (!data) return res.status(404).json({ error: 'Resource record not found' });
    await auditService.record({ organizationId: req.user!.organizationId, actorId: req.user!.id, action: `${req.params.resource}.updated`, entityType: `Legacy:${req.params.resource}`, entityId: data.id, before: current, after: data });
    res.json({ data });
  } catch (error) { next(error); }
});

router.delete('/:resource/:id', requireAuth, requireLegacyResourceAccess('delete'), validateRequest({ params: legacyRecordParamsSchema }), async (req, res, next) => {
  try {
    const current = await legacyDatabase.get(req.user!.organizationId, req.params.resource as string, req.params.id as string);
    const removed = await legacyDatabase.remove(req.user!.organizationId, req.params.resource as string, req.params.id as string);
    if (!removed) return res.status(404).json({ error: 'Resource record not found' });
    await auditService.record({ organizationId: req.user!.organizationId, actorId: req.user!.id, action: `${req.params.resource}.deleted`, entityType: `Legacy:${req.params.resource}`, entityId: req.params.id as string, before: current });
    res.status(204).send();
  } catch (error) { next(error); }
});

export default router;
