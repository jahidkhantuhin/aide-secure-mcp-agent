import { MongoClient } from 'mongodb';
import { createClient } from 'redis';
import { createApp } from './app.js';
import { configSchema } from './config.js';

const config = configSchema.parse(process.env);
const mongo = new MongoClient(config.MONGODB_URI, {
  serverSelectionTimeoutMS: 2_000,
  socketTimeoutMS: 2_500,
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

const server = createApp(
  {
    mongo: () => mongo.db('admin').command({ ping: 1 }),
    redis: () =>
      redis
        .withCommandOptions({ abortSignal: AbortSignal.timeout(2_500) })
        .ping(),
  },
  new URL(config.WEB_ORIGIN).origin,
).listen(config.API_PORT, '127.0.0.1', () => {
  console.info('Aide API listening on port %d', config.API_PORT);
});

function shutdown() {
  const deadline = setTimeout(() => {
    server.closeAllConnections();
    process.exit(1);
  }, 8_000);
  deadline.unref();
  server.close(async () => {
    try {
      if (redis.isOpen) redis.destroy();
      await mongo.close();
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
