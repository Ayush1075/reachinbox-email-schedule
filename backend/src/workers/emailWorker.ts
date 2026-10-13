import { DelayedError, type Job, UnrecoverableError, Worker } from 'bullmq';
import { EmailStatus } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { logger } from '../lib/logger';
import { createRedisConnection } from '../queue/connection';
import type { EmailJobData } from '../queue/emailQueue';
import { refreshCampaignStatus } from '../services/campaigns';
import {
  claimEmailJob,
  markFailed,
  markSendStarted,
  markSent,
  readSentMarker,
  releaseClaim,
  writeSentMarker,
} from '../services/delivery';
import { resolveEffectiveLimit } from '../services/limits';
import { sendEmail } from '../services/mailer';
import { acquireSendSlot } from '../services/rateLimiter';
import { indexEmailJobs } from '../services/search';

/** SMTP 5xx replies are permanent (bad mailbox, auth rejected, policy) — retrying won't help. */
function isPermanentSmtpError(err: unknown): boolean {
  const code = (err as { responseCode?: number }).responseCode;
  return typeof code === 'number' && code >= 500 && code < 600;
}

async function afterTerminal(emailJobId: string, campaignId: string) {
  await refreshCampaignStatus(campaignId).catch((err) => logger.warn({ err, campaignId }, 'Campaign status refresh failed'));
  void indexEmailJobs([emailJobId]);
}

/** Re-delay the BullMQ job without consuming a retry attempt. */
async function deferJob(job: Job<EmailJobData>, token: string, until: number): Promise<never> {
  await job.moveToDelayed(until, token);
  throw new DelayedError();
}

export async function processEmailJob(job: Job<EmailJobData>, token?: string): Promise<{ outcome: string }> {
  const { emailJobId, campaignId } = job.data;
  const log = logger.child({ emailJobId, campaignId, bullJobId: job.id, attempt: job.attemptsMade + 1 });
  if (!token) throw new Error('Worker did not provide a lock token');

  // Layer 3: did a previous attempt already get this through SMTP?
  const marker = await readSentMarker(emailJobId);
  if (marker) {
    await markSent(emailJobId, marker);
    await afterTerminal(emailJobId, campaignId);
    log.warn('Sent marker found: finalised as SENT without re-sending');
    return { outcome: 'already-sent' };
  }

  // Layer 2: conditional claim.
  const claim = await claimEmailJob(emailJobId, token);
  switch (claim.kind) {
    case 'not-found':
      log.warn('Email row no longer exists; dropping job');
      return { outcome: 'not-found' };
    case 'done':
      log.info({ status: claim.status }, 'Email already handled; skipping (idempotent no-op)');
      return { outcome: `skipped-${claim.status.toLowerCase()}` };
    case 'busy':
      log.info({ retryAt: claim.retryAt }, 'Another worker holds a fresh claim; re-checking later');
      return deferJob(job, token, claim.retryAt.getTime());
    case 'ambiguous':
      await markFailed(
        emailJobId,
        'Delivery outcome unknown: a worker stopped after handing this email to SMTP. Not retried, to guarantee no duplicate send.',
        { status: EmailStatus.PROCESSING },
      );
      await afterTerminal(emailJobId, campaignId);
      log.error('Ambiguous mid-send crash detected; marked FAILED instead of risking a duplicate');
      return { outcome: 'ambiguous-failed' };
    case 'claimed':
      break;
  }

  const email = await prisma.emailJob.findUniqueOrThrow({
    where: { id: emailJobId },
    include: { sender: true, campaign: { select: { hourlyLimit: true, userId: true } } },
  });
  const { sender } = email;

  // Rate limit + per-sender spacing, atomically in Redis.
  const limit = resolveEffectiveLimit(sender.hourlyLimit, email.campaign.hourlyLimit);
  const slot = await acquireSendSlot({ senderId: sender.id, limit });
  if (!slot.allowed) {
    if (slot.reason === 'HOURLY_LIMIT') {
      // Never drop: move to the next window. The small sequenceIndex offset keeps
      // deferred emails in their original order when the window reopens.
      const next = slot.windowEndsAt + Math.min(email.sequenceIndex, 60_000);
      await releaseClaim(emailJobId, token, {
        status: EmailStatus.RATE_LIMITED,
        scheduledAt: new Date(next),
        bumpReschedule: true,
      });
      log.warn({ senderId: sender.id, limit, used: slot.usedThisWindow, nextAt: new Date(next) }, 'Hourly limit reached; deferred to next window');
      void indexEmailJobs([emailJobId]);
      return deferJob(job, token, next);
    }
    const next = Date.now() + slot.retryAfterMs;
    await releaseClaim(emailJobId, token, { status: EmailStatus.QUEUED, scheduledAt: new Date(next) });
    log.debug({ waitMs: slot.retryAfterMs }, 'Min spacing not elapsed; re-delayed');
    return deferJob(job, token, next);
  }

  // Final checkpoint: still ours? (Fails if this worker stalled and was superseded.)
  if (!(await markSendStarted(emailJobId, token))) {
    log.warn('Claim lost before SMTP handoff; not sending');
    return { outcome: 'claim-lost' };
  }

  try {
    const result = await sendEmail(sender, {
      emailJobId,
      from: sender.fromAddress,
      fromName: sender.label,
      to: email.recipient,
      subject: email.subject,
      body: email.body,
    });
    const sentMarker = { ...result, sentAt: new Date().toISOString() };
    // Marker first: if the DB write below fails, the retry finalises from it.
    await writeSentMarker(emailJobId, sentMarker);
    await markSent(emailJobId, sentMarker);
    await afterTerminal(emailJobId, campaignId);
    log.info({ to: email.recipient, messageId: result.messageId, previewUrl: result.previewUrl }, 'Email sent');
    return { outcome: 'sent' };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    const permanent = isPermanentSmtpError(err);
    const finalAttempt = permanent || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

    if (finalAttempt) {
      await markFailed(emailJobId, message);
      await afterTerminal(emailJobId, campaignId);
      log.error({ err: message, permanent }, 'Send failed permanently; marked FAILED');
      if (permanent) throw new UnrecoverableError(message);
    } else {
      await releaseClaim(emailJobId, token, { status: EmailStatus.QUEUED, lastError: message });
      log.warn({ err: message }, 'Send failed; BullMQ will retry with backoff');
    }
    throw err;
  }
}

export function createEmailWorker() {
  const worker = new Worker<EmailJobData>(env.QUEUE_NAME, processEmailJob, {
    connection: createRedisConnection('worker'),
    concurrency: env.WORKER_CONCURRENCY,
    // Coarse global throttle shared by every worker process (enforced in Redis).
    // The per-sender hourly cap is the Lua limiter's job, not this.
    limiter: { max: env.QUEUE_GLOBAL_RATE_MAX, duration: env.QUEUE_GLOBAL_RATE_DURATION_MS },
    removeOnComplete: { age: env.REMOVE_ON_COMPLETE_AGE_S },
    removeOnFail: { age: env.REMOVE_ON_FAIL_AGE_S },
  });

  worker.on('failed', (job, err) => {
    logger.warn({ bullJobId: job?.id, emailJobId: job?.data.emailJobId, err: err.message, attemptsMade: job?.attemptsMade }, 'Job attempt failed');
  });
  worker.on('error', (err) => logger.error({ err }, 'Worker error'));
  worker.on('stalled', (jobId) => logger.warn({ bullJobId: jobId }, 'Job stalled; BullMQ will re-run it (claim guard prevents double send)'));
  return worker;
}
