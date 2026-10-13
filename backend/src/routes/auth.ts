import { Router, type CookieOptions } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { AppError } from '../lib/errors';
import { ok, parse } from '../lib/http';
import { currentUserId, requireAuth } from '../middleware/requireAuth';
import { issueSessionToken, SESSION_COOKIE, signInWithGoogle } from '../services/auth';

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

authRouter.post('/google', async (req, res) => {
  const { credential } = parse(z.object({ credential: z.string().min(20) }), req.body);
  const user = await signInWithGoogle(credential);
  res.cookie(SESSION_COOKIE, issueSessionToken(user.id), {
    ...cookieOptions,
    maxAge: env.SESSION_TTL_HOURS * 3600 * 1000,
  });
  req.log.info({ userId: user.id }, 'User signed in with Google');
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
