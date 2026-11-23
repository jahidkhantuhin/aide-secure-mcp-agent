'use client';

import { Button } from '@/components/ui/button';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function DemoButton() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function enter() {
    setError('');
    setPending(true);
    try {
      const response = await fetch('/api/sandbox', { method: 'POST' });
      if (!response.ok) {
        setError(
          response.status === 429
            ? 'This demo has reached its request limit. Try again shortly.'
            : 'Unable to start the demo.',
        );
        return;
      }
      router.push('/demo');
      router.refresh();
    } catch {
      setError('Unable to reach the API. Try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <Button type="button" disabled={pending} onClick={enter}>
        {pending ? 'Opening demo…' : 'Try the demo, no signup'}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
