import { MockProvider, seedWorld } from '@aide/mock-world';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createMailServer } from './index.js';

const server = createMailServer(new MockProvider(seedWorld('stdio-mail')));
await server.connect(new StdioServerTransport());
