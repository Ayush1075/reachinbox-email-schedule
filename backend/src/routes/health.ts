import { Router } from 'express';
import { prisma } from '../db/prisma';
import { redis } from '../queue/connection';
import { emailQueue } from '../queue/emailQueue';
import { getTransport } from '../services/mailer';
import { es } from '../services/search';

export const healthRouter = Router();

type Check = { status: 'up' | 'down' | 'skipped'; latencyMs?: number; error?: string; detail?: string };

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms))]);
}

async function check(fn: () => Promise<string | void>, timeoutMs = 3_000): Promise<Check> {
  const start = performance.now();
  try {
    const detail = await withTimeout(fn(), timeoutMs);
    return { status: 'up', latencyMs: Math.round(performance.now() - start), ...(detail && { detail }) };
  } catch (err) {
    return { status: 'down', latencyMs: Math.round(performance.now() - start), error: (err as Error).message };
  }
}

// SMTP verification opens a real session; cache it so polling /health doesn't hammer the provider.
let smtpCache: { at: number; result: Check } | null = null;
const SMTP_CACHE_MS = 60_000;

async function checkSmtp(): Promise<Check> {
  if (smtpCache && Date.now() - smtpCache.at < SMTP_CACHE_MS) return smtpCache.result;
  const sender = await prisma.sender.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
  const result: Check = sender
    ? await check(async () => {
        await getTransport(sender).verify();
        return `${sender.smtpHost}:${sender.smtpPort}`;
      }, 10_000)
    : { status: 'skipped', detail: 'no active senders' };
  smtpCache = { at: Date.now(), result };
  return result;
}

/**
 * Per-dependency health with latency. Postgres and Redis are critical (503 if
 * down); Elasticsearch and SMTP are degradable (search falls back to
 * Postgres; sends retry), so they report "degraded" with a 200.
 */
healthRouter.get('/', async (_req, res) => {
  const [postgres, redisCheck, elasticsearch, smtp, queue] = await Promise.all([
    check(async () => {
      await prisma.$queryRaw`SELECT 1`;
    }),
    check(async () => {
      await redis.ping();
    }),
    check(async () => {
      const h = await es.cluster.health();
      return `cluster ${h.status}`;
    }),
    checkSmtp(),
    withTimeout(emailQueue.getJobCounts('delayed', 'waiting', 'active', 'completed', 'failed'), 3_000).catch(() => null),
  ]);

  const critical = postgres.status === 'up' && redisCheck.status === 'up';
  const degraded = elasticsearch.status === 'down' || smtp.status === 'down';
  const status = !critical ? 'down' : degraded ? 'degraded' : 'ok';

  res.status(critical ? 200 : 503).json({
    success: critical,
    data: {
      status,
      uptimeS: Math.round(process.uptime()),
      checks: { postgres, redis: redisCheck, elasticsearch, smtp },
      queue,
    },
  });
});
