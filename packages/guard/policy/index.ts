import {
  defaultTrustMode,
  toolNameSchema,
  toolTiers,
  type PolicyInput,
  type PolicyModes,
  type PolicyDecision,
} from '@aide/shared/policy';

export type ActiveGrant = {
  id: string;
  tool: 'send';
  recipients: readonly string[];
  expiresAt: Date;
  revokedAt?: Date;
};

export function evaluatePolicy(
  input: PolicyInput,
  modes: PolicyModes,
  grants: readonly ActiveGrant[],
  now: Date,
): PolicyDecision {
  const result = (
    outcome: PolicyDecision['outcome'],
    reason: string,
  ): PolicyDecision => ({ outcome, reasons: [reason] });
  const known = toolNameSchema.safeParse(input.tool);
  if (!known.success) return result('deny', 'The tool is unknown.');
  const tool = known.data;
  const tier = toolTiers[tool];
  const mode = modes[tool] ?? defaultTrustMode(tool);
  if (input.sensitivity === 'restricted')
    return result('deny', 'Restricted data cannot be used by this tool.');
  if ((input.riskScore ?? 0) >= 70)
    return result('deny', 'The source exceeded the quarantine risk threshold.');
  if (
    (mode === 'read_only' && tier !== 'read') ||
    (mode === 'draft' && tier === 'act')
  ) {
    return result(
      'deny',
      'The selected trust mode does not permit this capability tier.',
    );
  }
  if (tool === 'send' && input.recipients.length === 0)
    return result('deny', 'Sending mail requires a recipient.');
  if (tier === 'act') {
    if (input.sensitivity === 'confidential')
      return result(
        'require_approval',
        'The action involves confidential data.',
      );
    const recipients = input.recipients.map((address) => address.toLowerCase());
    if (recipients.some((address) => !address.endsWith('@example.test'))) {
      return result(
        'require_approval',
        'The action includes an external recipient.',
      );
    }
    if (recipients.length > 2)
      return result(
        'require_approval',
        'The action has more than two recipients.',
      );
    if (mode === 'narrow_auto' && tool === 'send') {
      const hour = now.getUTCHours();
      if (hour < 9 || hour >= 17)
        return result(
          'require_approval',
          'Automatic actions are limited to 09:00–17:00 UTC.',
        );
      const match = grants.find(
        (grant) =>
          grant.tool === tool &&
          !grant.revokedAt &&
          grant.expiresAt > now &&
          recipients.every((address) => grant.recipients.includes(address)),
      );
      if (match)
        return {
          outcome: 'allow',
          reasons: ['An active team-mail grant covers every recipient.'],
          grantId: match.id,
        };
      return result(
        'require_approval',
        'No active team-mail grant covers every recipient.',
      );
    }
    return result('require_approval', 'This action requires an approval.');
  }
  if (mode === 'ask_first' || input.sensitivity === 'confidential') {
    return result(
      'require_approval',
      'The trust mode or data sensitivity requires approval.',
    );
  }
  return result(
    'allow',
    tier === 'read'
      ? 'The selected mode permits this read.'
      : 'The selected mode permits this draft.',
  );
}
