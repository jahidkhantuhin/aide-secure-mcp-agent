'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function SignOut() {
  const router = useRouter();
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  async function signOut() {
    setError(false);
    setPending(true);
    try {
      const response = await fetch('/api/auth/sign-out', { method: 'POST' });
      if (!response.ok) {
        setError(true);
        return;
      }
      router.replace('/login');
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={signOut}
        className="rounded border border-neutral-500 px-4 py-2"
      >
        {pending ? 'Signing out…' : 'Sign out'}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-red-300">
          Unable to sign out. Try again.
        </p>
      )}
    </>
  );
}
