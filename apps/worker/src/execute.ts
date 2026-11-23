import {
  approvalSchema,
  type Approval,
  type Resolution,
} from '@aide/shared/approval';
import { approvalRunEvent, type Run, type RunEvent } from '@aide/shared/domain';
import { seedWorld } from '@aide/mock-world';
import { calendarEventSchema } from '@aide/shared/mock-world';
import type { ClientSession, MongoClient } from 'mongodb';
import { checkEgress } from '@aide/guard/egress';

export async function executeOnce(
  mongo: MongoClient,
  key: string,
  now: Date,
  effect: (session: ClientSession) => Promise<void>,
) {
  const keys = mongo.db().collection<{
    _id: string;
    key: string;
    status: 'completed';
    createdAt: Date;
    expiresAt: Date;
  }>('idempotencyKeys');
  return mongo.withSession((session) =>
    session.withTransaction(async () => {
      if (await keys.findOne({ key }, { session })) return false;
      await keys.insertOne(
        {
          _id: key,
          key,
          status: 'completed',
          createdAt: now,
          expiresAt: new Date(now.getTime() + 7 * 86400000),
        },
        { session },
      );
      await effect(session);
      return true;
    }),
  );
}

export function createApprovalProcessor(
  mongo: MongoClient,
  resume: (runId: string, resolution: Resolution) => Promise<Resolution>,
  clock = () => new Date(),
) {
  const db = mongo.db();
  const approvals = db.collection<Approval>('approvals');
  const calendar = db.collection<{
    _id: string;
    ownerId: string;
    eventId: string;
    event: unknown;
  }>('mockCalendar');
  const outbox = db.collection<{
    _id: string;
    ownerId: string;
    content: unknown;
    sentAt: Date;
  }>('mockOutbox');

  return async (id: string) => {
    const candidate = await approvals.findOne({ _id: id });
    if (!candidate || candidate.processedAt) return;
    const initial = approvalSchema.parse(candidate);
    if (
      initial.status !== 'approved' &&
      initial.status !== 'rejected' &&
      initial.status !== 'undone'
    )
      return;
    const now = clock();
    if (
      initial.status === 'approved' &&
      (!initial.undoUntil || initial.undoUntil > now)
    ) {
      throw new Error('Undo window is still open');
    }
    await resume(initial.runId, initial.status);
    await executeOnce(mongo, id, now, async (session) => {
      const row = await approvals.findOne({ _id: id }, { session });
      if (!row || row.processedAt || row.status !== initial.status)
        throw new Error('Approval changed before execution');
      const item = approvalSchema.parse(row);
      let final = item.status;
      let failureMessage =
        'The calendar changed after this action was previewed.';
      if (
        item.status === 'approved' &&
        item.action.tool === 'send' &&
        checkEgress(item.action.content).outcome === 'deny'
      ) {
        final = 'failed';
        failureMessage = 'Egress blocked the outbound action.';
        await db.collection('guardActivity').insertOne(
          {
            principal: { kind: 'owner', id: item.ownerId },
            layer: 'egress',
            outcome: 'blocked',
            reason: failureMessage,
            at: now,
            expiresAt: new Date(now.getTime() + 7 * 86400000),
          },
          { session },
        );
      } else if (item.status === 'approved' && item.action.tool === 'send') {
        await outbox.insertOne(
          {
            _id: id,
            ownerId: item.ownerId,
            content: item.action.content,
            sentAt: now,
          },
          { session },
        );
        final = 'executed';
      } else if (item.status === 'approved' && item.preview.calendar) {
        const { before, after } = item.preview.calendar;
        const calendarId = item.ownerId + ':' + before.id;
        const saved = await calendar.findOne({ _id: calendarId }, { session });
        const current = saved
          ? calendarEventSchema.parse(saved.event)
          : seedWorld(item.ownerId).calendar.find(
              (entry) => entry.id === before.id,
            );
        if (current?.revision !== before.revision) final = 'failed';
        else {
          await calendar.updateOne(
            { _id: calendarId },
            {
              $set: { ownerId: item.ownerId, eventId: before.id, event: after },
            },
            { upsert: true, session },
          );
          final = 'executed';
        }
      }
      await approvals.updateOne(
        { _id: id },
        { $set: { status: final, processedAt: now }, $inc: { version: 1 } },
        { session },
      );
      const status =
        final === 'executed'
          ? 'completed'
          : final === 'failed'
            ? 'failed'
            : 'cancelled';
      await db
        .collection<Run>('runs')
        .updateOne(
          { _id: item.runId },
          { $set: { status, updatedAt: now } },
          { session },
        );
      const event =
        status === 'completed'
          ? { type: 'RUN_FINISHED' }
          : status === 'failed'
            ? {
                type: 'RUN_ERROR',
                message: failureMessage,
              }
            : { type: 'RUN_CANCELLED' };
      await db
        .collection<RunEvent>('runEvents')
        .insertOne(
          approvalRunEvent(item.runId, final === 'undone' ? 5 : 4, now, event),
          { session },
        );
    });
  };
}
