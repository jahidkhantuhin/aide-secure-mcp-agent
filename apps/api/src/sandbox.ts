import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router, type Request } from 'express';
import { sandboxViewSchema, type SandboxSession } from '@aide/shared/domain';
import type { SandboxRepository } from './sandbox-repository.js';

export function createSandboxRouter(
  repository: SandboxRepository,
  settings: {
    secret: string;
    origin: string;
    ttlSeconds: number;
    requestLimit: number;
    tokenBudget: number;
  },
) {
  const router = Router();
  const { secure, name, signature, sessionId } = sandboxCookie(
    settings.origin,
    settings.secret,
  );

  function toView(session: SandboxSession) {
    return sandboxViewSchema.parse({
      world: session.world,
      expiresAt: session.expiresAt.toISOString(),
      tokensRemaining: session.tokensRemaining,
    });
  }

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.post('/', async (req, res) => {
    if (req.get('Origin') !== settings.origin) {
      res.status(403).json({ error: 'Origin forbidden' });
      return;
    }
    const now = new Date();
    const id = sessionId(req);
    if (id && (await repository.read(id, now))) {
      const session = await repository.consume(id, now, settings.requestLimit);
      if (!session) {
        res.status(429).json({ error: 'Sandbox request limit reached' });
        return;
      }
      res.json(toView(session));
      return;
    }

    const session = await repository.create(
      now,
      settings.ttlSeconds,
      settings.tokenBudget,
    );
    res.cookie(name, session._id + '.' + signature(session._id), {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      expires: session.expiresAt,
      path: '/',
    });
    res.status(201).json(toView(session));
  });
  router.get('/', async (req, res) => {
    const now = new Date();
    const id = sessionId(req);
    const session = id
      ? await repository.consume(id, now, settings.requestLimit)
      : null;
    if (session) {
      res.json(toView(session));
      return;
    }
    if (id && (await repository.read(id, now))) {
      res.status(429).json({ error: 'Sandbox request limit reached' });
      return;
    }
    res.status(401).json({ error: 'Sandbox session expired or missing' });
  });
  return router;
}
export function sandboxCookie(origin: string, secret: string) {
  const secure = origin.startsWith('https:');
  const name = secure ? '__Host-aide_sandbox' : 'aide_sandbox';
  const signature = (id: string) =>
    createHmac('sha256', secret)
      .update('aide:sandbox:' + id)
      .digest('base64url');

  function sessionId(req: Request) {
    const value = req.headers.cookie
      ?.split(';')
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(name + '='))
      ?.slice(name.length + 1);
    if (!value || !/^[0-9a-f-]{36}\.[\w-]{43}$/.test(value)) return null;
    const [id, signed] = value.split('.');
    return timingSafeEqual(Buffer.from(signed), Buffer.from(signature(id)))
      ? id
      : null;
  }

  return { secure, name, signature, sessionId };
}
