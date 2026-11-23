import { randomUUID } from 'node:crypto';
import {
  runEventSchema,
  runSchema,
  type Run,
  type RunEvent,
  type Principal,
  type AgentEvent,
} from '@aide/shared/domain';
import type { Db } from 'mongodb';

export class TaskRepository {
  constructor(private readonly db: Db) {}

  async create(principal: Principal) {
    const now = new Date();
    const run = runSchema.parse({
      _id: randomUUID(),
      principal,
      status: 'running',
      createdAt: now,
      updatedAt: now,
    });
    await this.db.collection<Run>('runs').insertOne(run);
    return run;
  }

  async find(id: string, principal: Principal) {
    const result = await this.db.collection<Run>('runs').findOne({
      _id: id,
      'principal.id': principal.id,
      'principal.kind': principal.kind,
    });
    return result ? runSchema.parse(result) : null;
  }

  async append(id: string, sequence: number, event: AgentEvent) {
    const row = runEventSchema.parse({
      _id: id + ':' + sequence,
      runId: id,
      sequence,
      event,
      createdAt: new Date(),
    });
    await this.db.collection<RunEvent>('runEvents').insertOne(row);
  }

  async after(id: string, sequence: number) {
    const events = await this.db
      .collection<RunEvent>('runEvents')
      .find({ runId: id, sequence: { $gt: sequence } })
      .sort({ sequence: 1 })
      .limit(100)
      .toArray();
    return events.map((event) => runEventSchema.parse(event));
  }

  async finish(id: string, status: 'completed' | 'failed' | 'cancelled') {
    await this.db
      .collection<Run>('runs')
      .updateOne({ _id: id }, { $set: { status, updatedAt: new Date() } });
  }
}
