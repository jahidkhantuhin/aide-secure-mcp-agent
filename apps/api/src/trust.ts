import type { Principal } from '@aide/shared/domain';
import {
  policyInputSchema,
  trustViewSchema,
  updatePolicySchema,
} from '@aide/shared/policy';
import { Router, type Request } from 'express';
import type { PolicyRepository } from './policy-repository.js';

export function createTrustRouter(
  repository: PolicyRepository,
  origin: string,
  owner: (req: Request) => Promise<Principal | null>,
) {
  const router = Router();
  router.use(async (req, res, next) => {
    if (req.method !== 'GET' && req.get('origin') !== origin) {
      res.status(403).json({ error: 'Origin forbidden' });
      return;
    }
    const principal = await owner(req);
    if (!principal) {
      res.status(401).json({ error: 'Sign in required' });
      return;
    }
    res.locals.principal = principal;
    next();
  });
  router.get('/', async (_req, res) => {
    const principal: Principal = res.locals.principal;
    const [policy, grants, decisions] = await Promise.all([
      repository.latest(principal),
      repository.activeGrants(principal, new Date()),
      repository.decisions(principal),
    ]);
    res.json(
      trustViewSchema.parse({
        ...policy,
        grants: grants.map(({ _id, tool, recipients, expiresAt }) => ({
          id: _id,
          tool,
          recipients,
          expiresAt: expiresAt.toISOString(),
        })),
        decisions: decisions.map(
          ({ _id, tool, policyVersion, action, createdAt, decision }) => ({
            id: _id,
            tool,
            policyVersion,
            source: action === 'policy_preview' ? 'preview' : 'agent',
            at: createdAt.toISOString(),
            decision,
          }),
        ),
      }),
    );
  });
  router.post('/mode', async (req, res) => {
    const input = updatePolicySchema.safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ error: 'Invalid trust setting' });
      return;
    }
    const { expectedVersion, tool, mode } = input.data;
    const changed = await repository.change(
      res.locals.principal,
      expectedVersion,
      tool,
      mode,
    );
    res.sendStatus(changed ? 204 : 409);
  });
  router.post('/grants', async (_req, res) => {
    await repository.grantTeamMail(res.locals.principal, new Date());
    res.sendStatus(201);
  });
  router.post('/grants/:id/revoke', async (req, res) => {
    res.sendStatus(
      (await repository.revoke(res.locals.principal, req.params.id, new Date()))
        ? 204
        : 404,
    );
  });
  router.post('/preview', async (req, res) => {
    const input = policyInputSchema.safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ error: 'Invalid preview context' });
      return;
    }
    res.json(
      await repository.decide(
        res.locals.principal,
        input.data,
        'preview',
        new Date(),
      ),
    );
  });
  return router;
}
