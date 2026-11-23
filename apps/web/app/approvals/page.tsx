import { redirect } from 'next/navigation';
import { sessionRequest } from '@/lib/session-api';
import { ApprovalBoard } from './board';

export default async function ApprovalsPage() {
  const session = await sessionRequest('/api/auth/me');
  if (!session?.ok) redirect('/login');
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <a href="/workspace" className="text-emerald-300">
        Workspace
      </a>
      <h1 className="mt-5 text-3xl font-semibold">Approvals</h1>
      <ApprovalBoard />
    </main>
  );
}
