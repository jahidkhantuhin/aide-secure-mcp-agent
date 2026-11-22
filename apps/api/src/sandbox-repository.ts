import { randomUUID } from 'node:crypto';
import { seedWorld } from '@aide/mock-world';
import { sandboxSessionSchema, type SandboxSession } from '@aide/shared/domain';
import type { Db } from 'mongodb';

export class SandboxRepository {
  constructor(private readonly db: Db) {}

  async create(now: Date, ttlSeconds: number, budget: number) {
    const record = sandboxSessionSchema.parse({
      _id: randomUUID(),
      createdAt: now,
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
      world: seedWorld(randomUUID()),
      tokensRemaining: budget,
      window: Math.floor(now.getTime() / 60_000),
      requests: 0,
    });
    await this.db
      .collection<SandboxSession>('sandboxSessions')
      .insertOne(record);
    return record;
  }

  private collection() {
    return this.db.collection<SandboxSession>('sandboxSessions');
  }

  async read(id: string, now: Date) {
    const doc = await this.collection().findOne({
      _id: id,
      expiresAt: { $gt: now },
    });
    return doc ? sandboxSessionSchema.parse(doc) : null;
  }

  async consume(id: string, now: Date, requestLimit: number, tokenCost = 0) {
    if (!Number.isSafeInteger(tokenCost) || tokenCost < 0)
      throw new RangeError('Invalid token cost');
    const window = Math.floor(now.getTime() / 60_000);
    const document = await this.collection().findOneAndUpdate(
      {
        _id: id,
        expiresAt: { $gt: now },
        tokensRemaining: { $gte: tokenCost },
        $or: [
          { window: { $lt: window } },
          { window, requests: { $lt: requestLimit } },
        ],
      },
      [
        {
          $set: {
            window,
            requests: {
              $cond: [
                { $eq: ['$window', window] },
                { $add: ['$requests', 1] },
                1,
              ],
            },
            tokensRemaining: { $subtract: ['$tokensRemaining', tokenCost] },
          },
        },
      ],
      { returnDocument: 'after' },
    );
    return document ? sandboxSessionSchema.parse(document) : null;
  }
}
