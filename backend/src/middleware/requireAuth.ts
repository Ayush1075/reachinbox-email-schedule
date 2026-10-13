import type { Request, RequestHandler } from 'express';
import { AppError } from '../lib/errors';
import { SESSION_COOKIE, verifySessionToken } from '../services/auth';

/** Accepts the httpOnly session cookie (browser) or a Bearer token (scripts). */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  const cookie: unknown = req.cookies?.[SESSION_COOKIE];
  const token = bearer ?? (typeof cookie === 'string' ? cookie : undefined);

  const userId = token ? verifySessionToken(token) : null;
  if (!userId) return next(AppError.unauthorized());

  req.userId = userId;
  req.log = req.log.child({ userId });
  next();
};

export function currentUserId(req: Request): string {
  if (!req.userId) throw AppError.unauthorized();
  return req.userId;
}
