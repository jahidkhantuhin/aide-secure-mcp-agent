import { MongoClient } from 'mongodb';
import { z } from 'zod';
import { configSchema } from './config.js';
import { createOwnerAuth } from './auth.js';
import { ensureIndexes } from './database.js';

const config = configSchema.parse(process.env);
if (!config.AIDE_SESSION_SECRET)
  throw new Error('Set AIDE_SESSION_SECRET before registering an owner.');

const input = z
  .object({
    AIDE_OWNER_EMAIL: z.email().transform((email) => email.toLowerCase()),
    AIDE_OWNER_NAME: z.string().trim().min(1),
    AIDE_OWNER_PASSWORD: z.string().min(12).max(128),
  })
  .safeParse(process.env);
if (!input.success)
  throw new Error(
    'Set a valid AIDE_OWNER_EMAIL, AIDE_OWNER_NAME and AIDE_OWNER_PASSWORD (12–128 characters).',
  );

const client = new MongoClient(config.MONGODB_URI);
try {
  const db = client.db();
  await ensureIndexes(db);
  if (await db.collection('users').findOne({}, { projection: { _id: 1 } })) {
    throw new Error('An owner is already registered.');
  }
  const auth = createOwnerAuth(
    client,
    new URL(config.WEB_ORIGIN).origin,
    config.AIDE_SESSION_SECRET,
    true,
  );
  await auth.api.signUpEmail({
    body: {
      email: input.data.AIDE_OWNER_EMAIL,
      name: input.data.AIDE_OWNER_NAME,
      password: input.data.AIDE_OWNER_PASSWORD,
    },
  });
  console.info('Owner registered.');
} finally {
  await client.close();
}
