import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { MockProvider, seedWorld } from '@aide/mock-world';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCalendarHandler } from '../src/index.js';

const require = createRequire(import.meta.url);
const agent = { name: 'aide-contract-test', version: '0.1.0' };
const range = { start: '2026-11-24T14:45:00Z', end: '2026-11-24T18:00:00Z' };
const change = {
  eventId: 'design-review',
  revision: 0,
  when: { start: '2026-11-24T16:00:00Z', end: '2026-11-24T16:30:00Z' },
};

describe('MCP calendar contract', () => {
  let client: Client;
  let provider: MockProvider;
  let handler: ReturnType<typeof createCalendarHandler>;
  let exchanges: Array<{
    revision: string | null;
    requestSession: string | null;
    responseSession: string | null;
  }>;

  beforeEach(async () => {
    provider = new MockProvider(seedWorld('contract-world'));
    handler = createCalendarHandler(provider);
    exchanges = [];
    client = new Client(agent, { versionNegotiation: { mode: 'auto' } });
    await client.connect(
      new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
        fetch: async (url, init) => {
          const request = new Request(url, init);
          const response = await handler.fetch(request);
          exchanges.push({
            revision: request.headers.get('mcp-protocol-version'),
            requestSession: request.headers.get('mcp-session-id'),
            responseSession: response.headers.get('mcp-session-id'),
          });
          return response;
        },
      }),
    );
  });

  afterEach(async () => {
    await client.close();
    await handler.close();
  });

  it('advertises all schemas and annotations and uses stateless 2026-07-28 requests', async () => {
    const { tools } = await client.listTools();
    expect(
      tools.map(({ name, annotations }) => [name, annotations?.readOnlyHint]),
    ).toEqual([
      ['list_events', true],
      ['find_free_time', true],
      ['propose_change', true],
      ['apply_change', false],
    ]);
    expect(
      tools.every(
        (tool) =>
          tool.inputSchema.type === 'object' &&
          tool.outputSchema?.type === 'object',
      ),
    ).toBe(true);
    expect(exchanges.length).toBeGreaterThan(0);
    expect(
      exchanges.every(
        (exchange) =>
          exchange.revision === '2026-07-28' &&
          !exchange.requestSession &&
          !exchange.responseSession,
      ),
    ).toBe(true);
  });

  it('list_events returns matching events without changing the world', async () => {
    const before = provider.snapshot();
    const result = await client.callTool({
      name: 'list_events',
      arguments: range,
    });
    expect(result.structuredContent).toEqual({ events: before.world.calendar });
    expect(provider.snapshot()).toEqual(before);
    const invalid = await client.callTool({
      name: 'list_events',
      arguments: { start: range.end, end: range.start },
    });
    expect(invalid.isError).toBe(true);
  });

  it('find_free_time skips busy time without changing the world', async () => {
    const before = provider.snapshot();
    const result = await client.callTool({
      name: 'find_free_time',
      arguments: { range, durationMinutes: 30 },
    });
    expect(result.structuredContent).toEqual({
      slot: {
        start: '2026-11-24T15:30:00.000Z',
        end: '2026-11-24T16:00:00.000Z',
      },
    });
    expect(provider.snapshot()).toEqual(before);
  });

  it('propose_change previews a move without changing the world', async () => {
    const before = provider.snapshot();
    const result = await client.callTool({
      name: 'propose_change',
      arguments: change,
    });
    expect(result.structuredContent).toMatchObject({
      change,
      before: before.world.calendar[0],
      after: { ...change.when, revision: 1 },
    });
    expect(provider.snapshot()).toEqual(before);
  });

  it('apply_change changes the mock calendar once and rejects a stale revision', async () => {
    const result = await client.callTool({
      name: 'apply_change',
      arguments: change,
    });
    expect(result.structuredContent).toMatchObject({
      id: change.eventId,
      ...change.when,
      revision: 1,
    });
    const retry = await client.callTool({
      name: 'apply_change',
      arguments: change,
    });
    expect(retry.isError).toBe(true);
    expect(provider.snapshot().world.calendar[0]).toEqual(
      result.structuredContent,
    );
  });
});

it('starts the calendar stdio entry point with clean protocol output', async () => {
  const client = new Client(agent);
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [
          require.resolve('tsx/cli'),
          fileURLToPath(new URL('../src/stdio.ts', import.meta.url)),
        ],
      }),
    );
    expect((await client.listTools()).tools).toHaveLength(4);
  } finally {
    await client.close();
  }
}, 15_000);
