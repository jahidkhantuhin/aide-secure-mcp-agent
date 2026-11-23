'use client';

import { Button } from '@/components/ui/button';

import { useEffect, useState, type FormEvent } from 'react';
import {
  approvalViewSchema,
  type Action,
  type ApprovalView,
} from '@aide/shared/approval';

const field =
  'w-full rounded border border-neutral-600 bg-neutral-900 px-3 py-2';

function draftFrom(form: FormData): Action {
  return {
    tool: 'send',
    content: {
      to: String(form.get('to')).trim(),
      subject: String(form.get('subject')).trim(),
      body: String(form.get('body')).trim(),
    },
  };
}

function MailFields({
  action,
}: {
  action?: Extract<Action, { tool: 'send' }>;
}) {
  return (
    <>
      <label className="grid gap-1">
        To
        <input
          className={field}
          name="to"
          type="email"
          defaultValue={action?.content.to ?? 'ari@example.test'}
          required
        />
      </label>
      <label className="grid gap-1">
        Subject
        <input
          className={field}
          name="subject"
          defaultValue={action?.content.subject ?? 'Design review'}
          maxLength={200}
          required
        />
      </label>
      <label className="grid gap-1">
        Body
        <textarea
          className={field}
          name="body"
          defaultValue={
            action?.content.body ?? 'I will bring the latest mockups.'
          }
          maxLength={4000}
          required
        />
      </label>
    </>
  );
}

