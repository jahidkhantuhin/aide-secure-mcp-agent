import { z } from 'zod';

export const sourceSchema = z.enum(['email', 'web', 'invite', 'social']);
export const factSchema = z.strictObject({
  source: sourceSchema,
  sender: z.enum(['team', 'external', 'unknown']),
  intent: z.enum(['design', 'sync', 'scheduling', 'updates', 'other']),
  dates: z.array(z.iso.date()).max(4),
  requestedActions: z
    .array(
      z.strictObject({
        kind: z.enum(['reply', 'schedule', 'share']),
        treatment: z.literal('data'),
      }),
    )
    .max(3),
  riskScore: z.int().min(0).max(100),
  signals: z
    .array(
      z.enum([
        'hidden-formatting',
        'encoded-text',
        'oversize',
        'instruction-like',
      ]),
    )
    .max(4),
});
export type ContentFact = z.infer<typeof factSchema>;
export type ContentSource = z.infer<typeof sourceSchema>;

export const guardNoticeSchema = z.strictObject({
  layer: z.enum(['quarantine', 'policy', 'egress']),
  outcome: z.enum(['flagged', 'blocked', 'approval_required']),
  reason: z.string().max(360),
});
export type GuardNotice = z.infer<typeof guardNoticeSchema>;
export const activityItemSchema = guardNoticeSchema.extend({
  id: z.string(),
  at: z.iso.datetime(),
});
export type ActivityItem = z.infer<typeof activityItemSchema>;
