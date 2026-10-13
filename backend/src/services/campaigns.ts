import { randomUUID } from 'node:crypto';
import { CampaignStatus, EmailStatus, Prisma } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { hourWindowStart } from '../lib/time';
import { emailQueue, enqueueEmailJobs } from '../queue/emailQueue';
import { planSchedule } from '../queue/scheduler';
import { claimAttachments } from './attachments';
import { htmlToPlainText, sanitizeEmailHtml } from './html';
import { resolveEffectiveLimit } from './limits';
import { getCurrentWindowUsage } from './rateLimiter';
import { indexEmailJobs, indexEmailJobsByCampaign } from './search';

/** Statuses that still owe a send. */
export const PENDING_STATUSES: EmailStatus[] = [EmailStatus.SCHEDULED, EmailStatus.QUEUED, EmailStatus.RATE_LIMITED];
export const ACTIVE_STATUSES: EmailStatus[] = [...PENDING_STATUSES, EmailStatus.PROCESSING];

/** Postgres caps a statement at 65,535 bind parameters; stay well clear. */
const INSERT_CHUNK = 2_000;
/** Accept a start time this far in the past (clock skew, slow form submit) and treat it as "now". */
const START_GRACE_MS = 60_000;

export type CreateCampaignInput = {
  subject: string;
  body: string;
  recipients: string[];
  startAt: Date;
  delayBetweenMs: number;
  hourlyLimit?: number | null;
  senderIds: string[];
  /** 'html' bodies come from the rich-text editor and are sanitized here. */
  bodyFormat?: 'text' | 'html';
  attachmentIds?: string[];
};

/**
 * Emails already committed per sender per hour window (from Postgres), plus
 * what the runtime limiter has actually counted in the current window (Redis).
 */
async function loadExistingCommitments(senderIds: string[], fromMs: number) {
  const rows = await prisma.$queryRaw<{ senderId: string; window: bigint; count: number }[]>`
    SELECT "senderId",
           (EXTRACT(EPOCH FROM date_trunc('hour', "scheduledAt")) * 1000)::bigint AS "window",
           COUNT(*)::int AS "count"
    FROM email_jobs
    WHERE "senderId" IN (${Prisma.join(senderIds)})
      AND status::text IN (${Prisma.join(ACTIVE_STATUSES)})
      AND "scheduledAt" >= ${new Date(hourWindowStart(fromMs))}
    GROUP BY 1, 2`;

  const load = new Map<string, Map<number, number>>();
  for (const id of senderIds) load.set(id, new Map());
  for (const r of rows) load.get(r.senderId)!.set(Number(r.window), r.count);

  // Sends already made this hour count against the cap too.
  const nowWindow = hourWindowStart(Date.now());
  const usage = await getCurrentWindowUsage(senderIds).catch(() => new Map<string, number>());
  for (const [senderId, used] of usage) {
    const windows = load.get(senderId)!;
    windows.set(nowWindow, (windows.get(nowWindow) ?? 0) + used);
  }
  return load;
}

export async function createCampaign(userId: string, input: CreateCampaignInput) {
  const now = Date.now();
  if (input.startAt.getTime() < now - START_GRACE_MS) {
    throw AppError.badRequest('startAt is in the past; choose a future time');
  }
  const startAt = new Date(Math.max(input.startAt.getTime(), now));

  const bodyIsHtml = input.bodyFormat === 'html';
  const body = bodyIsHtml ? sanitizeEmailHtml(input.body) : input.body;
  if (!(bodyIsHtml ? htmlToPlainText(body) : body).trim()) throw AppError.badRequest('Body is required');

  const senderIds = [...new Set(input.senderIds)];
  const senders = await prisma.sender.findMany({ where: { id: { in: senderIds }, userId, isActive: true } });
  if (senders.length !== senderIds.length) throw AppError.badRequest('One or more senders are unknown or inactive');
  // Preserve the caller's sender order for round-robin.
  senders.sort((a, b) => senderIds.indexOf(a.id) - senderIds.indexOf(b.id));

  const plan = planSchedule({
    startAt,
    delayBetweenMs: input.delayBetweenMs,
    recipientCount: input.recipients.length,
    senders: senders.map((s) => ({ id: s.id, hourlyLimit: resolveEffectiveLimit(s.hourlyLimit, input.hourlyLimit) })),
    minSpacingMs: env.MIN_DELAY_BETWEEN_EMAILS_MS,
    existingLoad: await loadExistingCommitments(senderIds, startAt.getTime()),
  });

  const campaignId = randomUUID();
  const jobs = plan.slots.map((slot) => {
    const id = randomUUID();
    return {
      id,
      campaignId,
      senderId: slot.senderId,
      recipient: input.recipients[slot.sequenceIndex]!,
      subject: input.subject,
      body,
      bodyIsHtml,
      scheduledAt: slot.scheduledAt,
      sequenceIndex: slot.sequenceIndex,
      bullJobId: id,
      idempotencyKey: `${campaignId}:${slot.sequenceIndex}`,
    };
  });

  // 1. Persist everything atomically: either the whole campaign exists or none of it does.
  const campaign = await prisma.$transaction(
    async (tx) => {
      const created = await tx.campaign.create({
        data: {
          id: campaignId,
          userId,
          subject: input.subject,
          body,
          bodyIsHtml,
          startAt,
          delayBetweenMs: input.delayBetweenMs,
          hourlyLimit: input.hourlyLimit ?? null,
          totalRecipients: jobs.length,
          plannedEndAt: plan.endsAt,
        },
      });
      await claimAttachments(tx, userId, campaignId, [...new Set(input.attachmentIds ?? [])]);
      for (let i = 0; i < jobs.length; i += INSERT_CHUNK) {
        await tx.emailJob.createMany({ data: jobs.slice(i, i + INSERT_CHUNK) });
      }
      return created;
    },
    { timeout: 60_000, maxWait: 10_000 },
  );

  // 2. Only after commit, hand the timers to BullMQ. If Redis is down here the
  //    rows stay SCHEDULED and the reconciler enqueues them later — the
  //    campaign is never lost, only delayed.
  let enqueued = false;
  try {
    await enqueueEmailJobs(jobs);
    for (let i = 0; i < jobs.length; i += INSERT_CHUNK) {
      await prisma.emailJob.updateMany({
        // Conditional: a job that already fired (short delay) must not be moved back.
        where: { id: { in: jobs.slice(i, i + INSERT_CHUNK).map((j) => j.id) }, status: EmailStatus.SCHEDULED },
        data: { status: EmailStatus.QUEUED },
      });
    }
    enqueued = true;
  } catch (err) {
    logger.error({ err, campaignId }, 'Enqueue failed after commit; reconciler will retry');
  }

  void indexEmailJobsByCampaign(campaignId);

  logger.info(
    { campaignId, recipients: jobs.length, senders: senders.length, deferredByCap: plan.deferredByCap, enqueued },
    'Campaign scheduled',
  );
  return { campaign, plan: { endsAt: plan.endsAt, deferredByCap: plan.deferredByCap }, enqueued };
}