export function ApprovalBoard() {
  const [rows, setRows] = useState<ApprovalView[]>([]);
  const [now, setNow] = useState(0);
  const [kind, setKind] = useState<'send' | 'apply_change'>('send');
  const [editing, setEditing] = useState<string>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const signal = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/approvals', {
          cache: 'no-store',
          signal: signal.signal,
        });
        if (!response.ok) throw new Error();
        const result = approvalViewSchema.array().parse(await response.json());
        if (!signal.signal.aborted) {
          setRows(result);
          setNow(Date.now());
        }
      } catch {
        if (!signal.signal.aborted) setError('Unable to refresh approvals.');
      }
    }
    void load();
    const timer = setInterval(() => void load(), 1000);
    return () => {
      signal.abort();
      clearInterval(timer);
    };
  }, []);

  async function post(path: string, data: object) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/approvals' + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? 'This approval changed or its undo window ended.'
            : response.status === 403
              ? 'The current trust settings deny this action.'
              : 'The action could not be updated. Check the input.',
        );
      setEditing(undefined);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The action could not be updated.',
      );
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (kind === 'send') {
      void post('', draftFrom(data));
      return;
    }
    const start = new Date(String(data.get('start')));
    const end = new Date(String(data.get('end')));
    if (!(start < end)) {
      setError('End must come after start.');
      return;
    }
    void post('', {
      tool: 'apply_change',
      eventId: data.get('eventId'),
      when: { start: start.toISOString(), end: end.toISOString() },
    });
  }

  return (
    <div className="mt-7 space-y-8">
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
      <section aria-labelledby="new-approval">
        <h2 id="new-approval" className="text-xl font-semibold">
          Request approval for a mock action
        </h2>
        <form
          method="post"
          onSubmit={submit}
          className="mt-4 grid max-w-xl gap-3"
        >
          <label className="grid gap-1">
            Action
            <select
              className={field}
              value={kind}
              onChange={(event) => setKind(event.target.value as typeof kind)}
            >
              <option value="send">Send mock mail</option>
              <option value="apply_change">Move a mock calendar event</option>
            </select>
          </label>
          {kind === 'send' ? (
            <MailFields />
          ) : (
            <>
              <label className="grid gap-1">
                Event
                <select className={field} name="eventId">
                  <option value="design-review">Design review</option>
                  <option value="project-sync">Project sync</option>
                </select>
              </label>
              <label className="grid gap-1">
                New start (local time)
                <input
                  className={field}
                  name="start"
                  type="datetime-local"
                  required
                />
              </label>
              <label className="grid gap-1">
                New end (local time)
                <input
                  className={field}
                  name="end"
                  type="datetime-local"
                  required
                />
              </label>
            </>
          )}
          <Button type="submit" className="justify-self-start" disabled={busy}>
            Request approval
          </Button>
        </form>
      </section>
      <section aria-label="Approval history" className="space-y-4">
        <h2 className="text-xl font-semibold">Approval history</h2>
        {rows.length === 0 && <p>No approval requests.</p>}
        {rows.map((row) => {
          const { action, preview } = row;
          const seconds =
            Math.max(
              0,
              Math.ceil((Date.parse(row.undoUntil ?? '') - now) / 1000),
            ) || 0;
          return (
            <article
              key={row._id}
              className="space-y-3 rounded-lg border border-[#32403a] bg-[#171f1c] p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">
                  {action.tool === 'send'
                    ? action.content.subject
                    : preview.calendar?.before.title}
                </h3>
                <span className="capitalize" role="status">
                  {row.status}
                </span>
              </div>
              {action.tool === 'send' && (
                <>
                  <ul>
                    {preview.recipients.map(({ email, external }) => (
                      <li
                        key={email}
                        className={external ? 'text-amber-300' : ''}
                      >
                        To {email}
                        {external ? ' · External' : ''}
                      </li>
                    ))}
                  </ul>
                  <p className="whitespace-pre-wrap rounded bg-[#111715] p-3">
                    {action.content.body}
                  </p>
                </>
              )}
              {preview.calendar && (
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt>Before (UTC)</dt>
                    <dd>
                      {preview.calendar.before.start} →{' '}
                      {preview.calendar.before.end}
                    </dd>
                  </div>
                  <div>
                    <dt>After (UTC)</dt>
                    <dd>
                      {preview.calendar.after.start} →{' '}
                      {preview.calendar.after.end}
                    </dd>
                  </div>
                </dl>
              )}
              <p className="text-sm text-neutral-300">
                Risk: {preview.risk}. {preview.riskReason}
              </p>
              <p className="text-sm text-neutral-300">
                {preview.reversibility}
              </p>
              <p className="text-sm text-neutral-300">
                {preview.decision.reasons.join(' ')}
              </p>
              {row.status === 'pending' && editing !== row._id && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    disabled={busy}
                    onClick={() =>
                      void post('/' + row._id + '/resolve', {
                        version: row.version,
                        decision: 'approved',
                      })
                    }
                  >
                    Approve
                  </Button>
                  {action.tool === 'send' && (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setEditing(row._id)}
                    >
                      Edit
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="danger"
                    disabled={busy}
                    onClick={() =>
                      void post('/' + row._id + '/resolve', {
                        version: row.version,
                        decision: 'rejected',
                      })
                    }
                  >
                    Reject
                  </Button>
                </div>
              )}
              {row.status === 'pending' &&
                editing === row._id &&
                action.tool === 'send' && (
                  <form
                    className="grid gap-3"
                    method="post"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void post('/' + row._id + '/edit', {
                        version: row.version,
                        action: draftFrom(new FormData(event.currentTarget)),
                      });
                    }}
                  >
                    <MailFields action={action} />
                    <div className="flex gap-2">
                      <Button type="submit" disabled={busy}>
                        Save edit
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setEditing(undefined)}
                      >
                        Cancel edit
                      </Button>
                    </div>
                  </form>
                )}
              {row.status === 'approved' && (
                <div className="flex items-center gap-3">
                  <span>
                    {seconds
                      ? `Undo available for ${seconds}s`
                      : 'Waiting for worker'}
                  </span>
                  <Button
                    type="button"
                    variant="warning"
                    disabled={!seconds || busy}
                    onClick={() => void post('/' + row._id + '/undo', {})}
                  >
                    Undo
                  </Button>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
