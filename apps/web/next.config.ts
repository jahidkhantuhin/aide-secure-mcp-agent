import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';

try {
  loadEnvFile(resolve('../../.env'));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const apiOrigin = new URL(
  process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000',
).origin;
const config: NextConfig = {
  transpilePackages: ['@aide/shared'],
  async rewrites() {
    return [{ source: '/api/health', destination: apiOrigin + '/health' }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};
export default config;