export async function getCampaignCounts(campaignIds: string[]) {
  const grouped = await prisma.emailJob.groupBy({
    by: ['campaignId', 'status'],
    where: { campaignId: { in: campaignIds } },
    _count: { _all: true },
  });
  const result = new Map<string, Partial<Record<EmailStatus, number>>>();
  for (const g of grouped) {
    const counts = result.get(g.campaignId) ?? {};
    counts[g.status] = g._count._all;
    result.set(g.campaignId, counts);
  }
  return result;
}

/**
 * Recompute a campaign's lifecycle status from its jobs. Cheap (one grouped
 * count on an indexed column) and called after each terminal transition.
 */
export async function refreshCampaignStatus(campaignId: string) {
  const counts = (await getCampaignCounts([campaignId])).get(campaignId) ?? {};
  const n = (s: EmailStatus) => counts[s] ?? 0;
  const active = ACTIVE_STATUSES.reduce((sum, s) => sum + n(s), 0);

  let status: CampaignStatus;
  if (active > 0) status = n(EmailStatus.SENT) + n(EmailStatus.FAILED) + n(EmailStatus.PROCESSING) > 0 ? CampaignStatus.RUNNING : CampaignStatus.SCHEDULED;
  else if (n(EmailStatus.SENT) === 0 && n(EmailStatus.FAILED) === 0) status = CampaignStatus.CANCELLED;
  else if (n(EmailStatus.FAILED) > 0) status = CampaignStatus.PARTIALLY_FAILED;
  else status = CampaignStatus.COMPLETED;

  // Don't overwrite an explicit user cancellation.
  await prisma.campaign.updateMany({
    where: { id: campaignId, status: { not: CampaignStatus.CANCELLED } },
    data: { status },
  });
}

/** Cancel every not-yet-sent email in a campaign. Jobs already mid-send are left to finish. */
export async function cancelCampaign(userId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, userId } });
  if (!campaign) throw AppError.notFound('Campaign not found');

  const pending = await prisma.emailJob.findMany({
    where: { campaignId, status: { in: PENDING_STATUSES } },
    select: { id: true },
  });
  const ids = pending.map((j) => j.id);
  const { count } = await prisma.emailJob.updateMany({
    where: { id: { in: ids }, status: { in: PENDING_STATUSES } },
    data: { status: EmailStatus.CANCELLED },
  });
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: CampaignStatus.CANCELLED } });

  // Best effort: the DB status is authoritative — the worker's conditional
  // claim skips CANCELLED rows even if a BullMQ job survives this.
  await removeQueuedJobs(ids);
  void indexEmailJobs(ids);
  return { cancelled: count };
}

export async function cancelEmail(userId: string, emailJobId: string) {
  const job = await prisma.emailJob.findFirst({ where: { id: emailJobId, campaign: { userId } } });
  if (!job) throw AppError.notFound('Email not found');
  const { count } = await prisma.emailJob.updateMany({
    where: { id: emailJobId, status: { in: PENDING_STATUSES } },
    data: { status: EmailStatus.CANCELLED },
  });
  if (count === 0) throw AppError.conflict(`Email is already ${job.status.toLowerCase()} and cannot be cancelled`);
  await removeQueuedJobs([emailJobId]);
  await refreshCampaignStatus(job.campaignId);
  void indexEmailJobs([emailJobId]);
  return { cancelled: 1 };
}

async function removeQueuedJobs(ids: string[]) {
  for (const id of ids) {
    try {
      await emailQueue.remove(id);
    } catch (err) {
      // Locked (active) jobs can't be removed; the claim guard handles them.
      logger.debug({ err, emailJobId: id }, 'Could not remove BullMQ job');
    }
  }
}
