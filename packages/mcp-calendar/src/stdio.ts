import { MockProvider, seedWorld } from '@aide/mock-world';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createCalendarServer } from './index.js';

const server = createCalendarServer(
  new MockProvider(seedWorld('stdio-calendar')),
);
await server.connect(new StdioServerTransport());
