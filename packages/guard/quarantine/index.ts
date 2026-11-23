import { Buffer } from 'node:buffer';
import {
  parseFragment,
  defaultTreeAdapter,
  type DefaultTreeAdapterMap,
} from 'parse5';
import {
  factSchema,
  type ContentFact,
  type ContentSource,
} from '@aide/shared/security';
import { teamRecipients } from '@aide/shared/policy';

const maxLength = 8192;
const invisible = /[\p{Cf}\p{Cc}]/gu;
const ignored = new Set([
  'script',
  'style',
  'template',
  'noscript',
  'iframe',
  'svg',
]);

function extract(text: string) {
  const parts: string[] = [];
  let hidden = false;
  const nodes: DefaultTreeAdapterMap['childNode'][] = [
    ...parseFragment(text).childNodes,
  ].reverse();
  while (nodes.length) {
    const node = nodes.pop()!;
    if (defaultTreeAdapter.isTextNode(node)) {
      parts.push(node.value);
      continue;
    }
    if (!defaultTreeAdapter.isElementNode(node)) {
      if (node.nodeName === '#comment') hidden = true;
      continue;
    }
    const attributes = new Map(
      node.attrs.map(({ name, value }) => [name, value]),
    );
    const style = attributes.get('style') ?? '';
    if (
      ignored.has(node.tagName) ||
      attributes.has('hidden') ||
      attributes.get('aria-hidden')?.toLowerCase() === 'true' ||
      /(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:[;\s]|$)|color\s*:\s*(?:white|#fff(?:fff)?)(?:[;\s]|$))/i.test(
        style,
      )
    ) {
      hidden = true;
      continue;
    }
    nodes.push(...node.childNodes.slice().reverse());
  }
  return { text: parts.join(' '), hidden };
}

export function quarantine(input: {
  source: ContentSource;
  sender?: string;
  content: string;
}): ContentFact {
  const signals: ContentFact['signals'] = [];
  if (input.content.length > maxLength) signals.push('oversize');
  const parsed = extract(input.content.slice(0, maxLength));
  const normalized = parsed.text.normalize('NFKC').replace(/\s/g, ' ');
  const visible = normalized.replace(invisible, '');
  if (parsed.hidden || visible !== normalized)
    signals.push('hidden-formatting');
  const decoded = visible
    .replace(
      /=\?utf-8\?b\?([a-z\d+/]{4,1024}={0,2})\?=/gi,
      (_match, value: string) => {
        if (!signals.includes('encoded-text')) signals.push('encoded-text');
        return Buffer.from(value, 'base64').toString('utf8');
      },
    )
    .normalize('NFKC')
    .replace(invisible, '')
    .slice(0, maxLength);
  if (
    /\b(?:system|assistant|developer)\s+(?:instructions?|role)\b|\b(?:override|disregard)\s+(?:prior|previous|existing)\b/i.test(
      decoded,
    )
  ) {
    signals.push('instruction-like');
  }
  const riskScore = Math.min(
    100,
    signals.reduce(
      (score, flag) => score + (flag === 'instruction-like' ? 75 : 20),
      0,
    ),
  );
  const dates = [...new Set(decoded.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [])]
    .filter((date) => {
      const time = new Date(date + 'T00:00:00Z');
      return (
        !Number.isNaN(time.valueOf()) &&
        time.toISOString().slice(0, 10) === date
      );
    })
    .slice(0, 4);
  const requestedActions: ContentFact['requestedActions'] = [];
  if (/\breply\b/i.test(decoded))
    requestedActions.push({ kind: 'reply', treatment: 'data' });
  if (/\b(?:schedule|reschedule)\b/i.test(decoded))
    requestedActions.push({ kind: 'schedule', treatment: 'data' });
  if (/\b(?:share|forward)\b/i.test(decoded))
    requestedActions.push({ kind: 'share', treatment: 'data' });
  const sender = input.sender?.trim().toLowerCase();
  return factSchema.parse({
    source: input.source,
    sender: !sender
      ? 'unknown'
      : teamRecipients.some((email) => email === sender)
        ? 'team'
        : 'external',
    intent: /\bdesign\b/i.test(decoded)
      ? 'design'
      : /\bsync\b/i.test(decoded)
        ? 'sync'
        : /\b(?:meeting|schedule)\b/i.test(decoded)
          ? 'scheduling'
          : /\b(?:status|update)\b/i.test(decoded)
            ? 'updates'
            : 'other',
    dates,
    requestedActions,
    riskScore,
    signals,
  });
}
