import { betterAuth } from 'better-auth/minimal';
import { mongodbAdapter } from '@better-auth/mongo-adapter';
import type { MongoClient } from 'mongodb';

export function createOwnerAuth(
  client: MongoClient,
  origin: string,
  secret: string,
  registering = false,
) {
  return betterAuth({
    appName: 'Aide',
    baseURL: origin,
    basePath: '/api/auth',
    secret,
    database: mongodbAdapter(client.db(), { client }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !registering,
      minPasswordLength: 12,
    },
    user: {
      modelName: 'users',
      additionalFields: {
        ownerSlot: {
          type: 'number',
          input: false,
          defaultValue: 1,
          returned: false,
        },
      },
    },
    session: { modelName: 'sessions' },
    account: { modelName: 'accounts' },
    verification: { modelName: 'verifications' },
    advanced: {
      cookiePrefix: 'aide_owner',
      ipAddress: { disableIpTracking: true },
    },
    rateLimit: { enabled: true },
    telemetry: { enabled: false },
  });
}
