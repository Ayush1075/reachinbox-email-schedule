import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { AppError } from '../lib/errors';
import { hashPassword, verifyPassword } from './passwords';

export const SESSION_COOKIE = 'reachinbox_session';

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

type SessionClaims = { sub: string };

type GoogleProfile = { sub: string; email: string; name?: string | undefined; picture?: string | undefined };

/** Creates or updates the user for a verified Google identity. */
async function upsertGoogleUser(google: GoogleProfile) {
  const email = google.email.toLowerCase();
  const profile = {
    email,
    name: google.name ?? email.split('@')[0] ?? email,
    avatarUrl: google.picture ?? null,
  };

  const byGoogleId = await prisma.user.findUnique({ where: { googleId: google.sub } });
  if (byGoogleId) return prisma.user.update({ where: { id: byGoogleId.id }, data: profile });

  // Link an account created by the seed script or by email sign-up. Safe
  // because Google has verified ownership of this exact address.
  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) return prisma.user.update({ where: { id: byEmail.id }, data: { ...profile, googleId: google.sub } });

  return prisma.user.create({ data: { ...profile, googleId: google.sub } });
}

/** Verifies a Google Identity Services ID token (signature, audience, expiry). */
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
  return upsertGoogleUser({ sub: payload.sub, email: payload.email, name: payload.name, picture: payload.picture });
}

type TokenInfo = { aud?: string; azp?: string; sub?: string; email?: string; email_verified?: string; expires_in?: string };
type UserInfo = { sub?: string; name?: string; picture?: string };

/**
 * Verifies an OAuth access token from Google's token client (used by the
 * custom-styled sign-in button). The audience check is what makes this safe:
 * a token issued to some other app is rejected, so it can't be replayed here.
 */
export async function signInWithGoogleAccessToken(accessToken: string) {
  const info = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`, {
    signal: AbortSignal.timeout(10_000),
  })
    .then((r) => (r.ok ? (r.json() as Promise<TokenInfo>) : null))
    .catch(() => null);
  if (!info || (info.aud !== env.GOOGLE_CLIENT_ID && info.azp !== env.GOOGLE_CLIENT_ID)) {
    throw AppError.unauthorized('Invalid Google credential');
  }
  if (!info.sub || !info.email) throw AppError.unauthorized('Google credential is missing the email scope');
  if (info.email_verified !== 'true') throw AppError.unauthorized('Google account email is not verified');

  const user = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  })
    .then((r): Promise<UserInfo> | UserInfo => (r.ok ? (r.json() as Promise<UserInfo>) : {}))
    .catch((): UserInfo => ({}));
  return upsertGoogleUser({ sub: info.sub, email: info.email, name: user.name, picture: user.picture });
}

/**
 * Email + password sign-in, which also signs up a new address. An existing
 * account with no password (it signs in with Google) is never given one here:
 * otherwise anyone who knew the address could take that account over.
 */
export async function signInWithEmail(emailInput: string, password: string) {
  const email = emailInput.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });

  if (!existing) {
    return prisma.user.create({
      data: { email, name: email.split('@')[0] ?? email, passwordHash: await hashPassword(password) },
    });
  }
  if (!existing.passwordHash) {
    throw AppError.unauthorized('This account signs in with Google. Use "Login with Google".');
  }
  if (!(await verifyPassword(password, existing.passwordHash))) {
    throw AppError.unauthorized('Incorrect email or password');
  }
  return existing;
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
