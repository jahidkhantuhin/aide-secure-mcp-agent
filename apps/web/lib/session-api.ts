import 'server-only';
import { headers } from 'next/headers';

export async function sessionRequest(
  path:
    | '/api/auth/me'
    | '/api/sandbox'
    | '/trust'
    | '/activity'
    | '/activity?scope=sandbox',
) {
  const incoming = await headers();
  const cookie = incoming.get('cookie');
  if (!cookie) return null;
  const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';
  return fetch(new URL(path, api), {
    cache: 'no-store',
    headers: { cookie },
  }).catch(() => null);
}
