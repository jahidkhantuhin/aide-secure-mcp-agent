'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  defaultTrustMode,
  teamRecipients,
  toolNameSchema,
  toolTiers,
  trustViewSchema,
  type PolicyTool,
  type TrustMode,
  type TrustView,
} from '@aide/shared/policy';

const labels: Record<TrustMode, string> = {
  read_only: 'Read-only',
  draft: 'Draft',
  ask_first: 'Ask first',
  narrow_auto: 'Narrow auto',
};
const field = 'rounded border border-neutral-600 bg-neutral-900 px-3 py-2';
const action =
  'rounded border border-neutral-500 px-3 py-2 disabled:opacity-60';

export function TrustControls({
  initial,
  initialTime,
}: {
  initial: TrustView;
  initialTime: number;
}) {
  const [state, setState] = useState(initial);
  const [now, setNow] = useState(initialTime);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function refresh() {
    const response = await fetch('/api/trust', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load trust settings.');
    setState(trustViewSchema.parse(await response.json()));
  }

  async function update(path: string, body?: object) {
    setPending(true);
    setError('');
    try {
      if (path) {
        const response = await fetch('/api/trust/' + path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body ?? {}),
        });
        if (response.status === 409) {
          await refresh();
          throw new Error(
            'Settings changed elsewhere. Try again with the current version.',
          );
        }
        if (!response.ok)
          throw new Error(
            'Unable to apply that request. Check the input and try again.',
          );
      }
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to update trust settings.',
      );
    } finally {
      setPending(false);
    }
  }

  function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void update('preview', {
      tool: data.get('tool'),
      recipients: String(data.get('recipients') ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      sensitivity: data.get('sensitivity'),
    });
  }

  return (
    <div className="mt-8 space-y-10">
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
      <section aria-label="Tool trust settings">
        <h2 className="text-xl font-medium">Tool permissions</h2>
        <p className="mt-2 text-sm text-neutral-300">
          Policy version {state.version}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {toolNameSchema.options.map((tool: PolicyTool) => {
            const tier = toolTiers[tool];
            const mode = state.modes[tool] ?? defaultTrustMode(tool);
            return (
              <label
                key={tool}
                className="flex items-center justify-between gap-4 rounded border border-[#32403a] p-3"
              >
                <span>
                  {tool} <small className="text-neutral-400">{tier}</small>
                </span>
                <select
                  className={field}
                  value={mode}
                  disabled={pending}
                  onChange={(event) =>
                    void update('mode', {
                      expectedVersion: state.version,
                      tool,
                      mode: event.target.value,
                    })
                  }
                >
                  {Object.entries(labels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      </section>
      <section aria-label="Active grants">
        <h2 className="text-xl font-medium">Active grants</h2>
        <p className="my-3 text-sm text-neutral-300">
          Team mail covers {teamRecipients.join(' and ')} for one hour. Narrow
          auto uses it from 09:00 to 17:00 UTC.
        </p>
        <button
          type="button"
          className={action}
          disabled={pending}
          onClick={() => void update('grants')}
        >
          Grant team mail for 1 hour
        </button>
        <ul className="mt-4 space-y-2">
          {state.grants.map((grant) => {
            const seconds = Math.max(
              0,
              Math.ceil((Date.parse(grant.expiresAt) - now) / 1000),
            );
            return (
              <li
                key={grant.id}
                className="flex items-center justify-between gap-3"
              >
                <span>
                  {grant.tool} ·{' '}
                  {seconds
                    ? `${Math.floor(seconds / 60)}m ${seconds % 60}s remaining`
                    : 'Expired'}
                </span>
                <button
                  type="button"
                  className={action}
                  disabled={pending || !seconds}
                  onClick={() => void update('grants/' + grant.id + '/revoke')}
                >
                  Revoke
                </button>
              </li>
            );
          })}
        </ul>
        {!state.grants.length && (
          <p className="mt-3 text-sm text-neutral-300">No active grants.</p>
        )}
      </section>
      <section aria-label="Policy preview">
        <h2 className="text-xl font-medium">Preview a decision</h2>
        <form
          method="post"
          onSubmit={preview}
          className="mt-4 grid gap-4 sm:grid-cols-2"
        >
          <label className="grid gap-2">
            Tool
            <input
              className={field}
              name="tool"
              defaultValue="send"
              maxLength={100}
              required
            />
          </label>
          <label className="grid gap-2">
            Recipients, comma separated
            <input
              className={field}
              name="recipients"
              placeholder="ari@example.test"
            />
          </label>
          <label className="grid gap-2">
            Data sensitivity
            <select
              className={field}
              name="sensitivity"
              defaultValue="internal"
            >
              <option value="public">Public</option>
              <option value="internal">Internal</option>
              <option value="confidential">Confidential</option>
              <option value="restricted">Restricted</option>
            </select>
          </label>
          <button className={action + ' self-end'} disabled={pending}>
            Evaluate policy
          </button>
        </form>
      </section>
      <section aria-label="Decision traces">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-medium">Decision traces</h2>
          <button
            type="button"
            className={action}
            disabled={pending}
            onClick={() => void update('')}
          >
            Refresh
          </button>
        </div>
        {!state.decisions.length && (
          <p className="mt-3 text-sm text-neutral-300">
            Run an Assistant task or evaluate a preview to see a decision.
          </p>
        )}
        <ul className="mt-4 space-y-3">
          {state.decisions.map((entry) => (
            <li key={entry.id} className="rounded border border-[#32403a] p-3">
              <strong>
                {entry.tool} · {entry.decision.outcome.replaceAll('_', ' ')}
              </strong>
              <p className="text-sm text-neutral-300">
                {entry.decision.reasons.join(' ')}
              </p>
              <p className="mt-1 text-xs text-neutral-400">
                {entry.source} · policy v{entry.policyVersion} · {entry.at}
                {entry.decision.grantId
                  ? ' · matched grant ' + entry.decision.grantId
                  : ''}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
