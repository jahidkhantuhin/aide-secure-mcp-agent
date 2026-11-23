import { setTimeout as delay } from 'node:timers/promises';
import { createApprovalGraph } from '@aide/agent/approval';
import { approvalQueueName, type Approval } from '@aide/shared/approval';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { MongoClient } from 'mongodb';
import { MongoClient as CheckpointClient } from 'mongodb-checkpoint';
import { z } from 'zod';
import { createApprovalProcessor } from './execute.js';

const config = z
  .object({
    MONGODB_URI: z
      .string()
      .default('mongodb://localhost:27027/aide?replicaSet=rs0'),
    REDIS_URL: z
      .url({ protocol: /^rediss?$/ })
      .default('redis://localhost:6389'),
  })
  .parse(process.env);
const mongo = new MongoClient(config.MONGODB_URI, {
  serverSelectionTimeoutMS: 2000,
});
const checkpoints = new CheckpointClient(config.MONGODB_URI, {
  serverSelectionTimeoutMS: 2000,
});
const saver = new MongoDBSaver({
  client: checkpoints,
  dbName: mongo.db().databaseName,
  ttl: 86400,
});
const graph = createApprovalGraph(saver);
const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const name = approvalQueueName(mongo.db().databaseName);
const queue = new Queue<{ id: string }>(name, {
  connection,
});
const execute = createApprovalProcessor(mongo, graph.resume);
const worker = new Worker<{ id: string }>(name, (job) => execute(job.data.id), {
  connection,
});
worker.on('error', (error) => console.error('Approval worker:', error.message));
worker.on('failed', (job, error) =>
  console.error('Approval job failed:', job?.id, error.message),
);
queue.on('error', (error) => console.error('Approval queue:', error.message));
const stopping = new AbortController();
process.once('SIGINT', () => stopping.abort());
process.once('SIGTERM', () => stopping.abort());

async function schedule() {
  const rows = await mongo
    .db()
    .collection<Approval>('approvals')
    .find({
      status: { $in: ['approved', 'rejected', 'undone'] },
      processedAt: { $exists: false },
      ownerId: { $exists: true },
    })
    .sort({ createdAt: 1 })
    .limit(100)
    .toArray();
  for (const row of rows) {
    const remaining =
      row.status === 'approved'
        ? (row.undoUntil?.getTime() ?? 0) - Date.now()
        : 0;
    const job = await queue.getJob(row._id);
    if (job && (await job.isFailed())) await job.retry();
    else if (!job)
      await queue.add(
        'resolve',
        { id: row._id },
        {
          jobId: row._id,
          delay: Math.max(0, remaining),
          attempts: 5,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { age: 86400, count: 1000 },
        },
      );
  }
}

console.info('Aide approval worker started');
try {
  while (!stopping.signal.aborted) {
    try {
      await schedule();
    } catch (error) {
      console.error(
        'Approval scheduling:',
        error instanceof Error ? error.name : 'Unknown error',
      );
    }
    await delay(500, undefined, { signal: stopping.signal }).catch(() => {});
  }
} finally {
  await worker.close();
  await queue.close();
  connection.disconnect();
  await Promise.all([mongo.close(), checkpoints.close()]);
}
