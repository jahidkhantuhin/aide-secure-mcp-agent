import { redirect } from 'next/navigation';
import { trustViewSchema } from '@aide/shared/policy';
import { sessionRequest } from '@/lib/session-api';
import { TrustControls } from './trust-controls';

export default async function TrustPage() {
  const response = await sessionRequest('/trust');
  if (!response || response.status === 401) redirect('/login');
  if (!response.ok) throw new Error('Trust settings are unavailable');
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <a href="/workspace" className="text-emerald-300">
        Workspace
      </a>
      <h1 className="mt-6 text-3xl font-semibold">Trust</h1>
      <TrustControls
        initial={trustViewSchema.parse(await response.json())}
        initialTime={Date.now()}
      />
    </main>
  );
}
