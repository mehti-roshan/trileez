import { Router } from 'express';
import { requireAuth, requireResourceAccess } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamsSchema } from '../config/requestValidation.js';
import {
  bankAccountSchemas, contractSchemas, customerSchemas, employeeContractSchemas, expenseSchemas, installmentSchemas,
  attendanceReviewSchema, attendanceSchemas, compensationInputQuerySchema, compensationSchemas, invoiceSchemas, paymentSchemas,
  payrollAdjustmentCreateSchema, payrollAdjustmentParamsSchema, payrollAdjustmentUpdateSchema, payrollDraftCreateSchema,
  payrollPaymentSchema, payrollTransitionSchema, projectSaleSchemas, supplierSchemas,
} from '../config/sensitiveValidation.js';
import { customerConfig } from '../services/customers.js';
import { financeConfigs } from '../services/finance.js';
import { compensationPayInputs, payrollConfigs, payrollWorkflow, reviewAttendance } from '../services/payroll.js';
import { employeeContractConfig } from '../services/employeeContracts.js';
import { SensitiveResourceService } from '../services/sensitiveResourceService.js';
import type { SensitiveResourceConfig } from '../services/sensitiveResourceService.js';
import type { ValueSchema } from '../middleware/validate.js';
import { sensitiveListConfig } from '../config/listQueries.js';
import { listQuerySchema, pageQuery } from '../db/query.js';

interface MutationSchemas {
  create: ValueSchema<Record<string, unknown>>;
  update: ValueSchema<Record<string, unknown>>;
  bulk: ValueSchema<Record<string, unknown>>;
}

function sensitiveRouter(config: SensitiveResourceConfig, schemas: MutationSchemas): Router {
  const router = Router();
  const service = new SensitiveResourceService(config);
  const listConfig = sensitiveListConfig(config.model);
  router.get('/', requireAuth, requireResourceAccess(config.resource, 'read'), validateRequest({ query: listQuerySchema(listConfig) }), async (req, res, next) => {
    try { res.json(await service.list(req.user!.organizationId, pageQuery(req.validatedQuery || {}, listConfig, config.resource))); } catch (error) { next(error); }
  });
  router.get('/:id', requireAuth, requireResourceAccess(config.resource, 'read'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
    try {
      const data = await service.get(req.user!.organizationId, req.params.id as string);
      if (!data) return res.status(404).json({ error: `${config.model} not found` });
      res.json({ data });
    } catch (error) { next(error); }
  });
  router.post('/bulk', requireAuth, requireResourceAccess(config.resource, 'create'), validateRequest({ body: schemas.bulk }), async (req, res, next) => {
    try {
      const data = await service.bulkCreate(req.user!.organizationId, req.user!.id, req.body.items, req.ip);
      res.status(201).json({ data });
    } catch (error) { next(error); }
  });
  router.post('/', requireAuth, requireResourceAccess(config.resource, 'create'), validateRequest({ body: schemas.create }), async (req, res, next) => {
    try {
      const data = await service.create(req.user!.organizationId, req.user!.id, req.body, req.ip);
      res.status(201).json({ data });
    } catch (error) { next(error); }
  });
  router.patch('/:id', requireAuth, requireResourceAccess(config.resource, 'update'), validateRequest({ params: idParamsSchema, body: schemas.update }), async (req, res, next) => {
    try {
      const data = await service.update(req.user!.organizationId, req.user!.id, req.params.id as string, req.body, req.ip);
      if (!data) return res.status(404).json({ error: `${config.model} not found` });
      res.json({ data });
    } catch (error) { next(error); }
  });
  router.delete('/:id', requireAuth, requireResourceAccess(config.resource, 'delete'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
    try {
      const removed = await service.remove(req.user!.organizationId, req.user!.id, req.params.id as string, req.ip);
      if (!removed) return res.status(404).json({ error: `${config.model} not found` });
      res.status(204).send();
    } catch (error) { next(error); }
  });
  return router;
}

