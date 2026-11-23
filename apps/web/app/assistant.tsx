'use client';

import { Button } from '@/components/ui/button';

import { agentEventSchema } from '@aide/shared/domain';
import { useEffect, useRef, useState, type FormEvent } from 'react';

export function Assistant({ scope }: { scope: 'owner' | 'sandbox' }) {
  const scopeQuery = '?scope=' + scope;
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [timeline, setTimeline] = useState<string[]>([]);
  const [status, setStatus] = useState<
    'idle' | 'running' | 'cancelling' | 'completed' | 'cancelled' | 'failed'
  >('idle');
  const [runId, setRunId] = useState('');
  const [error, setError] = useState('');
  const stream = useRef<EventSource>(null);
  const running = status === 'running' || status === 'cancelling';

  useEffect(() => () => stream.current?.close(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prompt.trim() || running) return;
    setError('');
    setStatus('running');
    setRunId('');
    setAnswer('');
    setTimeline([]);
    try {
      const response = await fetch('/api/tasks' + scopeQuery, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!response.ok) {
        throw new Error(
          response.status === 429
            ? 'The task limit or demo allowance was reached.'
            : 'Could not start the task.',
        );
      }
      const { id } = (await response.json()) as { id: string };
      setRunId(id);
      const connection = new EventSource(
        '/api/tasks/' + encodeURIComponent(id) + '/events' + scopeQuery,
      );
      stream.current?.close();
      stream.current = connection;
      connection.onopen = () => setError('');
      connection.onerror = () => {
        if (connection.readyState === EventSource.CLOSED) {
          setStatus('failed');
          setError('The live timeline disconnected.');
        } else setError('Reconnecting to the timeline…');
      };
      const tools = new Map<string, string>();
      connection.onmessage = (message) => {
        const data = agentEventSchema.parse(JSON.parse(message.data));
        function add(label: string) {
          setTimeline((entries) => [...entries, label]);
        }
        switch (data.type) {
          case 'POLICY_DECISION':
            add(
              `Policy for ${data.tool}: ${data.decision.outcome.replaceAll('_', ' ')}. ${data.decision.reasons.join(' ')}`,
            );
            break;
          case 'STEP_STARTED':
            add(data.stepName);
            break;
          case 'PLAN_CREATED':
            add(
              data.tools.length
                ? 'Plan: ' + data.tools.join(', ')
                : 'Plan: answer directly',
            );
            break;
          case 'TOOL_CALL_START':
            tools.set(data.toolCallId, data.toolCallName);
            add('Tool: ' + data.toolCallName);
            break;
          case 'TOOL_CALL_RESULT':
            add(
              `${tools.get(data.toolCallId) ?? 'Tool'} returned ${data.count} result(s)`,
            );
            break;
          case 'TEXT_MESSAGE_CONTENT':
            setAnswer((text) => text + data.delta);
            break;
          case 'RUN_FINISHED':
          case 'RUN_CANCELLED':
          case 'RUN_ERROR':
            connection.close();
            setStatus(
              data.type === 'RUN_FINISHED'
                ? 'completed'
                : data.type === 'RUN_CANCELLED'
                  ? 'cancelled'
                  : 'failed',
            );
            if (data.type === 'RUN_ERROR') setError(data.message);
            break;
        }
      };
    } catch (reason) {
      setStatus('failed');
      setError(
        reason instanceof Error ? reason.message : 'Could not start the task.',
      );
    }
  }

  async function cancel() {
    setStatus('cancelling');
    try {
      const response = await fetch(
        '/api/tasks/' + encodeURIComponent(runId) + '/cancel' + scopeQuery,
        { method: 'POST' },
      );
      if (!response.ok && response.status !== 409) throw new Error();
    } catch {
      setStatus((current) => (current === 'cancelling' ? 'running' : current));
      setError('Could not cancel the task. Try again.');
    }
  }

  return (
    <section
      className="mt-10 border-t border-[#32403a] pt-7"
      aria-labelledby="assistant-heading"
    >
      <h2 id="assistant-heading" className="text-2xl font-semibold">
        Assistant
      </h2>
      <form onSubmit={submit} className="mt-4 grid gap-3">
        <label htmlFor="task-prompt">
          Ask about the demo calendar or inbox
        </label>
        <textarea
          id="task-prompt"
          className="rounded-md border border-[#43564c] bg-[#171f1c] p-3"
          rows={3}
          maxLength={1200}
          placeholder="What’s on Sam’s calendar and in the inbox?"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          required
        />
        <div className="flex gap-3">
          <Button type="submit" disabled={running || !prompt.trim()}>
            Run task
          </Button>
          {running && (
            <Button
              type="button"
              onClick={cancel}
              disabled={!runId || status === 'cancelling'}
              variant="secondary"
            >
              Cancel
            </Button>
          )}
        </div>
      </form>
      {status !== 'idle' && (
        <p className="mt-4 text-sm capitalize" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="mt-2 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
      {timeline.length > 0 && (
        <>
          <h3 className="mt-5 font-medium">Timeline</h3>
          <ol className="mt-2 list-decimal space-y-1 ps-6 text-sm text-[#adbcb4]">
            {timeline.map((entry, index) => (
              <li key={index}>{entry}</li>
            ))}
          </ol>
        </>
      )}
      {answer && (
        <p className="mt-5 whitespace-pre-wrap rounded-md bg-[#171f1c] p-4">
          {answer}
        </p>
      )}
    </section>
  );
}
