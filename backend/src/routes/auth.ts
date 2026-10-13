import { Router, type CookieOptions, type Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { AppError } from '../lib/errors';
import { ok, parse } from '../lib/http';
import { currentUserId, requireAuth } from '../middleware/requireAuth';
import { redis } from '../queue/connection';
import {
  issueSessionToken,
  SESSION_COOKIE,
  signInWithEmail,
  signInWithGoogle,
  signInWithGoogleAccessToken,
} from '../services/auth';

export const authRouter = Router();

const cookieOptions: CookieOptions = {
  httpOnly: true,
  // Frontend (:3000) and API (:4000) on localhost are the same *site*, so Lax works.
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  path: '/',
};

export function toPublicUser(user: {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  slackConnectedAt: Date | null;
  slackTeamName: string | null;
  slackChannelName: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    slack: {
      connected: Boolean(user.slackConnectedAt),
      teamName: user.slackTeamName,
      channelName: user.slackChannelName,
    },
  };
}

function startSession(res: Response, userId: string) {
  res.cookie(SESSION_COOKIE, issueSessionToken(userId), {
    ...cookieOptions,
    maxAge: env.SESSION_TTL_HOURS * 3600 * 1000,
  });
}

/** Accepts an ID token (Google's own button) or an access token (the custom-styled button). */
authRouter.post('/google', async (req, res) => {
  const input = parse(
    z.union([z.object({ credential: z.string().min(20) }), z.object({ accessToken: z.string().min(20) })]),
    req.body,
  );
  const user = 'credential' in input ? await signInWithGoogle(input.credential) : await signInWithGoogleAccessToken(input.accessToken);
  startSession(res, user.id);
  req.log.info({ userId: user.id }, 'User signed in with Google');
  ok(res, { user: toPublicUser(user) });
});

const EMAIL_ATTEMPTS_PER_WINDOW = 20;
const EMAIL_ATTEMPT_WINDOW_S = 15 * 60;

/** Slows password guessing: at most 20 attempts per client IP per 15 minutes. */
async function limitEmailAttempts(ip: string) {
  const key = `auth:email-attempts:${ip}`;
  const attempts = await redis.incr(key);
  if (attempts === 1) await redis.expire(key, EMAIL_ATTEMPT_WINDOW_S);
  if (attempts > EMAIL_ATTEMPTS_PER_WINDOW) throw AppError.tooManyRequests('Too many sign-in attempts. Try again in a few minutes.');
}

/** Signs in with email + password, creating the account on first use. */
authRouter.post('/email', async (req, res) => {
  const { email, password } = parse(
    z.object({
      email: z.string().trim().toLowerCase().email('Enter a valid email address'),
      password: z.string().min(8, 'Password must be at least 8 characters').max(128),
    }),
    req.body,
  );
  await limitEmailAttempts(req.ip ?? 'unknown');
  const user = await signInWithEmail(email, password);
  startSession(res, user.id);
  req.log.info({ userId: user.id }, 'User signed in with email');
  ok(res, { user: toPublicUser(user) });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: currentUserId(req) } });
  if (!user) throw AppError.unauthorized('Session user no longer exists');
  ok(res, { user: toPublicUser(user) });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, cookieOptions);
  ok(res, { loggedOut: true });
});
