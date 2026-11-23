import { DemoButton } from '../demo-button';
import { sessionRequest } from '@/lib/session-api';
import { FixtureCheck } from './fixture-check';

export default async function SecurityLabPage() {
  const session = await sessionRequest('/api/sandbox');
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <a href={session?.ok ? '/demo' : '/'} className="text-emerald-300">
        {session?.ok ? 'Demo workspace' : 'Aide'}
      </a>
      <h1 className="mt-6 text-3xl font-semibold">Security Lab</h1>
      <p className="mt-3 text-neutral-300">
        Check how Aide screens sample outbound mail. The check sends no mail.
        Fixture results expire with your demo session.
      </p>
      {session?.ok ? (
        <FixtureCheck />
      ) : (
        <div className="mt-6">
          {session?.status === 429 ? (
            <p role="alert">Demo request limit reached. Refresh in a minute.</p>
          ) : (
            <DemoButton />
          )}
        </div>
      )}
    </main>
  );
}
