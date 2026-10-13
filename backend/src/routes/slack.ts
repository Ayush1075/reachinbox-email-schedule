import { Router } from 'express';
import { env, isSlackConfigured } from '../config/env';
import { prisma } from '../db/prisma';
import { AppError } from '../lib/errors';
import { ok } from '../lib/http';
import { currentUserId, requireAuth } from '../middleware/requireAuth';
import { buildInstallUrl, completeInstall, disconnectSlack, sendTestMessage } from '../services/slack';

export const slackRouter = Router();

const dashboardUrl = (params: Record<string, string>) =>
  `${env.FRONTEND_URL}/dashboard?${new URLSearchParams(params).toString()}`;

/** Browser navigation (not fetch): redirects to Slack's consent screen. */
slackRouter.get('/install', requireAuth, (req, res) => {
  if (!isSlackConfigured) return res.redirect(dashboardUrl({ slack: 'not_configured' }));
  res.redirect(buildInstallUrl(currentUserId(req)));
});

/** Slack redirects here after consent. Auth comes from the signed `state`, not a cookie. */
slackRouter.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (typeof error === 'string') return res.redirect(dashboardUrl({ slack: 'error', reason: error }));
  if (typeof code !== 'string' || typeof state !== 'string') {
    return res.redirect(dashboardUrl({ slack: 'error', reason: 'missing_code' }));
  }
  try {
    await completeInstall(code, state);
    res.redirect(dashboardUrl({ slack: 'connected' }));
  } catch (err) {
    req.log.warn({ err }, 'Slack OAuth callback failed');
    const reason = err instanceof AppError ? err.message : 'unexpected_error';
    res.redirect(dashboardUrl({ slack: 'error', reason }));
  }
});

slackRouter.get('/status', requireAuth, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: currentUserId(req) } });
  ok(res, {
    configured: isSlackConfigured,
    connected: Boolean(user.slackConnectedAt),
    teamName: user.slackTeamName,
    channelName: user.slackChannelName,
    connectedAt: user.slackConnectedAt,
  });
});

slackRouter.post('/disconnect', requireAuth, async (req, res) => {
  await disconnectSlack(currentUserId(req));
  ok(res, { connected: false });
});

slackRouter.post('/test', requireAuth, async (req, res) => {
  try {
    await sendTestMessage(currentUserId(req));
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.unavailable(`Slack rejected the message: ${(err as Error).message}`);
  }
  ok(res, { sent: true });
});
