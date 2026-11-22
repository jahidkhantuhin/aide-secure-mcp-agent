import { createCalendarHandler } from '@aide/mcp-calendar';
import { createMailHandler } from '@aide/mcp-mail';
import { MockProvider, seedWorld } from '@aide/mock-world';
import {
  localhostHostValidation,
  localhostOriginValidation,
  toNodeHandler,
} from '@modelcontextprotocol/node';
import { Router } from 'express';

export function createMcpRoutes() {
  const router = Router();
  const provider = new MockProvider(seedWorld('local-mcp'));
  const handlers = {
    '/mcp/calendar': createCalendarHandler(provider),
    '/mcp/mail': createMailHandler(provider),
  };
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();

  for (const [path, handler] of Object.entries(handlers)) {
    const serve = toNodeHandler(handler, { maxRequestBodySize: 32 * 1024 });
    router.all(path, (req, res) => {
      if (!validateHost(req, res) || !validateOrigin(req, res)) return;
      return serve(req, res);
    });
  }

  return {
    router,
    async close() {
      await Promise.all(
        Object.values(handlers).map((handler) => handler.close()),
      );
    },
  };
}
