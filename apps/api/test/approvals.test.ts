import { randomUUID } from 'node:crypto';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { MongoClient } from 'mongodb';
import { MongoClient as CheckpointClient } from 'mongodb-checkpoint';
import { Router, json } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ensureIndexes } from '../src/database.js';
import { createApprovalsRouter } from '../src/approvals.js';

const origin = 'http://localhost:3000';
const uri = process.env.TEST_MONGODB_URI;
const ping = async () => 'PONG';
const action = {
  tool: 'send',
  content: {
    to: 'guest@partner.test',
    subject: 'Review',
    body: 'Mock mail body',
  },
};

describe.skipIf(!uri)('approval API', () => {
  const url = new URL(uri ?? 'mongodb://localhost:27027');
  url.pathname = '/aide_test_' + randomUUID().replaceAll('-', '');
  const mongo = new MongoClient(url.toString());
  const checkpoints = new CheckpointClient(url.toString());
  const db = mongo.db();
  const saver = new MongoDBSaver({
    client: checkpoints,
    dbName: db.databaseName,
  });
  const router = Router();
  router.use(
    '/approvals',
    json(),
    createApprovalsRouter(
      mongo,
      saver,
      process.env.TEST_REDIS_URL ?? 'redis://localhost:6389',
      60_000,
      origin,
      async (req) => req.get('x-test-owner'),
    ),
  );
  const app = request(createApp({ mongo: ping, redis: ping }, origin, router));
  beforeAll(async () => {
    await ensureIndexes(db);
  });
  afterAll(async () => {
    try {
      await db.dropDatabase();
    } finally {
      await Promise.all([mongo.close(), checkpoints.close()]);
    }
  });

  const get = (owner = 'owner') =>
    app.get('/approvals').set('x-test-owner', owner);
  const post = (path: string, owner = 'owner') =>
    app
      .post('/approvals' + path)
      .set('x-test-owner', owner)
      .set('origin', origin);

  it('previews edits, resolves once, records the approver, and supports undo', async () => {
    await app.get('/approvals').expect(401);
    const result = await post('').send(action).expect(201);
    const { id, runId } = result.body;
    const other = await get('another').expect(200);
    expect(other.body).toEqual([]);
    const preview = (await get().expect(200)).body[0];
    expect(preview.preview.recipients).toEqual([
      { email: 'guest@partner.test', external: true },
    ]);
    expect(preview.status).toBe('pending');
    await post('/' + id + '/edit')
      .send({
        version: 0,
        action: {
          ...action,
          content: { ...action.content, body: 'Edited draft' },
        },
      })
      .expect(204);
    const decisions = await Promise.all([
      post('/' + id + '/resolve').send({ version: 1, decision: 'approved' }),
      post('/' + id + '/resolve').send({ version: 1, decision: 'approved' }),
    ]);
    expect(decisions.map(({ status }) => status).sort()).toEqual([204, 409]);
    expect(
      await db.collection('runEvents').findOne({
        runId,
        'event.type': 'APPROVAL_RESOLVED',
        'event.approverId': 'owner',
      }),
    ).toBeTruthy();
    await post('/' + id + '/undo', 'another')
      .send({})
      .expect(409);
    await post('/' + id + '/undo')
      .send({})
      .expect(204);
    const undone = (await get().expect(200)).body[0];
    expect(undone.status).toBe('undone');
    expect(undone.action.content.body).toBe('Edited draft');
  });

  it('blocks labeled content before an approval or outbox entry exists', async () => {
    await post('')
      .send({
        ...action,
        content: { ...action.content, body: '[restricted] QA marker' },
      })
      .expect(403);
    expect(await db.collection('mockOutbox').countDocuments()).toBe(0);
    expect(
      await db
        .collection('guardActivity')
        .findOne({ layer: 'egress', outcome: 'blocked' }),
    ).toBeTruthy();
    expect(
      await db
        .collection('approvals')
        .countDocuments({ 'action.content.body': '[restricted] QA marker' }),
    ).toBe(0);
  });

  it('rejects undo after the deadline and displays the calendar diff', async () => {
    const result = await post('')
      .send({
        tool: 'apply_change',
        eventId: 'design-review',
        when: { start: '2026-11-24T16:00:00Z', end: '2026-11-24T16:30:00Z' },
      })
      .expect(201);
    const { id } = result.body;
    const calendar = (await get().expect(200)).body[0].preview.calendar;
    expect(calendar.before.start).not.toBe(calendar.after.start);
    await post('/' + id + '/resolve')
      .send({ version: 0, decision: 'approved' })
      .expect(204);
    await db
      .collection<{ _id: string }>('approvals')
      .updateOne({ _id: id }, { $set: { undoUntil: new Date(0) } });
    await post('/' + id + '/undo')
      .send({})
      .expect(409);
  });
});
