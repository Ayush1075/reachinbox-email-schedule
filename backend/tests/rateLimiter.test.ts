import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import { HOUR_MS } from '../src/lib/time';
import { acquireSendSlot, getCurrentWindowUsage, lastSendKey, windowKey } from '../src/services/rateLimiter';

// Integration test: requires the docker-compose Redis (`docker compose up -d redis`).
const client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: 1 });
const NOW = Date.UTC(2026, 9, 13, 10, 30, 0);

afterAll(async () => {
  await client.quit();
});

async function cleanup(senderId: string, ms = NOW) {
  await client.del(windowKey(senderId, ms), lastSendKey(senderId));
}

describe('acquireSendSlot (Lua rate limiter)', () => {
  it('allows up to the limit then rejects with time until the next window', async () => {
    const senderId = randomUUID();
    for (let i = 1; i <= 3; i++) {
      const d = await acquireSendSlot({ senderId, limit: 3, nowMs: NOW + i, minSpacingMs: 0 }, client);
      expect(d).toEqual({ allowed: true, usedThisWindow: i });
    }
    const denied = await acquireSendSlot({ senderId, limit: 3, nowMs: NOW + 10, minSpacingMs: 0 }, client);
    expect(denied.allowed).toBe(false);
    if (!denied.allowed && denied.reason === 'HOURLY_LIMIT') {
      expect(denied.retryAfterMs).toBe(Date.UTC(2026, 9, 13, 11) - (NOW + 10));
      expect(denied.windowEndsAt).toBe(Date.UTC(2026, 9, 13, 11));
    } else {
      throw new Error(`expected HOURLY_LIMIT, got ${JSON.stringify(denied)}`);
    }
    await cleanup(senderId);
  });

  it('is race-free: 100 concurrent callers against limit 25 → exactly 25 allowed', async () => {
    const senderId = randomUUID();
    // Separate connections so requests genuinely interleave at the server.
    const clients = Array.from({ length: 10 }, () => new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379'));
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        acquireSendSlot({ senderId, limit: 25, nowMs: NOW, minSpacingMs: 0 }, clients[i % clients.length]!),
      ),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(25);
    expect(Number(await client.get(windowKey(senderId, NOW)))).toBe(25);
    await Promise.all(clients.map((c) => c.quit()));
    await cleanup(senderId);
  });

  it('starts a fresh counter in the next hour window', async () => {
    const senderId = randomUUID();
    await acquireSendSlot({ senderId, limit: 1, nowMs: NOW, minSpacingMs: 0 }, client);
    expect((await acquireSendSlot({ senderId, limit: 1, nowMs: NOW + 1, minSpacingMs: 0 }, client)).allowed).toBe(false);
    const nextHour = NOW + HOUR_MS;
    expect((await acquireSendSlot({ senderId, limit: 1, nowMs: nextHour, minSpacingMs: 0 }, client)).allowed).toBe(true);
    await cleanup(senderId);
    await cleanup(senderId, nextHour);
  });

  it('enforces minimum spacing and does not consume quota when spacing blocks', async () => {
    const senderId = randomUUID();
    expect((await acquireSendSlot({ senderId, limit: 10, nowMs: NOW, minSpacingMs: 2000 }, client)).allowed).toBe(true);
    const tooSoon = await acquireSendSlot({ senderId, limit: 10, nowMs: NOW + 500, minSpacingMs: 2000 }, client);
    expect(tooSoon).toMatchObject({ allowed: false, reason: 'MIN_SPACING', retryAfterMs: 1500, usedThisWindow: 1 });
    expect((await acquireSendSlot({ senderId, limit: 10, nowMs: NOW + 2000, minSpacingMs: 2000 }, client)).allowed).toBe(true);
    await cleanup(senderId);
  });

  it('sets a TTL on the window counter', async () => {
    const senderId = randomUUID();
    await acquireSendSlot({ senderId, limit: 5, nowMs: NOW, minSpacingMs: 0 }, client);
    const ttl = await client.ttl(windowKey(senderId, NOW));
    expect(ttl).toBeGreaterThan(3600);
    expect(ttl).toBeLessThanOrEqual(7200);
    await cleanup(senderId);
  });

  it('getCurrentWindowUsage reads the limiter keys', async () => {
    const senderId = randomUUID();
    await acquireSendSlot({ senderId, limit: 5, minSpacingMs: 0 }, client);
    await acquireSendSlot({ senderId, limit: 5, minSpacingMs: 0 }, client);
    const usage = await getCurrentWindowUsage([senderId, randomUUID()], client);
    expect([...usage.values()]).toEqual([2, 0]);
    await cleanup(senderId, Date.now());
  });
});
