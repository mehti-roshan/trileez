import { protectedInputFields } from './requestValidation.js';
import { v } from '../middleware/validate.js';
import type { ValueSchema } from '../middleware/validate.js';

const text = v.string({ max: 10_000 });
const short = v.string({ max: 500 });
const ids = v.array(v.id, { max: 250 });
const strings = v.array(v.string({ min: 1, max: 500 }), { max: 250 });

function mutations(fields: Record<string, ValueSchema<unknown>>, required: readonly string[], immutable: readonly string[] = []) {
  const createShape = Object.fromEntries(Object.entries(fields).map(([key, fieldSchema]) => [key, required.includes(key) ? fieldSchema : v.optional(fieldSchema)]));
  const updateShape = Object.fromEntries(Object.entries(fields).filter(([key]) => key !== 'id' && !immutable.includes(key)).map(([key, fieldSchema]) => [key, v.optional(fieldSchema)]));
  return {
    create: v.object(createShape, { strip: protectedInputFields }),
    update: v.object(updateShape, { strip: [...protectedInputFields, 'id', ...immutable], atLeastOne: true }),
    bulk: v.object({ items: v.array(v.object(createShape, { strip: protectedInputFields }), { max: 1000 }) }),
  };
}

export const phaseSchemas = mutations({
  id: v.id, projectId: v.id, title: v.string({ min: 1, max: 500 }), status: v.string({ values: ['planned', 'in_progress', 'completed', 'on_hold'] }),
  startDate: v.date, endDate: v.date, managerId: v.id, description: text, customerVisible: v.boolean(), plannedHours: v.number({ min: 0 }),
  progress: v.number({ min: 0, max: 100 }), estimatedHours: v.number({ min: 0 }), actualHours: v.number({ min: 0 }),
}, ['projectId', 'title'], ['projectId']);

export const roleSchemas = mutations({
  id: v.id, projectId: v.id, templateId: v.id, name: v.string({ min: 1, max: 250 }), description: text,
  responsibilities: strings, objectives: strings, requiredSkills: strings, expectedHours: v.number({ min: 0 }), customerVisible: v.boolean(),
}, ['projectId', 'name'], ['projectId']);

export const activitySchemas = mutations({
  id: v.id, projectId: v.id, roleId: v.id, title: v.string({ min: 1, max: 500 }), description: text, objective: text,
  expectedHours: v.number({ min: 0 }), customerVisible: v.boolean(),
}, ['projectId', 'roleId', 'title'], ['projectId']);

export const memberSchemas = mutations({
  id: v.id, projectId: v.id, personId: v.id, role: short, roleIds: ids, status: v.string({ values: ['active', 'inactive'] }),
  joinedAt: v.date, leftAt: v.date, hourlyCost: v.number({ min: 0 }), responsibilities: text,
}, ['projectId', 'personId', 'joinedAt'], ['projectId', 'personId']);

export const timeEntrySchemas = mutations({
  id: v.id, employeeId: v.id, projectId: v.id, taskId: v.id, date: v.date, hours: v.number({ min: 0.01, max: 24 }),
  startTime: short, endTime: short, hourlyRate: v.number({ min: 0 }), calculatedCost: v.number({ min: 0 }), billable: v.boolean(),
  billingStatus: short, status: v.string({ values: ['approved', 'pending_review', 'review_again', 'suspended', 'rejected'] }),
  customerVisible: v.boolean(), description: text,
}, ['employeeId', 'projectId', 'taskId', 'date', 'hours'], ['projectId', 'taskId', 'employeeId', 'status', 'hourlyRate', 'calculatedCost', 'billingStatus']);

export const timeEntryReviewSchema = v.object({
  status: v.string({ values: ['approved', 'pending_review', 'review_again', 'suspended', 'rejected'] }),
  reason: v.optional(v.string({ max: 2_000 })),
});

export const timeEntryBillingSchema = v.object({
  billingStatus: v.optional(v.string({ values: ['paid', 'purchase_invoice_registered', 'purchase_invoice_queued', 'payment_queued', 'suspended'] })),
}, { atLeastOne: true });
