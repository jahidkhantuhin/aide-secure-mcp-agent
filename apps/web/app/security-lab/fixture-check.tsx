'use client';

import { Button } from '@/components/ui/button';
import { labResultSchema, type LabResult } from '@aide/shared/domain';
import { useState } from 'react';

export function FixtureCheck() {
  const [result, setResult] = useState<LabResult>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function run(fixture: 'routine' | 'restricted') {
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/security-lab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixture }),
      });
      if (!response.ok) {
        setError(
          response.status === 429
            ? 'Demo request limit reached. Try again in a minute.'
            : 'Could not run the fixture. Check that your demo session is active.',
        );
        return;
      }
      setResult(labResultSchema.parse(await response.json()));
    } catch {
      setError('Could not read the fixture result.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-7 space-y-4" aria-label="Outbound mail fixtures">
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={pending}
          variant="warning"
          onClick={() => void run('restricted')}
        >
          Check restricted sample
        </Button>
        <Button
          disabled={pending}
          variant="secondary"
          onClick={() => void run('routine')}
        >
          Check routine sample
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-rose-300">
          {error}
        </p>
      )}
      {result && (
        <div
          role="status"
          className="space-y-2 rounded-lg border border-[#32403a] bg-[#171f1c] p-4"
        >
          <p className="font-semibold capitalize">Egress · {result.outcome}</p>
          <p>
            {result.attempts} {result.attempts === 1 ? 'attempt' : 'attempts'} ·{' '}
            {result.blocked} blocked
          </p>
          <details id={result.id}>
            <summary className="cursor-pointer text-emerald-300">
              Decision trace
            </summary>
            <p className="mt-2">{result.reason}</p>
          </details>
        </div>
      )}
    </section>
  );
}
