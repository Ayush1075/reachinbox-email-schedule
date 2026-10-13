import type { Response } from 'express';
import type { ZodType, ZodTypeDef } from 'zod';
import type { ApiSuccess } from '../types/api';
import { AppError } from './errors';

export function ok<T>(res: Response, data: T, status = 200) {
  const body: ApiSuccess<T> = { success: true, data };
  return res.status(status).json(body);
}

/** Parse untrusted input with a Zod schema; throws a 400 AppError on failure. */
export function parse<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    const first = details[0];
    throw AppError.badRequest(first ? `${first.path ? `${first.path}: ` : ''}${first.message}` : 'Invalid request', details);
  }
  return result.data;
}
