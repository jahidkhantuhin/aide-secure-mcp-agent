import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express, { type ErrorRequestHandler, type Router } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { z } from 'zod';
import { checkHealth, type Probes } from './health.js';
import { validate } from './validate.js';

const handleError: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status === 400 ? 400 : error.status === 404 ? 404 : 500;
  if (status === 500) req.log.error({ err: error }, 'Unhandled API error');
  const message = {
    400: 'Invalid request',
    404: 'Not found',
    500: 'Internal server error',
  }[status];
  res.status(status).json({ error: { message, requestId: req.id } });
};

export function createApp(
  probes: Probes,
  webOrigin: string,
  sessionRoutes?: Router,
) {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    pinoHttp({
      redact: [
        'req.headers.cookie',
        'req.headers.authorization',
        'res.headers["set-cookie"]',
      ],
      genReqId: (_req, res) => {
        const id = randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
    }),
  );
  app.use(helmet());
  app.use(cors({ origin: webOrigin }));
  if (sessionRoutes) app.use(sessionRoutes);
  app.use(express.json({ limit: '32kb' }));
  app.get(
    '/health',
    validate(z.strictObject({}), 'query'),
    async (_req, res) => {
      const health = await checkHealth(probes);
      res
        .set('Cache-Control', 'no-store')
        .status(health.status === 'ok' ? 200 : 503)
        .json(health);
    },
  );
  app.use((_req, _res, next) =>
    next(Object.assign(new Error('Not found'), { status: 404 })),
  );
  app.use(handleError);
  return app;
}
