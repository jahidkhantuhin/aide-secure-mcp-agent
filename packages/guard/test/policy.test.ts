import { afterEach, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { teamRecipients, type PolicyInput } from '@aide/shared/policy';
import { evaluatePolicy, type ActiveGrant } from '../policy/index.js';

const base = {
  tool: 'send',
  recipients: [teamRecipients[0]],
  sensitivity: 'internal',
} satisfies PolicyInput;
const now = new Date('2026-11-23T10:00:00Z');
const grant: ActiveGrant = {
  id: 'team',
  tool: 'send',
  recipients: teamRecipients,
  expiresAt: new Date('2026-11-23T11:00:00Z'),
};

afterEach(() => {
  vi.useRealTimers();
});

it.each([
  ['unknown tool', { tool: '__proto__' }, 'deny'],
  ['restricted data', { sensitivity: 'restricted' }, 'deny'],
  ['empty recipients', { recipients: [] }, 'deny'],
  ['confidential data', { sensitivity: 'confidential' }, 'require_approval'],
  [
    'external recipient',
    { recipients: ['ari@external.test'] },
    'require_approval',
  ],
  [
    'too many recipients',
    { recipients: [teamRecipients[0], teamRecipients[1], teamRecipients[0]] },
    'require_approval',
  ],
  [
    'outside grant scope',
    { recipients: ['unlisted@example.test'] },
    'require_approval',
  ],
  ['matching team grant', {}, 'allow'],
] as const)('handles %s', (_name, changes, outcome) => {
  const input = { ...base, ...changes } as PolicyInput;
  expect(
    evaluatePolicy(input, { send: 'narrow_auto' }, [grant], now).outcome,
  ).toBe(outcome);
});

it('expires a grant exactly at its deadline and respects revocation and UTC hours', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-23T10:59:59.999Z'));
  const decide = (active: ActiveGrant) =>
    evaluatePolicy(base, { send: 'narrow_auto' }, [active], new Date());
  expect(decide(grant).grantId).toBe('team');
  expect(decide({ ...grant, revokedAt: now }).outcome).toBe('require_approval');
  vi.setSystemTime(grant.expiresAt);
  expect(decide(grant).outcome).toBe('require_approval');
  vi.setSystemTime(new Date('2026-11-23T08:59:00Z'));
  expect(decide(grant).outcome).toBe('require_approval');
});

it('uses the configured trust cap before any recipient grant', () => {
  expect(
    evaluatePolicy(base, { send: 'read_only' }, [grant], now).outcome,
  ).toBe('deny');
  expect(
    evaluatePolicy(base, { send: 'ask_first' }, [grant], now).outcome,
  ).toBe('require_approval');
  expect(evaluatePolicy({ ...base, tool: 'search' }, {}, [], now).outcome).toBe(
    'allow',
  );
  expect(
    evaluatePolicy(
      { ...base, tool: 'search' },
      { search: 'ask_first' },
      [],
      now,
    ).outcome,
  ).toBe('require_approval');
});

it('never auto-allows mail when any external recipient is present', () => {
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom(...teamRecipients), { maxLength: 8 }),
      fc.boolean(),
      (recipients, prepend) => {
        const external = 'external@partner.test';
        const addresses = prepend
          ? [external, ...recipients]
          : [...recipients, external];
        expect(
          evaluatePolicy(
            { ...base, recipients: addresses },
            { send: 'narrow_auto' },
            [grant],
            now,
          ).outcome,
        ).toBe('require_approval');
      },
    ),
    { seed: 103 },
  );
});
