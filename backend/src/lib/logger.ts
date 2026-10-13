import pino from 'pino';
import { env } from '../config/env';

/**
 * Structured JSON logs in production; pretty-printed in development.
 * Use `logger.child({ emailJobId, campaignId })` so every line in a job's
 * lifecycle carries the same correlation fields.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: process.env.SERVICE_NAME ?? 'api' },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.smtpPass', '*.webhookUrl', '*.slackWebhookUrl'],
    censor: '[redacted]',
  },
  ...(env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
    },
  }),
});

export type Logger = pino.Logger;
