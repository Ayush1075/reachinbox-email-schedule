import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './db/prisma';
import { logger } from './lib/logger';
import { redis } from './queue/connection';
import { emailQueue } from './queue/emailQueue';
import { closeAllTransports } from './services/mailer';
import { ensureSearchIndex } from './services/search';

void ensureSearchIndex();

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, `API listening on http://localhost:${env.PORT}`);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down API');
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  // Stop accepting connections, let in-flight requests finish, then release resources.
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await Promise.allSettled([emailQueue.close(), closeAllTransports(), prisma.$disconnect()]);
  await redis.quit().catch(() => undefined);
  logger.info('API shut down cleanly');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
