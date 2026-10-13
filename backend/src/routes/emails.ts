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

const SORT_FIELDS = ['recipient', 'subject', 'scheduledAt', 'sentAt', 'status', 'updatedAt'] as const;

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** Comma-separated subset of the list's statuses, e.g. `QUEUED,RATE_LIMITED`. */
  status: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter(Boolean) : []))
    .pipe(z.array(z.nativeEnum(EmailStatus))),
  sort: z.enum(SORT_FIELDS).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

type ListQuery = z.infer<typeof listSchema>;

async function listEmails(
  userId: string,
  allowed: EmailStatus[],
  query: ListQuery,
  defaultOrder: Prisma.EmailJobOrderByWithRelationInput[],
) {
  const { page, limit, status, sort, order = 'asc' } = query;
  const statuses = status.length > 0 ? allowed.filter((s) => status.includes(s)) : allowed;
  const where: Prisma.EmailJobWhereInput = { campaign: { userId }, status: { in: statuses } };
  const orderBy: Prisma.EmailJobOrderByWithRelationInput[] = sort
    ? [sort === 'sentAt' ? { sentAt: { sort: order, nulls: 'last' } } : { [sort]: order }, { id: 'asc' }]
    : defaultOrder;
  const [rows, total] = await Promise.all([
    prisma.emailJob.findMany({ where, orderBy, include: { sender: emailSenderSelect }, skip: (page - 1) * limit, take: limit }),
    prisma.emailJob.count({ where }),
  ]);
  return { items: rows.map(toPublicEmail), page, limit, total };
}

/** Everything that still owes a send, soonest first. */
emailsRouter.get('/scheduled', async (req, res) => {
  const query = parse(listSchema, req.query);
  ok(res, await listEmails(currentUserId(req), ACTIVE_STATUSES, query, [{ scheduledAt: 'asc' }, { sequenceIndex: 'asc' }]));
});

/** Delivery history: sent and permanently failed, most recent first. */
emailsRouter.get('/sent', async (req, res) => {
  const query = parse(listSchema, req.query);
  ok(res, await listEmails(currentUserId(req), [EmailStatus.SENT, EmailStatus.FAILED], query, [{ updatedAt: 'desc' }]));
});

const THROUGHPUT_BUCKET_MS = 5 * 60 * 1000;
const THROUGHPUT_BUCKETS = 12;

/** Emails sent per 5-minute bucket over the last hour, oldest first, zero-filled. */
emailsRouter.get('/throughput', async (req, res) => {
  const userId = currentUserId(req);
  const lastBucket = Math.floor(Date.now() / THROUGHPUT_BUCKET_MS) * THROUGHPUT_BUCKET_MS;
  const from = lastBucket - (THROUGHPUT_BUCKETS - 1) * THROUGHPUT_BUCKET_MS;
  const rows = await prisma.$queryRaw<{ bucket: bigint; sent: number }[]>`
    SELECT (FLOOR(EXTRACT(EPOCH FROM e."sentAt") * 1000 / ${THROUGHPUT_BUCKET_MS}) * ${THROUGHPUT_BUCKET_MS})::bigint AS "bucket",
           COUNT(*)::int AS "sent"
    FROM email_jobs e
    JOIN campaigns c ON c.id = e."campaignId"
    WHERE c."userId" = ${userId}
      AND e.status = 'SENT'
      AND e."sentAt" >= ${new Date(from)}
    GROUP BY 1`;
  const counts = new Map(rows.map((r) => [Number(r.bucket), r.sent]));
  const buckets = Array.from({ length: THROUGHPUT_BUCKETS }, (_, i) => {
    const start = from + i * THROUGHPUT_BUCKET_MS;
    return { bucketStart: new Date(start), sent: counts.get(start) ?? 0 };
  });
  ok(res, { bucketMs: THROUGHPUT_BUCKET_MS, buckets });
});

/** Most recent state transitions (any status), newest first. */
emailsRouter.get('/recent', async (req, res) => {
  const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(50).default(8) }), req.query);
  const rows = await prisma.emailJob.findMany({
    where: { campaign: { userId: currentUserId(req) } },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    include: { sender: emailSenderSelect },
    take: limit,
  });
  ok(res, rows.map((r) => ({ ...toPublicEmail(r), updatedAt: r.updatedAt })));
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
