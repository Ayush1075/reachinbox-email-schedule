import { EmailStatus, type Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { ok, parse } from '../lib/http';
import { HOUR_MS, hourWindowStart } from '../lib/time';
import { currentUserId, requireAuth } from '../middleware/requireAuth';
import { ACTIVE_STATUSES, cancelEmail } from '../services/campaigns';
import { emailSenderSelect, toPublicEmail } from '../services/emails';
import { resolveSenderCap } from '../services/limits';
import { getCurrentWindowUsage } from '../services/rateLimiter';

export const emailsRouter = Router();
emailsRouter.use(requireAuth);

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

async function listEmails(
  where: Prisma.EmailJobWhereInput,
  orderBy: Prisma.EmailJobOrderByWithRelationInput[],
  page: number,
  limit: number,
) {
  const [rows, total] = await Promise.all([
    prisma.emailJob.findMany({ where, orderBy, include: { sender: emailSenderSelect }, skip: (page - 1) * limit, take: limit }),
    prisma.emailJob.count({ where }),
  ]);
  return { items: rows.map(toPublicEmail), page, limit, total };
}

/** Everything that still owes a send, soonest first. */
emailsRouter.get('/scheduled', async (req, res) => {
  const { page, limit } = parse(pageSchema, req.query);
  ok(
    res,
    await listEmails(
      { campaign: { userId: currentUserId(req) }, status: { in: ACTIVE_STATUSES } },
      [{ scheduledAt: 'asc' }, { sequenceIndex: 'asc' }],
      page,
      limit,
    ),
  );
});

/** Delivery history: sent and permanently failed, most recent first. */
emailsRouter.get('/sent', async (req, res) => {
  const { page, limit } = parse(pageSchema, req.query);
  ok(
    res,
    await listEmails(
      { campaign: { userId: currentUserId(req) }, status: { in: [EmailStatus.SENT, EmailStatus.FAILED] } },
      [{ updatedAt: 'desc' }],
      page,
      limit,
    ),
  );
});

emailsRouter.post('/:id/cancel', async (req, res) => {
  ok(res, await cancelEmail(currentUserId(req), req.params.id));
});

const statsSchema = z.object({
  /** Client's local midnight, so "Sent today" matches the viewer's day. Defaults to UTC midnight. */
  since: z.coerce.date().optional(),
});

emailsRouter.get('/stats', async (req, res) => {
  const userId = currentUserId(req);
  const { since } = parse(statsSchema, req.query);
  const startOfDay = since ?? new Date(new Date().setUTCHours(0, 0, 0, 0));
  const scope = { campaign: { userId } };

  const [scheduled, sentToday, failed, rateLimited, senders] = await Promise.all([
    prisma.emailJob.count({ where: { ...scope, status: { in: ACTIVE_STATUSES } } }),
    prisma.emailJob.count({ where: { ...scope, status: EmailStatus.SENT, sentAt: { gte: startOfDay } } }),
    prisma.emailJob.count({ where: { ...scope, status: EmailStatus.FAILED } }),
    prisma.emailJob.count({ where: { ...scope, status: EmailStatus.RATE_LIMITED } }),
    prisma.sender.findMany({ where: { userId, isActive: true }, orderBy: { createdAt: 'asc' } }),
  ]);

  // Read straight from the limiter's Redis keys; degrade to zeros if Redis is down.
  const usage = await getCurrentWindowUsage(senders.map((s) => s.id)).catch(() => new Map<string, number>());
  const quota = senders.map((s) => ({
    senderId: s.id,
    label: s.label,
    fromAddress: s.fromAddress,
    used: usage.get(s.id) ?? 0,
    limit: resolveSenderCap(s.hourlyLimit),
  }));
  const windowStart = hourWindowStart(Date.now());

  ok(res, {
    scheduled,
    sentToday,
    failed,
    rateLimited,
    currentHour: {
      windowStart: new Date(windowStart),
      windowEnd: new Date(windowStart + HOUR_MS),
      used: quota.reduce((n, q) => n + q.used, 0),
      limit: quota.reduce((n, q) => n + q.limit, 0),
      senders: quota,
    },
  });
});
