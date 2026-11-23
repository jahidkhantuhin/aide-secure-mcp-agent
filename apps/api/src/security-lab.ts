import { randomUUID } from 'node:crypto';
import { checkEgress } from '@aide/guard/egress';
import {
  attackAttemptSchema,
  labResultSchema,
  type SandboxSession,
} from '@aide/shared/domain';
import { teamRecipients } from '@aide/shared/policy';
import { Router, json, type Request } from 'express';
import type { Db } from 'mongodb';
import { z } from 'zod';

const input = z.strictObject({ fixture: z.enum(['routine', 'restricted']) });

export function createSecurityLab(
  db: Db,
  origin: string,
  getSession: (req: Request) => Promise<SandboxSession | 401 | 429>,
) {
  const router = Router();
  router.post(
    '/',
    async (req, res, next) => {
      if (req.get('Origin') !== origin) {
        res.sendStatus(403);
        return;
      }
      next();
    },
    json({ limit: '1kb' }),
    async (req, res) => {
      const session = await getSession(req);
      if (typeof session === 'number') {
        res.sendStatus(session);
        return;
      }
      const parsed = input.safeParse(req.body);
      if (!parsed.success) {
        res.sendStatus(400);
        return;
      }
      const { fixture } = parsed.data;
      const decision = checkEgress({
        to: teamRecipients[0],
        subject: 'Demo checklist',
        body:
          fixture === 'restricted'
            ? '[restricted] QA sample'
            : 'The checklist is ready.',
      });
      const record = attackAttemptSchema.parse({
        _id: randomUUID(),
        sandboxSessionId: session._id,
        fixture,
        outcome: decision.outcome === 'allow' ? 'allowed' : 'blocked',
        reason: decision.reasons.join(' '),
        createdAt: new Date(),
        expiresAt: session.expiresAt,
      });
      const attempts = db.collection<typeof record>('attackAttempts');
      await attempts.insertOne(record);
      const [totals] = await attempts
        .aggregate<{ attempts: number; blocked: number }>([
          {
            $match: {
              sandboxSessionId: session._id,
              expiresAt: { $gt: new Date() },
            },
          },
          {
            $group: {
              _id: null,
              attempts: { $sum: 1 },
              blocked: {
                $sum: { $cond: [{ $eq: ['$outcome', 'blocked'] }, 1, 0] },
              },
            },
          },
        ])
        .toArray();
      res.json(
        labResultSchema.parse({
          id: record._id,
          outcome: record.outcome,
          reason: record.reason,
          attempts: totals?.attempts ?? 0,
          blocked: totals?.blocked ?? 0,
        }),
      );
    },
  );
  return router;
}
