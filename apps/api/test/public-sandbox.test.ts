import express from 'express';
import type { MongoClient } from 'mongodb';
import { createClient } from 'redis';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { configSchema } from '../src/config.js';
import { createSessionRoutes } from '../src/session-routes.js';
import { createPublicSandboxLimits } from '../src/public-sandbox.js';

describe('public sandbox', () => {
  it.each([
    { AIDE_LLM_PROVIDER: 'gemini' },
    { AIDE_LLM_PROVIDER: 'ollama' },
    { AIDE_LLM_PROVIDER: 'mock', GOOGLE_GENERATIVE_AI_API_KEY: 'fixture' },
  ])('refuses a real model provider or credential at startup', (settings) => {
    const result = configSchema.safeParse({
      SANDBOX_PUBLIC: 'true',
      ...settings,
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0].path).toEqual(['SANDBOX_PUBLIC']);
  });

  it('preserves owner provider configuration when public mode is off', () => {
    expect(
      configSchema.parse({
        SANDBOX_PUBLIC: 'false',
        AIDE_LLM_PROVIDER: 'gemini',
        GOOGLE_GENERATIVE_AI_API_KEY: 'fixture',
      }).SANDBOX_PUBLIC,
    ).toBe(false);
  });

  it('requires rate limiting and rejects excess requests before accessing storage', async () => {
    const config = configSchema.parse({ SANDBOX_PUBLIC: 'true' });
    const mongo = { db: () => ({}) } as unknown as MongoClient;
    expect(() => createSessionRoutes(mongo, config, 'fixture')).toThrow(
      'Redis limits',
    );
    const limits = { request: vi.fn().mockResolvedValue(false), task: vi.fn() };
    const app = express().use(
      createSessionRoutes(mongo, config, 'fixture', undefined, limits),
    );
    await request(app).post('/api/sandbox').expect(429);
    expect(limits.request).toHaveBeenCalledWith(null);
    expect(limits.task).not.toHaveBeenCalled();
  });
});

const redisUrl = process.env.TEST_REDIS_URL;
it.skipIf(!redisUrl)(
  'enforces atomic global budgets and isolated session request limits in Redis',
  async () => {
    const redis = createClient({ url: redisUrl });
    const clock = vi
      .spyOn(Date, 'now')
      .mockReturnValue(
        Date.now() +
          (1_000_000 + Math.floor(Math.random() * 100_000_000)) * 3_600_000,
      );
    try {
      await redis.connect();
      const limits = createPublicSandboxLimits(redis, 3, 1, 1000);
      expect(await limits.request('first')).toBe(true);
      expect(await limits.request('first')).toBe(false);
      expect(await limits.request('second')).toBe(true);
      expect(await limits.request(null)).toBe(false);
      const tasks = await Promise.all([limits.task(1000), limits.task(1000)]);
      expect(tasks.filter(Boolean)).toHaveLength(1);
    } finally {
      clock.mockRestore();
      if (redis.isOpen) redis.destroy();
    }
  },
);
