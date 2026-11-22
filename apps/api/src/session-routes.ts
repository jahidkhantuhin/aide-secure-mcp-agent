import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { ownerViewSchema } from '@aide/shared/domain';
import { Router } from 'express';
import type { MongoClient } from 'mongodb';
import type { z } from 'zod';
import { createOwnerAuth } from './auth.js';
import type { configSchema } from './config.js';
import { ensureIndexes } from './database.js';
import { SandboxRepository } from './sandbox-repository.js';
import { createSandboxRouter } from './sandbox.js';

export function createSessionRoutes(
  mongo: MongoClient,
  config: z.infer<typeof configSchema>,
  sandboxSecret: string,
) {
  const router = Router();
  const origin = new URL(config.WEB_ORIGIN).origin;
  const db = mongo.db();
  let indexes: Promise<void> | undefined;
  function ready() {
    indexes ??= ensureIndexes(db).catch((error: unknown) => {
      indexes = undefined;
      throw error;
    });
    return indexes;
  }

  router.use(['/api/auth', '/api/sandbox'], async (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    await ready();
    next();
  });
  const secret = config.AIDE_SESSION_SECRET;
  if (secret) {
    const auth = createOwnerAuth(mongo, origin, secret);
    const handler = toNodeHandler(auth);
    router.get('/api/auth/me', async (req, res) => {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
        query: { disableRefresh: true },
      });
      if (!session) {
        res.status(401).json({ error: 'Sign in required' });
        return;
      }
      const { id, email, name } = session.user;
      res.json(ownerViewSchema.parse({ id, email, name }));
    });
    router.post(['/api/auth/sign-in/email', '/api/auth/sign-out'], handler);
  } else {
    router.get('/api/auth/me', (_req, res) => {
      res.status(401).json({ error: 'Sign in required' });
    });
  }
  router.use(
    '/api/sandbox',
    createSandboxRouter(new SandboxRepository(db), {
      secret: sandboxSecret,
      origin,
      ttlSeconds: config.SANDBOX_TTL_SECONDS,
      requestLimit: config.SANDBOX_REQUESTS_PER_MINUTE,
      tokenBudget: config.SANDBOX_TOKEN_BUDGET,
    }),
  );
  return router;
}
