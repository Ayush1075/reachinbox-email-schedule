import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { AppError } from '../lib/errors';

export const SESSION_COOKIE = 'reachinbox_session';

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

type SessionClaims = { sub: string };

/**
 * Verifies a Google Identity Services ID token (signature, audience, expiry)
 * and returns the matching user, creating or linking it as needed.
 */
export async function signInWithGoogle(credential: string) {
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    throw AppError.unauthorized('Invalid Google credential');
  }
  if (!payload?.sub || !payload.email) throw AppError.unauthorized('Google credential is missing required claims');
  if (payload.email_verified === false) throw AppError.unauthorized('Google account email is not verified');

  const email = payload.email.toLowerCase();
  const profile = {
    email,
    name: payload.name ?? email.split('@')[0] ?? email,
    avatarUrl: payload.picture ?? null,
  };

  const byGoogleId = await prisma.user.findUnique({ where: { googleId: payload.sub } });
  if (byGoogleId) return prisma.user.update({ where: { id: byGoogleId.id }, data: profile });

  // Link a user pre-created by the seed script (matched by verified email).
  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) return prisma.user.update({ where: { id: byEmail.id }, data: { ...profile, googleId: payload.sub } });

  return prisma.user.create({ data: { ...profile, googleId: payload.sub } });
}

export function issueSessionToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies SessionClaims, env.JWT_SECRET, {
    expiresIn: `${env.SESSION_TTL_HOURS}h`,
    algorithm: 'HS256',
  });
}

export function verifySessionToken(token: string): string | null {
  try {
    const claims = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    return typeof claims === 'object' && typeof claims.sub === 'string' ? claims.sub : null;
  } catch {
    return null;
  }
}
