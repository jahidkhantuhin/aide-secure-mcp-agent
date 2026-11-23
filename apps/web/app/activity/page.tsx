import { redirect } from 'next/navigation';
import { activityItemSchema } from '@aide/shared/security';
import { sessionRequest } from '@/lib/session-api';

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const sandbox = (await searchParams).scope === 'sandbox';
  const response = await sessionRequest(
    sandbox ? '/activity?scope=sandbox' : '/activity',
  );
  if (!response || response.status === 401) redirect(sandbox ? '/' : '/login');
  if (!response.ok) throw new Error('Activity is unavailable.');
  const entries = activityItemSchema.array().parse(await response.json());
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <a href={sandbox ? '/demo' : '/workspace'} className="text-emerald-300">
        Workspace
      </a>
      <h1 className="mt-6 text-3xl font-semibold">Activity</h1>
      {entries.length === 0 && (
        <p className="mt-6 text-neutral-300">No guard activity yet.</p>
      )}
      <ul className="mt-6 space-y-3">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="rounded-lg border border-[#32403a] bg-[#171f1c] p-4"
          >
            <p className="font-semibold capitalize">
              {entry.layer} · {entry.outcome.replaceAll('_', ' ')}
            </p>
            <p className="mt-1 text-neutral-300">{entry.reason}</p>
            <time
              className="mt-2 block text-xs text-neutral-400"
              dateTime={entry.at}
            >
              {entry.at.slice(0, 16).replace('T', ' ')} UTC
            </time>
          </li>
        ))}
      </ul>
    </main>
  );
}
