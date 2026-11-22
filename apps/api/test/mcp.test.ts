import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import request from 'supertest';
import { expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createMcpRoutes } from '../src/mcp-routes.js';

const ping = async () => 'PONG';

it('serves both mock servers over the local Node HTTP mount', async () => {
  const mcp = createMcpRoutes();
  const server = createApp(
    { mongo: ping, redis: ping },
    'http://localhost:3000',
    mcp.router,
  ).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    for (const [path, tool] of [
      ['calendar', 'list_events'],
      ['mail', 'search'],
    ]) {
      const client = new Client(
        { name: 'aide-http-test', version: '0.1.0' },
        { versionNegotiation: { mode: 'auto' } },
      );
      try {
        await client.connect(
          new StreamableHTTPClientTransport(
            new URL(`http://127.0.0.1:${port}/mcp/${path}`),
          ),
        );
        const { tools } = await client.listTools();
        expect(tools.map(({ name }) => name)).toContain(tool);
      } finally {
        await client.close();
      }
    }
    await request(server)
      .post('/mcp/mail')
      .set('Origin', 'https://other.example')
      .expect(403);
  } finally {
    await mcp.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
