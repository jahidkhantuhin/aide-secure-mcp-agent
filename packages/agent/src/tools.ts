import { createCalendarHandler } from '@aide/mcp-calendar';
import { createMailHandler } from '@aide/mcp-mail';
import { MockProvider } from '@aide/mock-world';
import {
  calendarEventSchema,
  mailSummarySchema,
  type MockWorld,
} from '@aide/shared/mock-world';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { z } from 'zod';
import type { Observation, Plan } from './provider.js';

export async function callMockTool(
  world: MockWorld,
  tool: Observation['tool'],
  query: string,
  signal: AbortSignal,
) {
  const provider = new MockProvider(world);
  const handler =
    tool === 'list_events'
      ? createCalendarHandler(provider)
      : createMailHandler(provider);
  const client = new Client(
    { name: 'aide-agent', version: '0.1.0' },
    { versionNegotiation: { mode: 'auto' } },
  );
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('http://aide.local/mcp'), {
        fetch: (url, init) =>
          handler.fetch(new Request(url, { ...init, signal })),
      }),
    );
    const args: Record<string, unknown> =
      tool === 'list_events'
        ? { start: '2026-11-24T00:00:00Z', end: '2026-11-25T00:00:00Z' }
        : { query: query.trim() || 'design' };
    const result = await client.callTool(
      { name: tool, arguments: args },
      { signal },
    );
    if (result.isError) throw new Error('Mock tool call failed');
    return tool === 'list_events'
      ? z
          .object({ events: z.array(calendarEventSchema) })
          .parse(result.structuredContent).events.length
      : z
          .object({ messages: z.array(mailSummarySchema) })
          .parse(result.structuredContent).messages.length;
  } finally {
    await client.close();
    await handler.close();
  }
}

export type RunTool = (
  tool: Plan['tools'][number],
  query: string,
  signal: AbortSignal,
) => Promise<number>;
