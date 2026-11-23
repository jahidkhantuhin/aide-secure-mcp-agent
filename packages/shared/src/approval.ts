import { z } from 'zod';
import {
  calendarChangeSchema,
  calendarEventSchema,
  mailContentSchema,
  mockId,
  timeRange,
} from '@aide/shared/mock-world';
import { decisionSchema } from '@aide/shared/policy';

export const actionSchema = z.discriminatedUnion('tool', [
  z.strictObject({ tool: z.literal('send'), content: mailContentSchema }),
  z.strictObject({
    tool: z.literal('apply_change'),
    eventId: mockId,
    when: timeRange,
  }),
]);
export type Action = z.infer<typeof actionSchema>;
export const approvalPreviewSchema = z.strictObject({
  decision: decisionSchema,
  recipients: z.array(
    z.strictObject({ email: z.email(), external: z.boolean() }),
  ),
  risk: z.enum(['moderate', 'high']),
  reversibility: z.string(),
  riskReason: z.string(),
  calendar: z
    .strictObject({ before: calendarEventSchema, after: calendarEventSchema })
    .optional(),
});
export const approvalSchema = z.strictObject({
  _id: z.uuid(),
  runId: z.uuid(),
  ownerId: z.string().min(1),
  action: actionSchema,
  preview: approvalPreviewSchema,
  version: z.int().nonnegative(),
  status: z.enum([
    'pending',
    'approved',
    'rejected',
    'undone',
    'executed',
    'failed',
  ]),
  createdAt: z.date(),
  undoUntil: z.date().optional(),
  processedAt: z.date().optional(),
  inverse: calendarChangeSchema.optional(),
});
export type Approval = z.infer<typeof approvalSchema>;
export const resolutionSchema = z.enum(['approved', 'rejected', 'undone']);
export type Resolution = z.infer<typeof resolutionSchema>;
export const resolveApprovalSchema = z.strictObject({
  version: z.int().nonnegative(),
  decision: z.enum(['approved', 'rejected']),
});
export const approvalViewSchema = approvalSchema
  .omit({ ownerId: true, processedAt: true })
  .extend({
    createdAt: z.iso.datetime(),
    undoUntil: z.iso.datetime().optional(),
  });
export type ApprovalView = z.infer<typeof approvalViewSchema>;

export function approvalQueueName(dbName: string) {
  return 'aide-approvals-' + dbName;
}