const financeByResource = Object.fromEntries(financeConfigs.map((config) => [config.resource, config]));
const payrollByResource = Object.fromEntries(payrollConfigs.map((config) => [config.resource, config]));
const compensationRouter = sensitiveRouter(payrollByResource.compensations!, compensationSchemas);
compensationRouter.get('/:id/pay-inputs', requireAuth, requireResourceAccess('compensations', 'read'), validateRequest({ params: idParamsSchema, query: compensationInputQuerySchema }), async (req, res, next) => {
  try {
    const data = await compensationPayInputs(req.user!.organizationId, req.params.id as string, String(req.validatedQuery!.from), String(req.validatedQuery!.to));
    if (!data) return res.status(404).json({ error: 'EmploymentCompensation not found' });
    res.json({ data });
  } catch (error) { next(error); }
});
const attendanceRouter = sensitiveRouter(payrollByResource.attendance!, attendanceSchemas);
attendanceRouter.patch('/:id/review', requireAuth, requireResourceAccess('attendance', 'update'), validateRequest({ params: idParamsSchema, body: attendanceReviewSchema }), async (req, res, next) => {
  try {
    const data = await reviewAttendance(req.user!.organizationId, req.user!.id, req.params.id as string, req.body, req.ip);
    if (!data) return res.status(404).json({ error: 'AttendanceRecord not found' });
    res.json({ data });
  } catch (error) { next(error); }
});

