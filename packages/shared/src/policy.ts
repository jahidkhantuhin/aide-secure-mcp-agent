import { z } from 'zod';

export const toolTiers = {
  list_events: 'read',
  find_free_time: 'read',
  propose_change: 'draft',
  apply_change: 'act',
  search: 'read',
  read: 'read',
  create_draft: 'draft',
  send: 'act',
} as const;
export const toolNameSchema = z.enum([
  'list_events',
  'find_free_time',
  'propose_change',
  'apply_change',
  'search',
  'read',
  'create_draft',
  'send',
]);
export const trustModeSchema = z.enum([
  'read_only',
  'draft',
  'ask_first',
  'narrow_auto',
]);
export type TrustMode = z.infer<typeof trustModeSchema>;
export type PolicyTool = z.infer<typeof toolNameSchema>;
export function defaultTrustMode(tool: PolicyTool): TrustMode {
  const tier = toolTiers[tool];
  return tier === 'read'
    ? 'read_only'
    : tier === 'draft'
      ? 'draft'
      : 'ask_first';
}
export const policyModesSchema = z.partialRecord(
  toolNameSchema,
  trustModeSchema,
);
export type PolicyModes = z.infer<typeof policyModesSchema>;
export const policyInputSchema = z.strictObject({
  tool: z.string().min(1).max(100),
  recipients: z.array(z.email().max(254)).max(50).default([]),
  sensitivity: z
    .enum(['public', 'internal', 'confidential', 'restricted'])
    .default('internal'),
  riskScore: z.int().min(0).max(100).optional(),
});
export type PolicyInput = z.infer<typeof policyInputSchema>;
export const teamRecipients = [
  'ari@example.test',
  'jules@example.test',
] as const;

export const decisionSchema = z.strictObject({
  outcome: z.enum(['allow', 'require_approval', 'deny']),
  reasons: z.array(z.string()).min(1),
  grantId: z.string().optional(),
});
export type PolicyDecision = z.infer<typeof decisionSchema>;

export const grantViewSchema = z.strictObject({
  id: z.string(),
  tool: z.literal('send'),
  recipients: z.array(z.email()),
  expiresAt: z.iso.datetime(),
});
export const decisionViewSchema = z.strictObject({
  id: z.string(),
  tool: z.string(),
  policyVersion: z.int().nonnegative(),
  source: z.enum(['agent', 'preview']),
  at: z.iso.datetime(),
  decision: decisionSchema,
});
export const trustViewSchema = z.strictObject({
  version: z.int().nonnegative(),
  modes: policyModesSchema,
  grants: z.array(grantViewSchema),
  decisions: z.array(decisionViewSchema),
});
export type TrustView = z.infer<typeof trustViewSchema>;
export const updatePolicySchema = z.strictObject({
  expectedVersion: z.int().nonnegative(),
  tool: toolNameSchema,
  mode: trustModeSchema,
});
