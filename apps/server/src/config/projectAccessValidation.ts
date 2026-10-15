import { v } from '../middleware/validate.js';

export const effectiveAccessQuerySchema = v.object({
  projectId: v.id,
  projectMemberId: v.optional(v.id),
});

export const revealAccessSecretSchema = v.object({
  reason: v.string({ min: 3, max: 1000 }),
});

