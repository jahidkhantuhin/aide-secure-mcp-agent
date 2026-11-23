import { redirect } from 'next/navigation';
import { ownerViewSchema } from '@aide/shared/domain';
import { sessionRequest } from '@/lib/session-api';
import { SignOut } from './sign-out';
import { Assistant } from '../assistant';

export default async function WorkspacePage() {
  const response = await sessionRequest('/api/auth/me');
  if (!response || response.status === 401) redirect('/login');
  if (!response.ok) throw new Error('Owner session lookup failed');
  const owner = ownerViewSchema.parse(await response.json());

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <a href="/" className="text-emerald-300">
        Aide
      </a>
      <h1 className="mt-6 text-3xl font-semibold">Owner workspace</h1>
      <p className="my-5">Signed in as {owner.name}</p>
      <div className="flex items-center gap-4">
        <SignOut />
        <a href="/trust" className="text-emerald-300">
          Trust settings
        </a>
      </div>
      <Assistant scope="owner" />
      <a href="/approvals" className="mt-5 inline-block text-emerald-300">
        Request approval for a mock action
      </a>
    </main>
  );
}
