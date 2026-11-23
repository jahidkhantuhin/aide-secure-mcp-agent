import { z } from 'zod';

export const configSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.url({ protocol: /^https?$/ }).default('http://localhost:3000'),
  MONGODB_URI: z
    .url({ protocol: /^mongodb(?:\+srv)?$/ })
    .default('mongodb://localhost:27027/aide?replicaSet=rs0'),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }).default('redis://localhost:6389'),
  AIDE_SESSION_SECRET: z.string().min(32).optional(),
  AIDE_LLM_PROVIDER: z.enum(['mock', 'gemini', 'ollama']).optional(),
  AIDE_MODEL: z.string().min(1).optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
  OLLAMA_BASE_URL: z
    .url({ protocol: /^https?$/ })
    .default('http://127.0.0.1:11434/v1'),
  SANDBOX_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(604800)
    .default(60 * 60),
  SANDBOX_REQUESTS_PER_MINUTE: z.coerce
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(30),
  SANDBOX_TOKEN_BUDGET: z.coerce
    .number()
    .int()
    .min(0)
    .max(1000000)
    .default(10000),
});
