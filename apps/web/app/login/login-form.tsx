'use client';

import { Button } from '@/components/ui/button';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setError('');
    setPending(true);
    try {
      const response = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: values.get('email'),
          password: values.get('password'),
        }),
      });
      if (!response.ok) {
        setError(
          response.status === 429
            ? 'Too many attempts. Try again shortly.'
            : 'Sign-in failed. Check your credentials and owner setup.',
        );
        return;
      }
      router.replace('/workspace');
      router.refresh();
    } catch {
      setError('Unable to reach the API. Try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form method="post" onSubmit={signIn} className="mt-8 flex flex-col gap-5">
      <label className="grid gap-2">
        Email
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          className="rounded border border-neutral-600 bg-neutral-900 px-3 py-2"
        />
      </label>
      <label className="grid gap-2">
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded border border-neutral-600 bg-neutral-900 px-3 py-2"
        />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
    </form>
  );
}
