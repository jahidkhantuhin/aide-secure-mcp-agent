import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import type { MailProvider } from '@aide/mock-world';
import {
  mailContentSchema,
  mailDraftSchema,
  mailMessageSchema,
  mailSummarySchema,
  mockId,
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

export function createMailServer(provider: MailProvider) {
  const server = new McpServer({ name: 'aide-mail', version: '0.1.0' });
  server.registerTool(
    'search',
    {
      description: 'Find matching mock mail and return message summaries.',
      inputSchema: z.strictObject({ query: z.string().trim().min(1).max(200) }),
      outputSchema: z.strictObject({ messages: z.array(mailSummarySchema) }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query }) => result({ messages: await provider.search(query) }),
  );
  server.registerTool(
    'read',
    {
      description: 'Read one mock message by its ID.',
      inputSchema: z.strictObject({ id: mockId }),
      outputSchema: mailMessageSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ id }) => result(await provider.read(id)),
  );
  server.registerTool(
    'create_draft',
    {
      description: 'Prepare a mock mail draft without sending it.',
      inputSchema: mailContentSchema,
      outputSchema: mailDraftSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (content) => result(await provider.createDraft(content)),
  );
  server.registerTool(
    'send',
    {
      description: 'Record a draft in the in-memory mock outbox.',
      inputSchema: mailDraftSchema,
      outputSchema: mailDraftSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (draft) => result(await provider.send(draft)),
  );
  return server;
}

export function createMailHandler(provider: MailProvider) {
  return createMcpHandler(() => createMailServer(provider), {
    responseMode: 'json',
  });
}
