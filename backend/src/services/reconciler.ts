import { Queue, Worker } from 'bullmq';
import { EmailStatus } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { logger } from '../lib/logger';
import { createRedisConnection } from '../queue/connection';
import { emailQueue, enqueueEmailJobs } from '../queue/emailQueue';
import { PENDING_STATUSES, refreshCampaignStatus } from './campaigns';
import { markFailed, markSent, readSentMarker } from './delivery';
import { indexEmailJobs } from './search';

/**
 * Reconciler — a SAFETY NET, not the scheduler.
 *
 * Emails are scheduled exclusively as BullMQ delayed jobs. The reconciler
 * only repairs drift between Postgres (the source of truth) and Redis (the
 * timers):
 *
 *   • A pending row with no BullMQ job (Redis wiped / restored from an old
 *     snapshot / enqueue failed after commit) → re-enqueued with its original
 *     scheduledAt (past-due ones fire immediately). jobId = EmailJob.id, so
 *     re-adding a job that does exist is a harmless no-op.
 *   • A pending row whose BullMQ job already finished (e.g. failed after
 *     exceeding the stalled limit) → old job removed, fresh one enqueued.
 *   • A PROCESSING row abandoned by a dead worker → returned to the queue if
 *     it never reached SMTP; finalised from the sent-marker, or marked FAILED
 *     (outcome unknown), if it did.
 *
 * It runs once when a worker boots and then on RECONCILE_INTERVAL_MS via a
 * BullMQ job scheduler, so with N worker processes the sweep still runs once
 * per interval rather than N times.
 */

const BATCH = 500;

export type ReconcileReport = { checked: number; reenqueued: number; recoveredClaims: number; failedAmbiguous: number };

/** `scope` limits the sweep to one campaign (used by tests); production sweeps everything. */
export async function reconcile(scope: { campaignId?: string } = {}): Promise<ReconcileReport> {
  const report: ReconcileReport = { checked: 0, reenqueued: 0, recoveredClaims: 0, failedAmbiguous: 0 };
  const startedAt = Date.now();

  // 1. Pending rows must each have a live BullMQ job.
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.emailJob.findMany({
      where: { status: { in: PENDING_STATUSES }, ...scope },
      select: { id: true, campaignId: true, senderId: true, scheduledAt: true, status: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]!.id;
    report.checked += rows.length;

    const states = await Promise.all(rows.map((r) => emailQueue.getJobState(r.id)));
    const missing = [];
    for (let i = 0; i < rows.length; i++) {
      const state = states[i];
      if (state === 'unknown') missing.push(rows[i]!);
      else if (state === 'completed' || state === 'failed') {
        await emailQueue.remove(rows[i]!.id).catch(() => undefined);
        missing.push(rows[i]!);
      }
    }
    if (missing.length > 0) {
      await enqueueEmailJobs(missing);
      await prisma.emailJob.updateMany({
        where: { id: { in: missing.map((m) => m.id) }, status: EmailStatus.SCHEDULED },
        data: { status: EmailStatus.QUEUED },
      });
      report.reenqueued += missing.length;
    }
  }

  // 2. Abandoned PROCESSING claims.
  const stale = await prisma.emailJob.findMany({
    where: { status: EmailStatus.PROCESSING, claimedAt: { lt: new Date(Date.now() - env.STALE_CLAIM_MS) }, ...scope },
    select: { id: true, campaignId: true, senderId: true, scheduledAt: true, sendStartedAt: true, claimToken: true },
  });
  for (const row of stale) {
    if ((await emailQueue.getJobState(row.id)) === 'active') continue; // a live worker still owns it

    if (!row.sendStartedAt) {
      // Never reached SMTP: safe to hand back to the queue.
      const { count } = await prisma.emailJob.updateMany({
        where: { id: row.id, status: EmailStatus.PROCESSING, claimToken: row.claimToken, sendStartedAt: null },
        data: { status: EmailStatus.QUEUED, claimToken: null, claimedAt: null },
      });
      if (count === 1) {
        await emailQueue.remove(row.id).catch(() => undefined);
        await enqueueEmailJobs([row]);
        report.recoveredClaims++;
      }
      continue;
    }

    const marker = await readSentMarker(row.id);
    if (marker) await markSent(row.id, marker);
    else {
      await markFailed(
        row.id,
        'Delivery outcome unknown: a worker stopped after handing this email to SMTP. Not retried, to guarantee no duplicate send.',
        { status: EmailStatus.PROCESSING, claimToken: row.claimToken },
      );
      report.failedAmbiguous++;
    }
    await refreshCampaignStatus(row.campaignId);
    void indexEmailJobs([row.id]);
  }

  const level = report.reenqueued + report.recoveredClaims + report.failedAmbiguous > 0 ? 'warn' : 'info';
  logger[level]({ ...report, durationMs: Date.now() - startedAt }, 'Reconciliation sweep finished');
  return report;
}

const MAINTENANCE_QUEUE = `${env.QUEUE_NAME}-maintenance`;

/** Registers the periodic sweep and the worker that runs it. Returns a closer. */
export async function startReconciler() {
  const queue = new Queue(MAINTENANCE_QUEUE, { connection: createRedisConnection('maintenance-queue') });
  // One sweep at a time across ALL worker processes.
  await queue.setGlobalConcurrency(1);
  await queue.upsertJobScheduler(
    'reconcile',
    { every: env.RECONCILE_INTERVAL_MS },
    { name: 'reconcile', opts: { removeOnComplete: 50, removeOnFail: 50 } },
  );
  // Immediate sweep on boot covers everything that drifted while workers were down.
  // Routed through the same queue so it serialises with the periodic one.
  await queue.add('reconcile-boot', {}, { removeOnComplete: 50, removeOnFail: 50 });

  const worker = new Worker(MAINTENANCE_QUEUE, async () => reconcile(), {
    connection: createRedisConnection('maintenance-worker'),
    concurrency: 1,
  });
  worker.on('failed', (_job, err) => logger.error({ err }, 'Reconciliation sweep failed'));

  return async () => {
    await worker.close();
    await queue.close();
  };
}
