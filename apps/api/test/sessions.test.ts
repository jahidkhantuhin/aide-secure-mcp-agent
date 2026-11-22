import { randomBytes, randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createOwnerAuth } from '../src/auth.js';
import { configSchema } from '../src/config.js';
import { ensureIndexes } from '../src/database.js';
import { SandboxRepository } from '../src/sandbox-repository.js';
import { createSessionRoutes } from '../src/session-routes.js';

const uri = process.env.TEST_MONGODB_URI;
const origin = 'http://localhost:3000';
const secret = randomBytes(32).toString('base64url');
const owner = {
  email: 'owner@example.test',
  name: 'Demo Owner',
  password: 'integration-test-password',
};
const ping = async () => 'PONG';

describe.skipIf(!uri)('MongoDB sessions', () => {
  const url = new URL(uri ?? 'mongodb://localhost:27027');
  url.pathname = '/aide_test_' + randomUUID().replaceAll('-', '');
  const config = configSchema.parse({
    MONGODB_URI: url.toString(),
    WEB_ORIGIN: origin,
    AIDE_SESSION_SECRET: secret,
    SANDBOX_REQUESTS_PER_MINUTE: 8,
    SANDBOX_TOKEN_BUDGET: 10,
  });
  const client = new MongoClient(config.MONGODB_URI, {
    serverSelectionTimeoutMS: 3000,
  });
  const db = client.db();
  const app = request(
    createApp(
      { mongo: ping, redis: ping },
      origin,
      createSessionRoutes(client, config, secret),
    ),
  );
  const createSandbox = () => app.post('/api/sandbox').set('Origin', origin);

  beforeAll(async () => {
    await ensureIndexes(db);
  });
  afterAll(async () => {
    try {
      await db.dropDatabase();
    } finally {
      await client.close();
    }
  });

  it('registers the owner locally, signs in, checks identity and revokes the cookie', async () => {
    await app.get('/api/auth/me').expect(401);
    await app
      .post('/api/auth/sign-up/email')
      .set('Origin', origin)
      .send(owner)
      .expect(404);
    const registration = createOwnerAuth(client, origin, secret, true);
    await registration.api.signUpEmail({ body: owner });
    await expect(
      registration.api.signUpEmail({
        body: { ...owner, email: 'other@example.test' },
      }),
    ).rejects.toThrow();
    expect(await db.collection('users').countDocuments()).toBe(1);

    const result = await app
      .post('/api/auth/sign-in/email')
      .set('Origin', origin)
      .send({ email: owner.email, password: owner.password })
      .expect(200);
    const cookie = result.get('Set-Cookie')?.[0].split(';')[0] ?? '';
    expect(cookie).toContain('aide_owner');
    const me = await app.get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body).toMatchObject({ name: owner.name, email: owner.email });
    await app
      .post('/api/auth/sign-out')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .expect(200);
    await app.get('/api/auth/me').set('Cookie', cookie).expect(401);
  });

  it('isolates visitors, ignores supplied world IDs and rejects a forged cookie', async () => {
    await app
      .post('/api/sandbox')
      .set('Origin', 'http://foreign.example')
      .expect(403);
    const first = await createSandbox().expect(201);
    const second = await createSandbox().expect(201);
    const firstCookie = first.get('Set-Cookie')?.[0].split(';')[0] ?? '';
    const secondCookie = second.get('Set-Cookie')?.[0].split(';')[0] ?? '';
    expect(first.get('Set-Cookie')?.[0]).toContain('HttpOnly');
    expect(first.body.world.id).not.toEqual(second.body.world.id);
    const own = await app
      .get('/api/sandbox')
      .set('Cookie', secondCookie)
      .query({ worldId: first.body.world.id })
      .expect(200);
    expect(own.body.world.id).toEqual(second.body.world.id);
    const forged =
      firstCookie.slice(0, -2) + (firstCookie.endsWith('AA') ? 'BB' : 'AA');
    await app.get('/api/sandbox').set('Cookie', forged).expect(401);
    await app.get('/api/auth/me').set('Cookie', firstCookie).expect(401);
  });

  it('enforces the request and token limits atomically', async () => {
    const repository = new SandboxRepository(db);
    const now = new Date();
    const budget = await repository.create(now, 60, 10);
    const charges = await Promise.all(
      Array.from({ length: 4 }, () =>
        repository.consume(budget._id, now, 8, 5),
      ),
    );
    expect(charges.filter(Boolean)).toHaveLength(2);
    expect((await repository.read(budget._id, now))?.tokensRemaining).toBe(0);

    const first = await createSandbox().expect(201);
    const cookie = first.get('Set-Cookie')?.[0].split(';')[0] ?? '';
    const reads = await Promise.all(
      Array.from({ length: 10 }, () =>
        app.get('/api/sandbox').set('Cookie', cookie),
      ),
    );
    expect(reads.filter((response) => response.status === 200)).toHaveLength(8);
    expect(reads.filter((response) => response.status === 429)).toHaveLength(2);
  });

  it('rejects expired sessions before MongoDB physically deletes them', async () => {
    const first = await createSandbox().expect(201);
    const cookie = first.get('Set-Cookie')?.[0].split(';')[0] ?? '';
    const id = cookie.split('=')[1].split('.')[0];
    const sessions = db.collection<{ _id: string }>('sandboxSessions');
    await sessions.updateOne({ _id: id }, { $set: { expiresAt: new Date(0) } });
    await app.get('/api/sandbox').set('Cookie', cookie).expect(401);
    const indexes = await sessions.indexes();
    expect(indexes).toContainEqual(
      expect.objectContaining({ key: { expiresAt: 1 }, expireAfterSeconds: 0 }),
    );
    await expect
      .poll(() => sessions.findOne({ _id: id }), {
        timeout: 75_000,
        interval: 1_000,
      })
      .toBeNull();
  }, 80_000);
});
