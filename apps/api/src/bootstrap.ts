import { MongoClient } from 'mongodb';
import { configSchema } from './config.js';
import { ensureIndexes } from './database.js';

const config = configSchema.parse(process.env);
const client = new MongoClient(config.MONGODB_URI);
try {
  await ensureIndexes(client.db());
  console.info('Aide indexes are ready');
} finally {
  await client.close();
}
