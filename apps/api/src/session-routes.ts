import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import type { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { ownerViewSchema } from '@aide/shared/domain';
import { Router, json, type Request } from 'express';
import type { MongoClient } from 'mongodb';
import type { z } from 'zod';
import { createOwnerAuth } from './auth.js';
import type { configSchema } from './config.js';
import { ensureIndexes } from './database.js';
import { SandboxRepository } from './sandbox-repository.js';
import { createSandboxRouter, sandboxCookie } from './sandbox.js';
import { createTaskRouter } from './tasks.js';
import { PolicyRepository } from './policy-repository.js';
import { createTrustRouter } from './trust.js';
import { createApprovalsRouter } from './approvals.js';
import { listGuardActivity } from './guard-activity.js';
import type { createPublicSandboxLimits } from './public-sandbox.js';
import { createSecurityLab } from './security-lab.js';

export function createSessionRoutes(
  mongo: MongoClient,
  config: z.infer<typeof configSchema>,
  sandboxSecret: string,
  checkpointer?: MongoDBSaver,
  publicLimits?: ReturnType<typeof createPublicSandboxLimits>,
) {
  const router = Router();
  const origin = new URL(config.WEB_ORIGIN).origin;
  const db = mongo.db();
  const cookie = sandboxCookie(origin, sandboxSecret);
  if (config.SANDBOX_PUBLIC) {
    if (!publicLimits) throw new Error('Public sandbox requires Redis limits');
    router.use(
      ['/api/sandbox', '/tasks', '/activity', '/api/security-lab'],
      async (req, res, next) => {
        if (!(await publicLimits.request(cookie.sessionId(req)))) {
          res
            .status(429)
            .json({ error: 'Public sandbox request limit reached' });
          return;
        }
        next();
      },
    );
  }
  let indexes: Promise<void> | undefined;
  function ready() {
    indexes ??= ensureIndexes(db).catch((error: unknown) => {
      indexes = undefined;
      throw error;
    });
    return indexes;
  }

  router.use(
    [
      '/api/auth',
      '/api/sandbox',
      '/api/security-lab',
      '/tasks',
      '/trust',
      '/approvals',
      '/activity',
    ],
    async (_req, res, next) => {
      res.set('Cache-Control', 'no-store');
      await ready();
      next();
    },
  );
  const secret = config.AIDE_SESSION_SECRET;
  const auth =
    secret && !config.SANDBOX_PUBLIC
      ? createOwnerAuth(mongo, origin, secret)
      : null;
  const getOwner = (req: Request) =>
    auth?.api.getSession({
      headers: fromNodeHeaders(req.headers),
      query: { disableRefresh: true },
    });
  if (auth) {
    const handler = toNodeHandler(auth);
    router.get('/api/auth/me', async (req, res) => {
      const session = await getOwner(req);
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
  const sandbox = new SandboxRepository(db);
  router.use(
    '/api/security-lab',
    createSecurityLab(db, origin, async (req) => {
      const id = cookie.sessionId(req);
      if (!id) return 401;
      const now = new Date();
      const session = await sandbox.consume(
        id,
        now,
        config.SANDBOX_REQUESTS_PER_MINUTE,
      );
      return session ?? ((await sandbox.read(id, now)) ? 429 : 401);
    }),
  );
  const policy = new PolicyRepository(db);
  router.use(
    '/trust',
    json({ limit: '16kb' }),
    createTrustRouter(policy, origin, async (req) => {
      const owner = await getOwner(req);
      return owner ? { kind: 'owner', id: owner.user.id } : null;
    }),
  );
  router.get('/activity', async (req, res) => {
    if (req.query.scope === 'sandbox') {
      const id = cookie.sessionId(req);
      if (!id || !(await sandbox.read(id, new Date()))) {
        res.sendStatus(401);
        return;
      }
      res.json(await listGuardActivity(db, { kind: 'sandbox', id }));
      return;
    }
    const owner = await getOwner(req);
    if (!owner) {
      res.sendStatus(401);
      return;
    }
    res.json(await listGuardActivity(db, { kind: 'owner', id: owner.user.id }));
  });
  if (checkpointer && !config.SANDBOX_PUBLIC)
    router.use(
      '/approvals',
      json({ limit: '16kb' }),
      createApprovalsRouter(
        mongo,
        checkpointer,
        config.REDIS_URL,
        config.AIDE_UNDO_SECONDS * 1000,
        origin,
        async (req) => (await getOwner(req))?.user.id,
      ),
    );
  if (checkpointer)
    router.use(
      '/tasks',
      json({ limit: '8kb' }),
      createTaskRouter(
        mongo,
        checkpointer,
        config,
        async (req) => {
          const id = req.query.scope === 'owner' ? null : cookie.sessionId(req);
          const session = id ? await sandbox.read(id, new Date()) : null;
          if (session) {
            return {
              principal: { kind: 'sandbox', id: session._id },
              world: session.world,
              charge: async () => {
                const cost = 1000;
                if (session.tokensRemaining < cost) return false;
                if (publicLimits && !(await publicLimits.task(cost)))
                  return false;
                return Boolean(
                  await sandbox.consume(
                    session._id,
                    new Date(),
                    config.SANDBOX_REQUESTS_PER_MINUTE,
                    cost,
                  ),
                );
              },
            };
          }
          if (req.query.scope === 'sandbox') return null;
          const owner = await getOwner(req);
          return owner
            ? { principal: { kind: 'owner', id: owner.user.id } }
            : null;
        },
        undefined,
        policy,
      ),
    );
  router.use(
    '/api/sandbox',
    createSandboxRouter(sandbox, {
      secret: sandboxSecret,
      origin,
      ttlSeconds: config.SANDBOX_TTL_SECONDS,
      requestLimit: config.SANDBOX_REQUESTS_PER_MINUTE,
      tokenBudget: config.SANDBOX_TOKEN_BUDGET,
    }),
  );
  return router;
}
