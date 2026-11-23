'use client';

import { Button } from '@/components/ui/button';

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
      <Button
        type="button"
        disabled={pending}
        onClick={signOut}
        variant="secondary"
      >
        {pending ? 'Signing out…' : 'Sign out'}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-red-300">
          Unable to sign out. Try again.
        </p>
      )}
    </>
  );
}
