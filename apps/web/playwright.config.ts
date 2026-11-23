import { defineConfig } from '@playwright/test';

const web = 'http://127.0.0.1:4300';
const api = 'http://127.0.0.1:4400';
const mongo = new URL(
  process.env.TEST_MONGODB_URI ??
    'mongodb://localhost:27027/aide?replicaSet=rs0',
);
mongo.pathname = '/aide_web_smoke';
const redis = new URL(process.env.TEST_REDIS_URL ?? 'redis://localhost:6389');
redis.pathname = '/15';

export default defineConfig({
  testDir: './test',
  use: { baseURL: web },
  webServer: [
    {
      command: 'pnpm --filter @aide/api exec tsx src/server.ts',
      url: api + '/health',
      env: {
        SANDBOX_PUBLIC: 'true',
        API_PORT: '4400',
        WEB_ORIGIN: web,
        AIDE_LLM_PROVIDER: 'mock',
        MONGODB_URI: mongo.href,
        REDIS_URL: redis.href,
      },
    },
    {
      command:
        'next build --webpack && next start --hostname 127.0.0.1 --port 4300',
      url: web,
      timeout: 120_000,
      env: { SANDBOX_PUBLIC: 'true', NEXT_PUBLIC_API_URL: api },
    },
  ],
});
