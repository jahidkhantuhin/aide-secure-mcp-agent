import { z } from 'zod';
import { mockWorldSchema } from '@aide/shared/mock-world';
import { decisionSchema } from '@aide/shared/policy';
import { guardNoticeSchema } from '@aide/shared/security';

const id = z.string().min(1);
const date = z.date();
const count = z.number().int().nonnegative();
const status = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export const identity = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('owner'), id }),
  z.strictObject({ kind: z.literal('sandbox'), id }),
]);
export type Principal = z.infer<typeof identity>;

export const userSchema = z.strictObject({
  _id: z.custom<{ toHexString(): string }>(
    (value) =>
      typeof value === 'object' &&
      value !== null &&
      'toHexString' in value &&
      typeof value.toHexString === 'function',
  ),
  name: z.string().min(1),
  email: z.email(),
  emailVerified: z.boolean(),
  image: z.string().nullish(),
  createdAt: date,
  updatedAt: date,
  ownerSlot: z.literal(1),
});
export const ownerViewSchema = z.strictObject({
  id,
  name: z.string(),
  email: z.email(),
});

export const sandboxSessionSchema = z.strictObject({
  _id: id,
  createdAt: date,
  expiresAt: date,
  world: mockWorldSchema,
  tokensRemaining: count,
  window: count,
  requests: count,
});
export type SandboxSession = z.infer<typeof sandboxSessionSchema>;

export const runSchema = z.strictObject({
  _id: id,
  principal: identity,
  status,
  createdAt: date,
  updatedAt: date,
});
export type Run = z.infer<typeof runSchema>;
export const taskInputSchema = z.strictObject({
  prompt: z.string().trim().min(1).max(1200),
});

const eventBase = { threadId: id, runId: id, timestamp: count };
export const agentEventSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...eventBase,
    type: z.literal('GUARD_NOTICE'),
    notice: guardNoticeSchema,
  }),
  z.strictObject({
    ...eventBase,
    type: z.literal('APPROVAL_REQUESTED'),
    approvalId: id,
  }),
  z.strictObject({
    ...eventBase,
    type: z.literal('APPROVAL_RESOLVED'),
    approvalId: id,
    decision: z.enum(['approved', 'rejected']),
    approverId: id,
  }),
  z.strictObject({
    ...eventBase,
    type: z.literal('APPROVAL_UNDONE'),
    approvalId: id,
  }),
  z.strictObject({
    ...eventBase,
    type: z.literal('POLICY_DECISION'),
    tool: id,
    decision: decisionSchema,
  }),
  z.strictObject({ ...eventBase, type: z.literal('RUN_STARTED') }),
  z.strictObject({ ...eventBase, type: z.literal('RUN_FINISHED') }),
  z.strictObject({
    ...eventBase,
    type: z.literal('RUN_ERROR'),
    message: z.string(),
  }),
  z.strictObject({
    ...eventBase,
    type: z.literal('STEP_STARTED'),
    stepName: id,
  }),
  z.strictObject({
    ...eventBase,
    type: z.literal('STEP_FINISHED'),
    stepName: id,
  }),
  z.strictObject({
    ...eventBase,
    type: z.literal('TEXT_MESSAGE_CONTENT'),
    messageId: id,
    delta: z.string(),
  }),
  z.strictObject({
    ...eventBase,
    type: z.literal('TEXT_MESSAGE_START'),
    messageId: id,
  }),
  z.strictObject({
    ...eventBase,
    type: z.literal('TEXT_MESSAGE_END'),
    messageId: id,
  }),
  z.strictObject({
    ...eventBase,
    type: z.literal('PLAN_CREATED'),
    tools: z.array(id),
  }),
  z.strictObject({
    ...eventBase,
    type: z.literal('TOOL_CALL_START'),
    toolCallId: id,
    toolCallName: id,
  }),
  z.strictObject({
    ...eventBase,
    type: z.literal('TOOL_CALL_END'),
    toolCallId: id,
  }),
  z.strictObject({
    ...eventBase,
    type: z.literal('TOOL_CALL_RESULT'),
    toolCallId: id,
    count,
  }),
  z.strictObject({ ...eventBase, type: z.literal('RUN_CANCELLED') }),
]);
export type AgentEvent = z.infer<typeof agentEventSchema>;
export const runEventSchema = z.strictObject({
  _id: id,
  runId: id,
  sequence: count,
  event: agentEventSchema,
  createdAt: date,
});
export type RunEvent = z.infer<typeof runEventSchema>;
export function approvalRunEvent(
  runId: string,
  sequence: number,
  createdAt: Date,
  detail: { type: string; [key: string]: unknown },
): RunEvent {
  return runEventSchema.parse({
    _id: runId + ':' + sequence,
    runId,
    sequence,
    createdAt,
    event: {
      ...detail,
      runId,
      threadId: runId,
      timestamp: createdAt.getTime(),
    },
  });
}
export const approvalSchema = z.strictObject({
  _id: id,
  runId: id,
  tool: id,
  status: z.enum(['pending', 'approved', 'rejected']),
  createdAt: date,
  resolvedAt: date.optional(),
});
export const grantSchema = z.strictObject({
  _id: id,
  principal: identity,
  tool: id,
  createdAt: date,
  expiresAt: date,
  revokedAt: date.optional(),
  recipients: z.array(z.email()).optional(),
});
export const idempotencyKeySchema = z.strictObject({
  _id: id,
  key: id,
  status: z.enum(['pending', 'completed']),
  createdAt: date,
  expiresAt: date,
});
export const auditLogSchema = z.strictObject({
  _id: id,
  principal: identity,
  action: id,
  runId: id.optional(),
  createdAt: date,
  tool: id.optional(),
  policyVersion: count.optional(),
  decision: decisionSchema.optional(),
});
export const attackAttemptSchema = z.strictObject({
  _id: id,
  sandboxSessionId: id,
  outcome: z.enum(['blocked', 'allowed']),
  createdAt: date,
  expiresAt: date,
});

export const sandboxViewSchema = z.strictObject({
  world: mockWorldSchema,
  tokensRemaining: count,
  expiresAt: z.iso.datetime(),
});
