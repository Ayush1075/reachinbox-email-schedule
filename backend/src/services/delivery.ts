import { EmailStatus, Prisma } from '@prisma/client';
import type { Redis } from 'ioredis';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { redis as defaultRedis } from '../queue/connection';

/**
 * Exactly-once delivery guards.
 *
 * Layer 1 — BullMQ jobId = EmailJob.id: the same email can't be queued twice.
 * Layer 2 — conditional claim in Postgres (this file): only one worker can
 *           move a row into PROCESSING, and only rows still owing a send.
 * Layer 3 — Redis "sent" marker written the instant SMTP accepts the message,
 *           before Postgres is updated. If the DB write is lost (crash, PG
 *           blip), the retry sees the marker and finalises without re-sending.
 *
 * Why not just one?  Layer 1 can't help after Redis is wiped and the
 * reconciler re-enqueues. Layer 2 alone can't tell whether a crashed claim
 * already handed the message to SMTP. Layer 3 alone is lost with Redis. Each
 * covers a window the others leave open.
 */

const SENT_MARKER_TTL_S = 7 * 24 * 3600;
export const sentMarkerKey = (emailJobId: string) => `email:sent:${emailJobId}`;

export type SentMarker = { messageId: string; previewUrl: string | null; sentAt: string };

export async function readSentMarker(emailJobId: string, client: Redis = defaultRedis): Promise<SentMarker | null> {
  const raw = await client.get(sentMarkerKey(emailJobId));
  return raw ? (JSON.parse(raw) as SentMarker) : null;
}

export async function writeSentMarker(emailJobId: string, marker: SentMarker, client: Redis = defaultRedis) {
  await client.set(sentMarkerKey(emailJobId), JSON.stringify(marker), 'EX', SENT_MARKER_TTL_S);
}

export type ClaimResult =
  | { kind: 'claimed' }
  | { kind: 'not-found' }
  | { kind: 'done'; status: EmailStatus }
  /** Another worker holds a fresh claim; retry once it would be considered stale. */
  | { kind: 'busy'; retryAt: Date }
  /** A previous worker died after handing the message to SMTP: outcome unknown. */
  | { kind: 'ambiguous' };

/**
 * Atomically take ownership of an email for sending.
 *
 * Succeeds only if the row still owes a send (SCHEDULED/QUEUED/RATE_LIMITED),
 * or is PROCESSING under an abandoned claim that never reached SMTP
 * (`sendStartedAt IS NULL` and older than STALE_CLAIM_MS). The single
 * UPDATE ... WHERE is the race arbiter: concurrent callers serialize on the
 * row lock and at most one sees `count = 1`.
 */
export async function claimEmailJob(
  emailJobId: string,
  token: string,
  staleMs: number = env.STALE_CLAIM_MS,
): Promise<ClaimResult> {
  const staleBefore = new Date(Date.now() - staleMs);
  const claimed = await prisma.$executeRaw`
    UPDATE email_jobs
       SET status = 'PROCESSING', "claimToken" = ${token}, "claimedAt" = NOW(), "updatedAt" = NOW()
     WHERE id = ${emailJobId}
       AND (
         status IN ('SCHEDULED', 'QUEUED', 'RATE_LIMITED')
         OR (status = 'PROCESSING' AND "sendStartedAt" IS NULL AND "claimedAt" < ${staleBefore})
       )`;
  if (claimed === 1) return { kind: 'claimed' };

  const row = await prisma.emailJob.findUnique({
    where: { id: emailJobId },
    select: { status: true, claimedAt: true, sendStartedAt: true },
  });
  if (!row) return { kind: 'not-found' };
  if (row.status !== EmailStatus.PROCESSING) return { kind: 'done', status: row.status };

  if (row.sendStartedAt && row.sendStartedAt < staleBefore) return { kind: 'ambiguous' };
  const since = (row.sendStartedAt ?? row.claimedAt ?? new Date()).getTime();
  return { kind: 'busy', retryAt: new Date(since + staleMs + 1_000) };
}

/**
 * Last checkpoint before SMTP. Fails if our claim was taken over (e.g. this
 * worker stalled past STALE_CLAIM_MS), in which case we must not send.
 */
export async function markSendStarted(emailJobId: string, token: string): Promise<boolean> {
  const { count } = await prisma.emailJob.updateMany({
    where: { id: emailJobId, claimToken: token, status: EmailStatus.PROCESSING, sendStartedAt: null },
    data: { sendStartedAt: new Date(), attempts: { increment: 1 } },
  });
  return count === 1;
}

export async function markSent(emailJobId: string, marker: SentMarker) {
  const { count } = await prisma.emailJob.updateMany({
    where: { id: emailJobId, status: { not: EmailStatus.SENT } },
    data: {
      status: EmailStatus.SENT,
      sentAt: new Date(marker.sentAt),
      messageId: marker.messageId,
      previewUrl: marker.previewUrl,
      lastError: null,
      claimToken: null,
    },
  });
  return count === 1;
}

/** Give the email back to the queue (rate limited, spacing, or retryable SMTP error). */
export async function releaseClaim(
  emailJobId: string,
  token: string,
  data: { status: EmailStatus; scheduledAt?: Date; lastError?: string | null; bumpReschedule?: boolean },
) {
  const { count } = await prisma.emailJob.updateMany({
    where: { id: emailJobId, claimToken: token, status: EmailStatus.PROCESSING },
    data: {
      status: data.status,
      claimToken: null,
      claimedAt: null,
      sendStartedAt: null,
      ...(data.scheduledAt && { scheduledAt: data.scheduledAt }),
      ...(data.lastError !== undefined && { lastError: data.lastError }),
      ...(data.bumpReschedule && { rescheduleCount: { increment: 1 } }),
    },
  });
  return count === 1;
}

export async function markFailed(emailJobId: string, error: string, where: Prisma.EmailJobWhereInput = {}) {
  const { count } = await prisma.emailJob.updateMany({
    where: { id: emailJobId, status: { notIn: [EmailStatus.SENT, EmailStatus.CANCELLED] }, ...where },
    data: { status: EmailStatus.FAILED, lastError: error.slice(0, 4000), claimToken: null },
  });
  return count === 1;
}
