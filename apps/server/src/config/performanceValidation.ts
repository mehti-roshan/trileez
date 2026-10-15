import { protectedInputFields } from './requestValidation.js';
import { v } from '../middleware/validate.js';

const text = v.string({ min: 1, max: 10_000 });
const optionalText = v.optional(v.string({ max: 10_000 }));

export const performanceAdjustmentSchema = v.object({
  employeeId: v.id,
  reason: v.string({ min: 1, max: 1000 }),
  category: v.optional(v.string({ min: 1, max: 250 })),
  points: v.number({ min: -100, max: 100, integer: true }),
  date: v.date,
  description: optionalText,
  projectId: v.optional(v.id),
  taskId: v.optional(v.id),
  attachmentId: v.optional(v.id),
}, { strip: [...protectedInputFields, 'id', 'periodKey'] });

export const performanceFinalizeSchema = v.object({
  employeeId: v.id,
  period: v.optional(v.date),
  startedAt: v.optional(v.date),
  notes: optionalText,
}, {
  strip: [...protectedInputFields, 'id', 'title', 'score', 'baselineScore', 'adjustmentTotal', 'eventIds', 'grade', 'trend', 'status', 'endedAt', 'version', 'reopenedAt', 'reopenedBy', 'reopenReason'],
});

export const performanceReopenSchema = v.object({ reason: text });
export const performanceSummaryQuerySchema = v.object({ period: v.optional(v.date) });
