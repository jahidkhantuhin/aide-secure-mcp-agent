import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, [process.env.npm_execpath, 'test'], {
  env: {
    ...process.env,
    TEST_MONGODB_URI: 'mongodb://localhost:27027/aide?replicaSet=rs0',
    TEST_REDIS_URL: 'redis://localhost:6389',
  },
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
