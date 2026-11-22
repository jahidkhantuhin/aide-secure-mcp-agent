import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { MockProvider, seedWorld } from '@aide/mock-world';
import { mailDraftSchema } from '@aide/shared/mock-world';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMailHandler } from '../src/index.js';

const require = createRequire(import.meta.url);
const agent = { name: 'aide-contract-test', version: '0.1.0' };
const content = {
  to: 'ari@example.test',
  subject: 'Agenda update',
  body: 'I will bring the mockups.',
};

describe('MCP mail contract', () => {
  let client: Client;
  let provider: MockProvider;
  let handler: ReturnType<typeof createMailHandler>;
  let exchanges: Array<{
    revision: string | null;
    requestSession: string | null;
    responseSession: string | null;
  }>;

  beforeEach(async () => {
    provider = new MockProvider(seedWorld('contract-world'));
    handler = createMailHandler(provider);
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
      ['search', true],
      ['read', true],
      ['create_draft', true],
      ['send', false],
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

  it('search returns summaries without changing the world', async () => {
    const before = provider.snapshot();
    const result = await client.callTool({
      name: 'search',
      arguments: { query: 'mockups' },
    });
    expect(result.structuredContent).toEqual({
      messages: [
        {
          id: 'design-agenda',
          from: 'ari@example.test',
          subject: 'Design review agenda',
          receivedAt: '2026-11-23T09:00:00Z',
        },
      ],
    });
    expect(provider.snapshot()).toEqual(before);
  });

  it('read returns the message body without changing the world', async () => {
    const before = provider.snapshot();
    const result = await client.callTool({
      name: 'read',
      arguments: { id: 'design-agenda' },
    });
    expect(result.structuredContent).toEqual(before.world.mailbox[0]);
    expect(provider.snapshot()).toEqual(before);
    const missing = await client.callTool({
      name: 'read',
      arguments: { id: 'unknown' },
    });
    expect(missing.isError).toBe(true);
  });

  it('create_draft produces a reusable preview without sending', async () => {
    const before = provider.snapshot();
    const result = await client.callTool({
      name: 'create_draft',
      arguments: content,
    });
    expect(result.structuredContent).toMatchObject({
      id: expect.any(String),
      content,
    });
    expect(provider.snapshot()).toEqual(before);
    const invalid = await client.callTool({
      name: 'create_draft',
      arguments: { ...content, to: 'not-an-email' },
    });
    expect(invalid.isError).toBe(true);
  });

  it('send records a draft only in the mock outbox and deduplicates retries', async () => {
    const { structuredContent } = await client.callTool({
      name: 'create_draft',
      arguments: content,
    });
    const draft = mailDraftSchema.parse(structuredContent);
    const outbox = (await client.callTool({ name: 'send', arguments: draft }))
      .structuredContent;
    expect(outbox).toEqual(draft);
    await client.callTool({ name: 'send', arguments: draft });
    expect(provider.snapshot().sent).toEqual([draft]);
    const changed = await client.callTool({
      name: 'send',
      arguments: { ...draft, content: { ...content, body: 'Different body' } },
    });
    expect(changed.isError).toBe(true);
    expect(provider.snapshot().sent).toEqual([draft]);
  });
});

it('starts the mail stdio entry point with clean protocol output', async () => {
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
