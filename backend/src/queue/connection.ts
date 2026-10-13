import { Redis } from 'ioredis';
import { env } from '../config/env';
import { logger } from '../lib/logger';

/**
 * BullMQ needs `maxRetriesPerRequest: null` on connections used by workers
 * (blocking commands must never time out and reject). We use the same
 * settings everywhere for consistency.
 */
export function createRedisConnection(name: string): Redis {
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectionName: `reachinbox:${name}`,
  });
  client.on('error', (err) => logger.warn({ err: err.message, connection: name }, 'Redis connection error'));
  return client;
}

/** General-purpose client for rate limiting, dedupe keys and quota reads. */
export const redis = createRedisConnection('app');
