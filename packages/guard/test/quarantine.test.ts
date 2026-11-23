import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { quarantine } from '../quarantine/index.js';
import { checkEgress } from '../egress/index.js';

describe('tool-free quarantine', () => {
  it.each(['email', 'invite', 'web', 'social'] as const)(
    'extracts bounded data from %s',
    (source) => {
      const input = {
        source,
        sender: 'ari@example.test',
        content:
          'Design review 2026-11-24. Please reply. <span hidden>HIDDEN-MARKER</span>',
      };
      const result = quarantine(input);
      expect(result).toMatchObject({
        source,
        sender: 'team',
        intent: 'design',
        dates: ['2026-11-24'],
        requestedActions: [{ kind: 'reply', treatment: 'data' }],
        signals: ['hidden-formatting'],
      });
      expect(JSON.stringify(result)).not.toMatch(
        /HIDDEN-MARKER|ari@example\.test/,
      );
    },
  );

  it('handles invisible characters, bounded MIME text, and invalid dates', () => {
    const encoded = Buffer.from('Status update', 'utf8').toString('base64');
    const result = quarantine({
      source: 'email',
      content:
        'Week\u200Bly =?utf-8?b?' +
        encoded +
        '?= 2026-02-30 ' +
        ' '.repeat(9000),
    });
    expect(result.signals).toEqual([
      'oversize',
      'hidden-formatting',
      'encoded-text',
    ]);
    expect(result.intent).toBe('updates');
    expect(result.dates).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(encoded);
  });
});

describe('deterministic egress', () => {
  const mail = {
    to: 'ari@example.test',
    subject: 'Mock status',
    body: 'Reference: https://example.test/notes',
  };
  it('allows the exact trusted origin and requires review for new recipients', () => {
    expect(checkEgress(mail).outcome).toBe('allow');
    expect(checkEgress({ ...mail, to: 'new@example.test' }).outcome).toBe(
      'require_approval',
    );
    expect(checkEgress({ ...mail, to: 'guest@partner.test' }).outcome).toBe(
      'require_approval',
    );
  });
  it('denies protected labels and links to other origins', () => {
    expect(
      checkEgress({ ...mail, body: '[restricted] QA sample' }).outcome,
    ).toBe('deny');
    expect(
      checkEgress({ ...mail, body: 'See https://guest.test/notes' }).outcome,
    ).toBe('deny');
    expect(checkEgress(mail, 'confidential').outcome).toBe('deny');
  });
});
