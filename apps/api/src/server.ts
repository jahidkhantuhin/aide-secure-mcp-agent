import { randomBytes } from 'node:crypto';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { MongoClient } from 'mongodb';
import { MongoClient as CheckpointClient } from 'mongodb-checkpoint';
import { createClient } from 'redis';
import { createSessionRoutes } from './session-routes.js';
import { createApp } from './app.js';
import { configSchema } from './config.js';
import { createMcpRoutes } from './mcp-routes.js';
import { createPublicSandboxLimits } from './public-sandbox.js';

const config = configSchema.parse(process.env);
const mongo = new MongoClient(config.MONGODB_URI, {
  serverSelectionTimeoutMS: 2_000,
  socketTimeoutMS: 2_500,
});
const checkpointClient = new CheckpointClient(config.MONGODB_URI, {
  serverSelectionTimeoutMS: 2000,
});
const checkpointer = new MongoDBSaver({
  client: checkpointClient,
  dbName: mongo.db().databaseName,
  ttl: 86400,
});
const redis = createClient({
  url: config.REDIS_URL,
  disableOfflineQueue: true,
  socket: { connectTimeout: 2_000 },
});
redis.on('error', (error: Error) =>
  console.error('Redis connection error:', error.message),
);
void redis
  .connect()
  .catch((error: Error) =>
    console.error('Redis startup error:', error.message),
  );

const mcp = config.SANDBOX_PUBLIC ? null : createMcpRoutes();
const publicLimits = config.SANDBOX_PUBLIC
  ? createPublicSandboxLimits(
      redis,
      config.SANDBOX_GLOBAL_REQUESTS_PER_MINUTE,
      config.SANDBOX_REQUESTS_PER_MINUTE,
      config.SANDBOX_GLOBAL_TOKEN_BUDGET_PER_HOUR,
    )
  : undefined;
const server = createApp(
  {
    mongo: () => mongo.db('admin').command({ ping: 1 }),
    redis: () =>
      redis
        .withCommandOptions({ abortSignal: AbortSignal.timeout(2_500) })
        .ping(),
  },
  new URL(config.WEB_ORIGIN).origin,
  createSessionRoutes(
    mongo,
    config,
    config.AIDE_SESSION_SECRET ?? randomBytes(32).toString('base64url'),
    checkpointer,
    publicLimits,
  ),
  ...(mcp ? [mcp.router] : []),
).listen(config.API_PORT, '127.0.0.1', () => {
  console.info('Aide API listening on port %d', config.API_PORT);
});

function shutdown() {
  const deadline = setTimeout(() => {
    server.closeAllConnections();
    process.exit(1);
  }, 8_000);
  deadline.unref();
  const closeMcp = mcp?.close();
  server.close(async () => {
    try {
      if (redis.isOpen) redis.destroy();
      await Promise.all([closeMcp, mongo.close(), checkpointClient.close()]);
    } catch (error) {
      console.error('Connection cleanup failed:', error);
      process.exitCode = 1;
    } finally {
      clearTimeout(deadline);
    }
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
