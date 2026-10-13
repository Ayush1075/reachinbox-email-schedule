import { Queue, type JobsOptions } from 'bullmq';
import { env } from '../config/env';
import { createRedisConnection } from './connection';

export type EmailJobData = {
  emailJobId: string;
  campaignId: string;
  senderId: string;
};

export const defaultJobOptions: JobsOptions = {
  attempts: env.JOB_ATTEMPTS,
  backoff: { type: 'exponential', delay: env.JOB_BACKOFF_MS },
  // Postgres holds the permanent record; Redis only needs recent history for Bull Board.
  removeOnComplete: { age: env.REMOVE_ON_COMPLETE_AGE_S },
  removeOnFail: { age: env.REMOVE_ON_FAIL_AGE_S },
};

export const emailQueue = new Queue<EmailJobData>(env.QUEUE_NAME, {
  connection: createRedisConnection('queue'),
  defaultJobOptions,
});

export type EnqueueInput = { id: string; campaignId: string; senderId: string; scheduledAt: Date };

/**
 * Enqueue email jobs as BullMQ *delayed* jobs. This is the scheduler: Redis
 * keeps each job in a sorted set keyed by its fire time, and a worker picks it
 * up when the time arrives. No cron or polling loop is involved.
 *
 * `jobId = EmailJob.id` makes enqueueing idempotent (layer 1): BullMQ ignores
 * an add whose jobId already exists, so the reconciler — or a retry of this
 * function — can call it again without creating a duplicate.
 *
 * Large campaigns are added in chunks so a 10k-recipient campaign doesn't
 * build one enormous Redis pipeline or block the event loop.
 */
export async function enqueueEmailJobs(jobs: EnqueueInput[], chunkSize = env.ENQUEUE_CHUNK_SIZE): Promise<number> {
  let added = 0;
  for (let i = 0; i < jobs.length; i += chunkSize) {
    const now = Date.now();
    const chunk = jobs.slice(i, i + chunkSize);
    await emailQueue.addBulk(
      chunk.map((j) => ({
        name: 'send-email',
        data: { emailJobId: j.id, campaignId: j.campaignId, senderId: j.senderId },
        opts: { jobId: j.id, delay: Math.max(0, j.scheduledAt.getTime() - now) },
      })),
    );
    added += chunk.length;
    // Yield to the event loop between chunks so the API stays responsive.
    await new Promise((resolve) => setImmediate(resolve));
  }
  return added;
}
