import { redirect } from 'next/navigation';
import { sandboxViewSchema } from '@aide/shared/domain';
import { sessionRequest } from '@/lib/session-api';
import { Assistant } from '../assistant';

export default async function DemoPage() {
  const response = await sessionRequest('/api/sandbox');
  if (!response || response.status === 401) redirect('/');
  if (response.status === 429) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        Demo request limit reached. Refresh in a minute.
      </main>
    );
  }
  if (!response.ok) throw new Error('Sandbox session lookup failed');
  const { world, tokensRemaining } = sandboxViewSchema.parse(
    await response.json(),
  );

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <a href="/" className="text-emerald-300">
        Aide
      </a>
      <h1 className="mt-6 text-3xl font-semibold">Demo workspace</h1>
      <dl className="mt-6 grid gap-3">
        <div>
          <dt>Mailbox</dt>
          <dd>{world.mailbox.length} messages</dd>
        </div>
        <div>
          <dt>Calendar</dt>
          <dd>{world.calendar.length} events</dd>
        </div>
        <div>
          <dt>Social</dt>
          <dd>{world.social.length} posts</dd>
        </div>
        <div>
          <dt>Token budget remaining</dt>
          <dd>{tokensRemaining}</dd>
        </div>
      </dl>
      <Assistant scope="sandbox" />
    </main>
  );
}
