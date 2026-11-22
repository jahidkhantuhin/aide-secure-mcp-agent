import { z } from 'zod';

const dependencyStatus = z.enum(['up', 'down']);

export const healthSchema = z.object({
  status: z.enum(['ok', 'unavailable']),
  dependencies: z.object({ mongo: dependencyStatus, redis: dependencyStatus }),
});

export type Health = z.infer<typeof healthSchema>;
