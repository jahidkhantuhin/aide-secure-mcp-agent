import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const origin = 'http://localhost:3000';
const ping = async () => 'PONG';

describe('GET /health', () => {
  it('returns dependency status and a request ID', async () => {
    const response = await request(
      createApp({ mongo: ping, redis: ping }, origin),
    )
      .get('/health')
      .set('Origin', origin)
      .expect(200);
    expect(response.body).toEqual({
      status: 'ok',
      dependencies: { mongo: 'up', redis: 'up' },
    });
    expect(response.headers['x-request-id']).toBeTruthy();
    expect(response.headers['access-control-allow-origin']).toBe(origin);
  });

  it('returns 503 when a dependency is down', async () => {
    const redis = async () => {
      throw new Error('Redis unavailable');
    };
    const response = await request(createApp({ mongo: ping, redis }, origin))
      .get('/health')
      .expect(503);
    expect(response.body).toEqual({
      status: 'unavailable',
      dependencies: { mongo: 'up', redis: 'down' },
    });
  });

  it('correlates validation errors with the request ID', async () => {
    const response = await request(
      createApp({ mongo: ping, redis: ping }, origin),
    )
      .get('/health?extra=1')
      .expect(400);
    expect(response.body.error.requestId).toBe(
      response.headers['x-request-id'],
    );
  });
});
