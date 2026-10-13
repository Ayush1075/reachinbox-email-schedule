import { Router } from 'express';
import { env } from '../config/env';
import { ok } from '../lib/http';
import { MAX_RECIPIENTS } from './campaigns';

export const configRouter = Router();

/**
 * Non-secret scheduling parameters, so the compose form's live schedule
 * preview runs the same arithmetic as the server-side planner.
 */
configRouter.get('/', (_req, res) => {
  ok(res, {
    minDelayBetweenEmailsMs: env.MIN_DELAY_BETWEEN_EMAILS_MS,
    defaultHourlyLimit: env.MAX_EMAILS_PER_HOUR_PER_SENDER ?? env.MAX_EMAILS_PER_HOUR,
    maxRecipients: MAX_RECIPIENTS,
    bullBoardPath: '/admin/queues',
  });
});
