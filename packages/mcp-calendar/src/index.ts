import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import type { CalendarProvider } from '@aide/mock-world';
import {
  calendarChangeSchema,
  calendarEventSchema,
  calendarProposalSchema,
  timeRange,
} from '@aide/shared/mock-world';
import { z } from 'zod';

function result(structuredContent: Record<string, unknown>) {
  return {
    structuredContent,
    content: [
      { type: 'text' as const, text: JSON.stringify(structuredContent) },
    ],
  };
}

export function createCalendarServer(provider: CalendarProvider) {
  const server = new McpServer({ name: 'aide-calendar', version: '0.1.0' });
  server.registerTool(
    'list_events',
    {
      description: 'List events overlapping a time range.',
      inputSchema: timeRange,
      outputSchema: z.strictObject({ events: z.array(calendarEventSchema) }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (range) => result({ events: await provider.listEvents(range) }),
  );
  server.registerTool(
    'find_free_time',
    {
      description: 'Find the first open slot in a time range.',
      inputSchema: z.strictObject({
        range: timeRange,
        durationMinutes: z.int().min(1).max(1440),
      }),
      outputSchema: z.strictObject({ slot: timeRange.nullable() }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ range, durationMinutes }) =>
      result({ slot: await provider.findFreeTime(range, durationMinutes) }),
  );
  server.registerTool(
    'propose_change',
    {
      description: 'Preview an event move without changing the calendar.',
      inputSchema: calendarChangeSchema,
      outputSchema: calendarProposalSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (change) => result(await provider.proposeChange(change)),
  );
  server.registerTool(
    'apply_change',
    {
      description: 'Apply a revision-checked move to the mock calendar.',
      inputSchema: calendarChangeSchema,
      outputSchema: calendarEventSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (change) => result(await provider.applyChange(change)),
  );
  return server;
}

export function createCalendarHandler(provider: CalendarProvider) {
  return createMcpHandler(() => createCalendarServer(provider), {
    responseMode: 'json',
  });
}
