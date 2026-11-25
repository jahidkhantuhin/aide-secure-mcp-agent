import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { approvalQueueName, type Approval } from '@aide/shared/approval';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApprovalProcessor } from '../src/execute.js';

const uri = process.env.TEST_MONGODB_URI;
const redisUrl = process.env.TEST_REDIS_URL;

describe.skipIf(!uri || !redisUrl)('approval job', () => {
  const url = new URL(uri ?? 'mongodb://localhost:27027');
  url.pathname = '/aide_test_' + randomUUID().replaceAll('-', '');
  const mongo = new MongoClient(url.toString());
  const db = mongo.db();
  const approval = db.collection<Approval>('approvals');
  const connection = new Redis(redisUrl ?? 'redis://localhost:6389', {
    maxRetriesPerRequest: null,
  });
  const name = approvalQueueName(db.databaseName);
  const queue = new Queue<{ id: string }>(name, { connection });
  const events = new QueueEvents(name, { connection });
  const run = createApprovalProcessor(
    mongo,
    async (_run, decision) => decision,
  );
  const worker = new Worker<{ id: string }>(name, (job) => run(job.data.id), {
    connection,
  });

  beforeAll(async () => {
    await db
      .collection('idempotencyKeys')
      .createIndex({ key: 1 }, { unique: true });
    await events.waitUntilReady();
  });
  afterAll(async () => {
    await worker.close();
    await events.close();
    await queue.obliterate({ force: true });
    await queue.close();
    connection.disconnect();
    try {
      await db.dropDatabase();
    } finally {
      await mongo.close();
    }
  });

  async function insert(
    status: Approval['status'],
    undoUntil: Date,
    body = 'Mock payload',
  ) {
    const id = randomUUID();
    await approval.insertOne({
      _id: id,
      runId: randomUUID(),
      ownerId: 'owner',
      version: 1,
      status,
      createdAt: new Date(),
      undoUntil,
      action: {
        tool: 'send',
        content: {
          to: 'ari@example.test',
          subject: 'Review',
          body,
        },
      },
      preview: {
        decision: { outcome: 'require_approval', reasons: ['Human review'] },
        recipients: [],
        risk: 'moderate',
        reversibility: 'Undo',
        riskReason: 'Recipient may receive incorrect details',
      },
    });
    return id;
  }

  it('waits for the delayed job, commits once on replay, and skips undone work', async () => {
    const undoUntil = new Date();
    const id = await insert('approved', undoUntil);
    const runBeforeDeadline = createApprovalProcessor(
      mongo,
      async (_run, decision) => decision,
      () => new Date(undoUntil.getTime() - 1),
    );
    await expect(runBeforeDeadline(id)).rejects.toThrow(
      'Undo window is still open',
    );
    expect(await db.collection('mockOutbox').countDocuments()).toBe(0);
    const delay = 550;
    const job = await queue.add('resolve', { id }, { jobId: id, delay });
    await job.waitUntilFinished(events, 5000);
    const completedJob = await queue.getJob(id);
    expect(completedJob?.processedOn).toBeGreaterThanOrEqual(
      job.timestamp + delay,
    );
    await run(id);
    expect(await db.collection('mockOutbox').countDocuments()).toBe(1);
    expect(
      await db.collection('idempotencyKeys').countDocuments({ key: id }),
    ).toBe(1);
    const undone = await insert('undone', new Date(Date.now() + 1000));
    await run(undone);
    expect(await db.collection('mockOutbox').countDocuments()).toBe(1);
  }, 10000);

  it('rechecks egress on a stored approval before writing to the outbox', async () => {
    const id = await insert('approved', new Date(0), '[restricted] QA marker');
    await run(id);
    expect((await approval.findOne({ _id: id }))?.status).toBe('failed');
    expect(
      await db
        .collection('mockOutbox')
        .findOne({ 'content.body': '[restricted] QA marker' }),
    ).toBeNull();
    expect(
      await db
        .collection('guardActivity')
        .findOne({ layer: 'egress', outcome: 'blocked' }),
    ).toBeTruthy();
  });
});
