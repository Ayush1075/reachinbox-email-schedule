/**
 * Worker process entry point. Runs separately from the API so it can be
 * scaled horizontally (start N of these) and restarted independently — kill
 * it mid-campaign and the delayed jobs simply wait in Redis until it's back.
 */
import { env } from './config/env';
import { prisma } from './db/prisma';
import { logger } from './lib/logger';
import { redis } from './queue/connection';
import { emailQueue } from './queue/emailQueue';
import { closeAllTransports } from './services/mailer';
import { startReconciler } from './services/reconciler';
import { ensureSearchIndex } from './services/search';
import { createEmailWorker } from './workers/emailWorker';

async function main() {
  await prisma.$connect();
  await ensureSearchIndex();

  const worker = createEmailWorker();
  await worker.waitUntilReady();
  const stopReconciler = await startReconciler();
  logger.info(
    { queue: env.QUEUE_NAME, concurrency: env.WORKER_CONCURRENCY, maxPerHour: env.MAX_EMAILS_PER_HOUR },
    'Email worker started',
  );

  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down worker: waiting for in-flight jobs to finish');
    // Hard stop if something hangs; anything unfinished is recovered by BullMQ
    // stalled-job handling and the claim guard, so this is still safe.
    const force = setTimeout(() => {
      logger.error('Graceful shutdown timed out; exiting');
      process.exit(1);
    }, 30_000);
    force.unref();
    try {
      await worker.close(); // stops fetching, waits for active jobs
      await stopReconciler();
      await emailQueue.close();
      await closeAllTransports();
      await redis.quit();
      await prisma.$disconnect();
      logger.info('Worker shut down cleanly');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Worker failed to start');
  process.exit(1);
});
