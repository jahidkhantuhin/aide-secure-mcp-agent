import { randomUUID } from 'node:crypto';
import { createApprovalGraph } from '@aide/agent/approval';
import { seedWorld } from '@aide/mock-world';
import {
  actionSchema,
  approvalQueueName,
  approvalSchema,
  approvalViewSchema,
  resolveApprovalSchema,
  type Action,
  type Approval,
} from '@aide/shared/approval';
import { calendarEventSchema } from '@aide/shared/mock-world';
import { approvalRunEvent, type Run, type RunEvent } from '@aide/shared/domain';
import type { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { Router, type Request } from 'express';
import type { MongoClient } from 'mongodb';
import { z } from 'zod';
import { PolicyRepository } from './policy-repository.js';
import { checkEgress } from '@aide/guard/egress';
import { recordGuard } from './guard-activity.js';

export function createApprovalsRouter(
  mongo: MongoClient,
  checkpointer: MongoDBSaver,
  redisUrl: string,
  undoMs: number,
  origin: string,
  owner: (req: Request) => Promise<string | undefined>,
) {
  const router = Router();
  const db = mongo.db();
  const approvals = db.collection<Approval>('approvals');
  const events = db.collection<RunEvent>('runEvents');
  const policy = new PolicyRepository(db);
  const graph = createApprovalGraph(checkpointer);
  async function preview(ownerId: string, action: Action, runId: string) {
    const emails = action.tool === 'send' ? [action.content.to] : [];
    const policyDecision = await policy.decide(
      { id: ownerId, kind: 'owner' },
      { tool: action.tool, recipients: emails, sensitivity: 'internal' },
      'preview',
      new Date(),
      runId,
    );
    const egress = action.tool === 'send' ? checkEgress(action.content) : null;
    if (egress && egress.outcome !== 'allow')
      await recordGuard(
        db,
        { kind: 'owner', id: ownerId },
        {
          layer: 'egress',
          outcome: egress.outcome === 'deny' ? 'blocked' : 'approval_required',
          reason: egress.reasons.join(' '),
        },
      );
    const decision =
      egress?.outcome === 'deny' ||
      (policyDecision.outcome === 'allow' &&
        egress?.outcome === 'require_approval')
        ? egress
        : policyDecision;
    const recipients = emails.map((email) => ({
      email,
      external: !email.toLowerCase().endsWith('@example.test'),
    }));
    const high = recipients.some(({ external }) => external);
    const stored =
      action.tool === 'apply_change'
        ? await db
            .collection('mockCalendar')
            .findOne({ ownerId, eventId: action.eventId })
        : null;
    const before =
      action.tool === 'apply_change'
        ? stored
          ? calendarEventSchema.parse(stored.event)
          : seedWorld(ownerId).calendar.find(({ id }) => id === action.eventId)
        : null;
    if (action.tool === 'apply_change' && !before) return null;
    return {
      decision,
      recipients,
      risk: high ? ('high' as const) : ('moderate' as const),
      reversibility:
        action.tool === 'send'
          ? 'Undo before the send reaches the mock outbox.'
          : 'Undo before the move. The original event is retained.',
      riskReason: high
        ? 'An external recipient could receive the contents.'
        : action.tool === 'send'
          ? 'The recipient could receive incorrect information.'
          : 'Moving the meeting could create a scheduling conflict.',
      ...(before && action.tool === 'apply_change'
        ? {
            calendar: {
              before,
              after: {
                ...before,
                ...action.when,
                revision: before.revision + 1,
              },
            },
          }
        : {}),
    };
  }

  router.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.get('origin') !== origin) {
      res.sendStatus(403);
      return;
    }
    const ownerId = await owner(req);
    if (!ownerId) {
      res.sendStatus(401);
      return;
    }
    res.locals.ownerId = ownerId;
    next();
  });

  router.get('/', async (_req, res) => {
    const rows = await approvals
      .find({ ownerId: res.locals.ownerId })
      .sort({ createdAt: -1 })
      .limit(40)
      .toArray();
    res.json(
      rows.map((row) => {
        const { ownerId, processedAt, ...item } = approvalSchema.parse(row);
        void ownerId;
        void processedAt;
        return approvalViewSchema.parse({
          ...item,
          createdAt: row.createdAt.toISOString(),
          undoUntil: row.undoUntil?.toISOString(),
        });
      }),
    );
  });

  router.post('/', async (req, res) => {
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.sendStatus(400);
      return;
    }
    const ownerId: string = res.locals.ownerId;
    const id = randomUUID();
    const runId = randomUUID();
    const now = new Date();
    const card = await preview(ownerId, parsed.data, runId);
    if (!card) {
      res.sendStatus(404);
      return;
    }
    if (card.decision.outcome === 'deny') {
      res.status(403).json(card.decision);
      return;
    }
    const errors = await checkpointer.setup();
    if (errors.length)
      throw new AggregateError(errors, 'Approval checkpointer unavailable');
    await graph.pause(runId, id);
    const approval = approvalSchema.parse({
      _id: id,
      runId,
      ownerId,
      action: parsed.data,
      preview: card,
      status: 'pending',
      version: 0,
      createdAt: now,
    });
    await mongo.withSession((session) =>
      session.withTransaction(async () => {
        await approvals.insertOne(approval, { session });
        await db.collection<Run>('runs').insertOne(
          {
            _id: runId,
            principal: { kind: 'owner', id: ownerId },
            status: 'pending',
            createdAt: now,
            updatedAt: now,
          },
          { session },
        );
        await events.insertMany(
          [
            approvalRunEvent(runId, 1, now, { type: 'RUN_STARTED' }),
            approvalRunEvent(runId, 2, now, {
              type: 'APPROVAL_REQUESTED',
              approvalId: id,
            }),
          ],
          { session },
        );
      }),
    );
    res.status(201).json({ id, runId });
  });

  router.post('/:id/edit', async (req, res) => {
    const parsed = z
      .strictObject({ version: z.int().nonnegative(), action: actionSchema })
      .safeParse(req.body);
    if (!parsed.success) {
      res.sendStatus(400);
      return;
    }
    const ownerId: string = res.locals.ownerId;
    const { version, action } = parsed.data;
    const filter = {
      _id: req.params.id,
      ownerId,
      version,
      status: 'pending' as const,
    };
    const row = await approvals.findOne(filter);
    if (!row || row.action.tool !== action.tool) {
      res.sendStatus(409);
      return;
    }
    const card = await preview(ownerId, action, row.runId);
    if (!card || card.decision.outcome === 'deny') {
      res.sendStatus(403);
      return;
    }
    const updated = await approvals.updateOne(filter, {
      $set: { action, preview: card },
      $inc: { version: 1 },
    });
    res.sendStatus(updated.modifiedCount ? 204 : 409);
  });

  router.post('/:id/resolve', async (req, res) => {
    const parsed = resolveApprovalSchema.safeParse(req.body);
    if (!parsed.success) {
      res.sendStatus(400);
      return;
    }
    const ownerId: string = res.locals.ownerId;
    const { version, decision } = parsed.data;
    const filter = {
      _id: req.params.id,
      ownerId,
      version,
      status: 'pending' as const,
    };
    const saved = await approvals.findOne(filter);
    if (!saved) {
      res.sendStatus(409);
      return;
    }
    const now = new Date();
    const action = saved.action;
    const card =
      decision === 'approved'
        ? await preview(ownerId, action, saved.runId)
        : saved.preview;
    if (
      !card ||
      (decision === 'approved' && card.decision.outcome === 'deny')
    ) {
      res.status(403).json(card?.decision);
      return;
    }
    if (
      decision === 'approved' &&
      saved.preview.calendar?.before.revision !== card.calendar?.before.revision
    ) {
      res
        .status(409)
        .json({ error: 'The calendar event changed since this preview.' });
      return;
    }
    const updated = await mongo.withSession((session) =>
      session.withTransaction(async () => {
        const result = await approvals.updateOne(
          filter,
          {
            $inc: { version: 1 },
            $set: {
              status: decision,
              action,
              preview: card,
              ...(decision === 'approved'
                ? { undoUntil: new Date(now.getTime() + undoMs) }
                : {}),
              ...(card.calendar && decision === 'approved'
                ? {
                    inverse: {
                      eventId: card.calendar.before.id,
                      revision: card.calendar.after.revision,
                      when: {
                        start: card.calendar.before.start,
                        end: card.calendar.before.end,
                      },
                    },
                  }
                : {}),
            },
          },
          { session },
        );
        if (!result.modifiedCount) return false;
        await events.insertOne(
          approvalRunEvent(saved.runId, 3, now, {
            type: 'APPROVAL_RESOLVED',
            approvalId: saved._id,
            decision,
            approverId: ownerId,
          }),
          { session },
        );
        return true;
      }),
    );
    res.sendStatus(updated ? 204 : 409);
  });

  router.post('/:id/undo', async (req, res) => {
    const now = new Date();
    const result = await mongo.withSession((session) =>
      session.withTransaction(async () => {
        const row = await approvals.findOneAndUpdate(
          {
            _id: req.params.id,
            ownerId: res.locals.ownerId,
            status: 'approved',
            undoUntil: { $gt: now },
          },
          { $set: { status: 'undone' }, $inc: { version: 1 } },
          { session, returnDocument: 'after' },
        );
        if (row)
          await events.insertOne(
            approvalRunEvent(row.runId, 4, now, {
              type: 'APPROVAL_UNDONE',
              approvalId: row._id,
            }),
            { session },
          );
        return row;
      }),
    );
    if (!result) {
      res.sendStatus(409);
      return;
    }
    const connection = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      connectTimeout: 1500,
    });
    connection.on('error', () => {});
    const queue = new Queue(approvalQueueName(db.databaseName), { connection });
    queue.on('error', () => {});
    try {
      await queue.remove(result._id);
    } catch {
      /* MongoDB already committed the cancellation. */
    } finally {
      try {
        await queue.close();
      } finally {
        connection.disconnect();
      }
    }
    res.sendStatus(204);
  });
  return router;
}
