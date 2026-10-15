import { v } from '../middleware/validate.js';
import { reportResources } from '../jobs/definitions.js';

export const reportJobSchema = v.object({
  resource: v.string({ values: reportResources }), format: v.string({ values: ['json', 'csv'] }), title: v.optional(v.string({ min: 1, max: 250 })),
});

export const recurringTaskCreateSchema = v.object({
  name: v.string({ min: 1, max: 200 }),
  jobType: v.string({ values: ['meeting.reminders.scan', 'performance.period.refresh', 'cleanup.expired-records'] }),
  payload: v.optional(v.jsonObject), intervalMinutes: v.number({ min: 1, max: 525600, integer: true }), nextRunAt: v.date,
  enabled: v.optional(v.boolean()),
});

export const recurringTaskUpdateSchema = v.object({
  payload: v.optional(v.jsonObject), intervalMinutes: v.optional(v.number({ min: 1, max: 525600, integer: true })), nextRunAt: v.optional(v.date),
  enabled: v.optional(v.boolean()),
}, { atLeastOne: true });
