import type { Sender } from '@prisma/client';
import { EmailStatus } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { env, isSlackConfigured } from '../config/env';
import { prisma } from '../db/prisma';
import { decrypt, encrypt } from '../lib/crypto';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { hourWindowId } from '../lib/time';
import { redis } from '../queue/connection';

/**
 * Slack integration via OAuth v2 with the `incoming-webhook` scope: the user
 * picks a channel during install and we store the resulting webhook URL
 * (encrypted). No bot token, no extra permissions.
 */

const STATE_TTL = '10m';
type SlackState = { sub: string; purpose: 'slack-install' };

export function buildInstallUrl(userId: string): string {
  if (!isSlackConfigured) throw AppError.unavailable('Slack is not configured on this server');
  // Signed, short-lived state binds the callback to the user who started the
  // install (CSRF protection) without needing a session cookie on the callback
  // host — which matters because Slack requires an HTTPS (tunnelled) redirect.
  const state = jwt.sign({ sub: userId, purpose: 'slack-install' } satisfies SlackState, env.JWT_SECRET, {
    expiresIn: STATE_TTL,
  });
  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.set('client_id', env.SLACK_CLIENT_ID!);
  url.searchParams.set('scope', 'incoming-webhook');
  url.searchParams.set('redirect_uri', env.SLACK_REDIRECT_URI!);
  url.searchParams.set('state', state);
  return url.toString();
}

function verifyState(state: string): string {
  try {
    const claims = jwt.verify(state, env.JWT_SECRET, { algorithms: ['HS256'] }) as Partial<SlackState>;
    if (claims.purpose !== 'slack-install' || typeof claims.sub !== 'string') throw new Error('bad purpose');
    return claims.sub;
  } catch {
    throw AppError.badRequest('Invalid or expired Slack install state');
  }
}

type OAuthAccessResponse = {
  ok: boolean;
  error?: string;
  team?: { id: string; name: string };
  incoming_webhook?: { url: string; channel: string; channel_id: string };
};

export async function completeInstall(code: string, state: string) {
  const userId = verifyState(state);
  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID!,
      client_secret: env.SLACK_CLIENT_SECRET!,
      code,
      redirect_uri: env.SLACK_REDIRECT_URI!,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json()) as OAuthAccessResponse;
  if (!body.ok || !body.incoming_webhook) {
    throw AppError.badRequest(`Slack OAuth failed: ${body.error ?? 'no incoming webhook returned'}`);
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      slackTeamId: body.team?.id ?? null,
      slackTeamName: body.team?.name ?? null,
      slackChannelId: body.incoming_webhook.channel_id,
      slackChannelName: body.incoming_webhook.channel,
      slackWebhookUrl: encrypt(body.incoming_webhook.url),
      slackConnectedAt: new Date(),
    },
  });
  logger.info({ userId, team: body.team?.name, channel: body.incoming_webhook.channel }, 'Slack connected');
  return userId;
}

export async function disconnectSlack(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      slackTeamId: null,
      slackTeamName: null,
      slackChannelId: null,
      slackChannelName: null,
      slackWebhookUrl: null,
      slackConnectedAt: null,
    },
  });
}

async function postToWebhook(webhookUrl: string, payload: object) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`Slack webhook responded ${res.status}: ${await res.text()}`);
}

/** Webhook is read from the DB on every call (not cached at boot), so connecting Slack takes effect immediately. */
async function getWebhook(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { slackWebhookUrl: true } });
  return user?.slackWebhookUrl ? decrypt(user.slackWebhookUrl) : null;
}

export async function sendTestMessage(userId: string) {
  const webhook = await getWebhook(userId);
  if (!webhook) throw AppError.badRequest('Slack is not connected');
  await postToWebhook(webhook, {
    text: 'ReachInbox Scheduler is connected. Rate-limit alerts will be posted to this channel.',
  });
}

export const alertDedupeKey = (senderId: string, windowStartMs: number) =>
  `slack:alerted:${senderId}:${hourWindowId(windowStartMs)}`;

/**
 * Posts a Block Kit alert the first time a sender hits its hourly cap in a
 * given window. A Redis SET NX key per (sender, window) means 500 deferred
 * jobs produce ONE message, not 500.
 *
 * Never throws and never blocks a send: callers fire-and-forget.
 */
export async function notifyRateLimitHit(params: {
  userId: string;
  sender: Pick<Sender, 'id' | 'label' | 'fromAddress'>;
  limit: number;
  windowEndsAt: number;
}): Promise<void> {
  const { userId, sender, limit, windowEndsAt } = params;
  const log = logger.child({ senderId: sender.id, userId });
  const key = alertDedupeKey(sender.id, windowEndsAt - 1);
  try {
    const webhook = await getWebhook(userId);
    if (!webhook) return; // Slack not connected: silently no-op.

    const ttlS = Math.ceil((windowEndsAt - Date.now()) / 1000) + 300;
    const first = await redis.set(key, '1', 'EX', Math.max(ttlS, 60), 'NX');
    if (first !== 'OK') return; // Already alerted for this sender + window.

    const deferred = await prisma.emailJob.count({ where: { senderId: sender.id, status: EmailStatus.RATE_LIMITED } });
    const resumeUnix = Math.floor(windowEndsAt / 1000);
    const resumeIso = new Date(windowEndsAt).toISOString();

    try {
      await postToWebhook(webhook, {
        text: `Hourly sending limit reached for ${sender.label} (${limit}/hour). ${deferred} email(s) deferred; sending resumes at ${resumeIso}.`,
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: 'Hourly sending limit reached' } },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Sender*\n${sender.label}\n\`${sender.fromAddress}\`` },
              { type: 'mrkdwn', text: `*Limit*\n${limit} emails / hour` },
              { type: 'mrkdwn', text: `*Deferred*\n${deferred} email(s)` },
              { type: 'mrkdwn', text: `*Resumes*\n<!date^${resumeUnix}^{time} ({date_short_pretty})|${resumeIso}>` },
            ],
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: 'Nothing was dropped: deferred emails were rescheduled into the next hour window in their original order.',
              },
            ],
          },
        ],
      });
      log.info({ deferred, limit }, 'Slack rate-limit alert sent');
    } catch (err) {
      // Let a later hit in this window retry the alert.
      await redis.del(key).catch(() => undefined);
      throw err;
    }
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'Slack alert failed (send path unaffected)');
  }
}
