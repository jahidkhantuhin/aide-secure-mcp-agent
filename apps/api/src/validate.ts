import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

export function validate(
  schema: ZodType,
  source: 'body' | 'query' = 'body',
): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(
        Object.assign(new Error('Invalid request input'), { status: 400 }),
      );
    }
    res.locals.input = result.data;
    next();
  };
}
