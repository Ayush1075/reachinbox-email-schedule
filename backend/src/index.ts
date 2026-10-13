import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, `API listening on http://localhost:${env.PORT}`);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down API');
  server.close();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
