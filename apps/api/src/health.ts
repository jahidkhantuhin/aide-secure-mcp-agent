import type { Health } from '@aide/shared';

export type Probes = Record<
  keyof Health['dependencies'],
  () => Promise<unknown>
>;

export async function checkHealth(probes: Probes): Promise<Health> {
  const [mongo, redis] = await Promise.allSettled([
    Promise.resolve().then(probes.mongo),
    Promise.resolve().then(probes.redis),
  ]);
  const healthy = mongo.status === 'fulfilled' && redis.status === 'fulfilled';
  return {
    status: healthy ? 'ok' : 'unavailable',
    dependencies: {
      mongo: mongo.status === 'fulfilled' ? 'up' : 'down',
      redis: redis.status === 'fulfilled' ? 'up' : 'down',
    },
  };
}
