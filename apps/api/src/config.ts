import { z } from 'zod';

export const configSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.url({ protocol: /^https?$/ }).default('http://localhost:3000'),
  MONGODB_URI: z
    .url({ protocol: /^mongodb(?:\+srv)?$/ })
    .default('mongodb://localhost:27027/aide?replicaSet=rs0'),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }).default('redis://localhost:6389'),
});
