import {
  teamRecipients,
  type PolicyDecision,
  type PolicyInput,
} from '@aide/shared/policy';
import type { MailContent } from '@aide/shared/mock-world';

const allowedOrigins = new Set(['https://example.test']);

export function checkEgress(
  content: MailContent,
  sensitivity: PolicyInput['sensitivity'] = 'internal',
): PolicyDecision {
  const text = (content.subject + '\n' + content.body)
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '');
  if (
    sensitivity === 'restricted' ||
    sensitivity === 'confidential' ||
    /\[(?:restricted|confidential)\]|\b(?:api[_ -]?key|access[_ -]?token|password|session[_ -]?secret)\s*[:=]/i.test(
      text,
    )
  ) {
    return {
      outcome: 'deny',
      reasons: ['Sensitive data cannot leave through mock mail.'],
    };
  }
  if (/<\/?[a-z][^>]*>/i.test(text)) {
    return {
      outcome: 'deny',
      reasons: ['Outbound mail accepts plain text only.'],
    };
  }
  const links =
    text.match(
      /\b(?:[a-z][a-z\d+.-]*:\/\/|mailto:|data:|javascript:|www\.)[^\s<>]+/gi,
    ) ?? [];
  for (const link of links) {
    const url = URL.parse(link.replace(/[.,!?;)]+$/, ''));
    if (
      !url ||
      !allowedOrigins.has(url.origin) ||
      url.username ||
      url.password
    ) {
      return {
        outcome: 'deny',
        reasons: ['Outbound mail contains a link outside the allowlist.'],
      };
    }
  }
  if (!teamRecipients.some((email) => email === content.to.toLowerCase())) {
    return {
      outcome: 'require_approval',
      reasons: ['The recipient is outside the known team.'],
    };
  }
  return {
    outcome: 'allow',
    reasons: ['Outbound content and recipient passed egress checks.'],
  };
}