const payrollRouter = Router();
const payrollListConfig = sensitiveListConfig('PayrollRecord');
payrollRouter.get('/', requireAuth, requireResourceAccess('payroll', 'read'), validateRequest({ query: listQuerySchema(payrollListConfig) }), async (req, res, next) => {
  try { res.json(await payrollWorkflow.list(req.user!.organizationId, pageQuery(req.validatedQuery || {}, payrollListConfig, 'payroll'))); } catch (error) { next(error); }
});
payrollRouter.post('/', requireAuth, requireResourceAccess('payroll', 'create'), validateRequest({ body: payrollDraftCreateSchema }), async (req, res, next) => {
  try { res.status(201).json({ data: await payrollWorkflow.createDraft(req.user!.organizationId, req.user!.id, req.body, req.ip) }); } catch (error) { next(error); }
});
payrollRouter.post('/:id/calculate', requireAuth, requireResourceAccess('payroll', 'update'), validateRequest({ params: idParamsSchema, body: payrollTransitionSchema }), async (req, res, next) => {
  try {
    const data = await payrollWorkflow.calculate(req.user!.organizationId, req.user!.id, req.params.id as string, req.body.reason, req.ip);
    if (!data) return res.status(404).json({ error: 'PayrollRecord not found' });
    res.json({ data });
  } catch (error) { next(error); }
});
payrollRouter.post('/:id/review', requireAuth, requireResourceAccess('payroll', 'update'), validateRequest({ params: idParamsSchema, body: payrollTransitionSchema }), async (req, res, next) => {
  try {
    const data = await payrollWorkflow.review(req.user!.organizationId, req.user!.id, req.params.id as string, req.body.reason, req.ip);
    if (!data) return res.status(404).json({ error: 'PayrollRecord not found' });
    res.json({ data });
  } catch (error) { next(error); }
});
payrollRouter.post('/:id/approve', requireAuth, requireResourceAccess('payroll', 'update'), validateRequest({ params: idParamsSchema, body: payrollTransitionSchema }), async (req, res, next) => {
  try {
    const data = await payrollWorkflow.approve(req.user!.organizationId, req.user!.id, req.params.id as string, req.body.reason, req.ip);
    if (!data) return res.status(404).json({ error: 'PayrollRecord not found' });
    res.json({ data });
  } catch (error) { next(error); }
});
payrollRouter.post('/:id/pay', requireAuth, requireResourceAccess('payroll', 'update'), validateRequest({ params: idParamsSchema, body: payrollPaymentSchema }), async (req, res, next) => {
  try {
    const data = await payrollWorkflow.pay(req.user!.organizationId, req.user!.id, req.params.id as string, req.body, req.ip);
    if (!data) return res.status(404).json({ error: 'PayrollRecord not found' });
    res.json({ data });
  } catch (error) { next(error); }
});
payrollRouter.get('/:id/payment-artifacts', requireAuth, requireResourceAccess('payroll', 'read'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const data = await payrollWorkflow.paymentArtifacts(req.user!.organizationId, req.params.id as string);
    if (!data) return res.status(404).json({ error: 'PayrollRecord not found' });
    res.json({ data });
  } catch (error) { next(error); }
});
payrollRouter.get('/:id/adjustments', requireAuth, requireResourceAccess('payroll', 'read'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const payroll = await payrollWorkflow.get(req.user!.organizationId, req.params.id as string);
    if (!payroll) return res.status(404).json({ error: 'PayrollRecord not found' });
    res.json({ data: await payrollWorkflow.adjustments(req.user!.organizationId, payroll.id) });
  } catch (error) { next(error); }
});
payrollRouter.post('/:id/adjustments', requireAuth, requireResourceAccess('payroll', 'update'), validateRequest({ params: idParamsSchema, body: payrollAdjustmentCreateSchema }), async (req, res, next) => {
  try {
    const data = await payrollWorkflow.createAdjustment(req.user!.organizationId, req.user!.id, req.params.id as string, req.body, req.ip);
    if (!data) return res.status(404).json({ error: 'PayrollRecord not found' });
    res.status(201).json({ data });
  } catch (error) { next(error); }
});
payrollRouter.patch('/:id/adjustments/:adjustmentId', requireAuth, requireResourceAccess('payroll', 'update'), validateRequest({ params: payrollAdjustmentParamsSchema, body: payrollAdjustmentUpdateSchema }), async (req, res, next) => {
  try {
    const data = await payrollWorkflow.updateAdjustment(req.user!.organizationId, req.user!.id, req.params.id as string, req.params.adjustmentId as string, req.body, req.ip);
    if (!data) return res.status(404).json({ error: 'Payroll adjustment not found' });
    res.json({ data });
  } catch (error) { next(error); }
});
payrollRouter.delete('/:id/adjustments/:adjustmentId', requireAuth, requireResourceAccess('payroll', 'update'), validateRequest({ params: payrollAdjustmentParamsSchema }), async (req, res, next) => {
  try {
    const removed = await payrollWorkflow.removeAdjustment(req.user!.organizationId, req.user!.id, req.params.id as string, req.params.adjustmentId as string, req.ip);
    if (!removed) return res.status(404).json({ error: 'Payroll adjustment not found' });
    res.status(204).send();
  } catch (error) { next(error); }
});
payrollRouter.get('/:id', requireAuth, requireResourceAccess('payroll', 'read'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const data = await payrollWorkflow.get(req.user!.organizationId, req.params.id as string);
    if (!data) return res.status(404).json({ error: 'PayrollRecord not found' });
    res.json({ data });
  } catch (error) { next(error); }
});
payrollRouter.delete('/:id', requireAuth, requireResourceAccess('payroll', 'delete'), validateRequest({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const removed = await payrollWorkflow.removeDraft(req.user!.organizationId, req.user!.id, req.params.id as string, req.ip);
    if (!removed) return res.status(404).json({ error: 'PayrollRecord not found' });
    res.status(204).send();
  } catch (error) { next(error); }
});

export const sensitiveResourceRoutes = [
  ['customers', sensitiveRouter(customerConfig, customerSchemas)],
  ['contracts', sensitiveRouter(financeByResource.contracts!, contractSchemas)],
  ['invoices', sensitiveRouter(financeByResource.invoices!, invoiceSchemas)],
  ['payments', sensitiveRouter(financeByResource.payments!, paymentSchemas)],
  ['installments', sensitiveRouter(financeByResource.installments!, installmentSchemas)],
  ['expenses', sensitiveRouter(financeByResource.expenses!, expenseSchemas)],
  ['bank-accounts', sensitiveRouter(financeByResource['bank-accounts']!, bankAccountSchemas)],
  ['suppliers', sensitiveRouter(financeByResource.suppliers!, supplierSchemas)],
  ['project-sales', sensitiveRouter(financeByResource['project-sales']!, projectSaleSchemas)],
  ['compensations', compensationRouter],
  ['attendance', attendanceRouter],
  ['payroll', payrollRouter],
  ['employee-contracts', sensitiveRouter(employeeContractConfig, employeeContractSchemas)],
] as const;
