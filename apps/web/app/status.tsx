'use client';

import { useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { healthSchema } from '@aide/shared';
import { Badge } from '@/components/ui/badge';

function Status() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['api-health'],
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/health', {
        signal,
        cache: 'no-store',
      });
      return healthSchema.parse(await response.json());
    },
    refetchInterval: 5_000,
    retry: false,
  });
  const healthy = !isError && data?.status === 'ok';
  const label = healthy
    ? 'API online'
    : isPending
      ? 'Checking API'
      : 'API unavailable';
  return (
    <Badge
      role="status"
      className={
        healthy
          ? 'border-emerald-800 text-emerald-300'
          : 'border-neutral-600 text-neutral-300'
      }
    >
      <span
        aria-hidden
        className={
          healthy
            ? 'size-2 rounded-full bg-emerald-400'
            : 'size-2 rounded-full bg-neutral-500'
        }
      />
      {label}
    </Badge>
  );
}

export function ApiStatus() {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <Status />
    </QueryClientProvider>
  );
}
