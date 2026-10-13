import type { Redis, Result } from 'ioredis';
import { env } from '../config/env';
import { HOUR_MS, hourWindowId, hourWindowStart } from '../lib/time';
import { redis as defaultRedis } from '../queue/connection';

/**
 * Per-sender rate limiting, enforced atomically in Redis.
 *
 * Two rules are checked in ONE Lua script, so the check and the reservation
 * are a single atomic step no matter how many worker processes race:
 *
 *   1. Hourly cap — fixed UTC hour window counter
 *        ratelimit:sender:{senderId}:{YYYY-MM-DDTHH}
 *   2. Minimum spacing — timestamp of the sender's last reserved send
 *        ratelimit:sender:{senderId}:last
 *
 * A naive `GET count` → `if < limit` → `INCR` from Node has a race window:
 * N workers can all read 199 and all send. Inside a Lua script Redis runs the
 * read-compare-increment with no interleaving, so exactly `limit` callers win.
 *
 * Note: a reserved slot is not refunded if the SMTP send then fails. Counting
 * attempts rather than deliveries is the conservative choice — providers
 * throttle on attempts too.
 */
export const ACQUIRE_SEND_SLOT_LUA = `
-- KEYS[1] hour-window counter   KEYS[2] last-send timestamp
-- ARGV[1] limit  ARGV[2] now(ms)  ARGV[3] window end(ms)  ARGV[4] min spacing(ms)  ARGV[5] counter TTL(s)
local limit      = tonumber(ARGV[1])
local now        = tonumber(ARGV[2])
local windowEnd  = tonumber(ARGV[3])
local minSpacing = tonumber(ARGV[4])

local count = tonumber(redis.call('GET', KEYS[1]) or '0')
if count >= limit then
  return {0, windowEnd - now, count}            -- 0 = hourly limit reached
end

local last = tonumber(redis.call('GET', KEYS[2]) or '0')
local wait = last + minSpacing - now
if wait > 0 then
  return {2, wait, count}                        -- 2 = too soon after previous send
end

count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[5]))
end
redis.call('SET', KEYS[2], now, 'PX', math.max(minSpacing, 1000) * 2)
return {1, 0, count}                             -- 1 = allowed, slot reserved
`;

declare module 'ioredis' {
  interface RedisCommander<Context> {
    acquireSendSlot(
      windowKey: string,
      lastSendKey: string,
      limit: number,
      nowMs: number,
      windowEndMs: number,
      minSpacingMs: number,
      ttlSeconds: number,
    ): Result<[number, number, number], Context>;
  }
}

const registered = new WeakSet<Redis>();
function withScript(client: Redis): Redis {
  if (!registered.has(client)) {
    // defineCommand uses EVALSHA with automatic EVAL fallback.
    client.defineCommand('acquireSendSlot', { numberOfKeys: 2, lua: ACQUIRE_SEND_SLOT_LUA });
    registered.add(client);
  }
  return client;
}

export const windowKey = (senderId: string, ms: number) => `ratelimit:sender:${senderId}:${hourWindowId(ms)}`;
export const lastSendKey = (senderId: string) => `ratelimit:sender:${senderId}:last`;

/** Counter keys outlive their window so the quota meter can read the previous hour if needed. */
const COUNTER_TTL_S = 2 * 60 * 60;

export type SlotDecision =
  | { allowed: true; usedThisWindow: number }
  | { allowed: false; reason: 'HOURLY_LIMIT'; retryAfterMs: number; usedThisWindow: number; windowEndsAt: number }
  | { allowed: false; reason: 'MIN_SPACING'; retryAfterMs: number; usedThisWindow: number };

export async function acquireSendSlot(
  params: { senderId: string; limit: number; nowMs?: number; minSpacingMs?: number },
  client: Redis = defaultRedis,
): Promise<SlotDecision> {
  const now = params.nowMs ?? Date.now();
  const windowEnd = hourWindowStart(now) + HOUR_MS;
  const [code, waitMs, count] = await withScript(client).acquireSendSlot(
    windowKey(params.senderId, now),
    lastSendKey(params.senderId),
    params.limit,
    now,
    windowEnd,
    params.minSpacingMs ?? env.MIN_DELAY_BETWEEN_EMAILS_MS,
    COUNTER_TTL_S,
  );
  if (code === 1) return { allowed: true, usedThisWindow: count };
  if (code === 0) {
    return { allowed: false, reason: 'HOURLY_LIMIT', retryAfterMs: waitMs, usedThisWindow: count, windowEndsAt: windowEnd };
  }
  return { allowed: false, reason: 'MIN_SPACING', retryAfterMs: waitMs, usedThisWindow: count };
}

/**
 * Current-window usage per sender, read from the exact keys the limiter
 * increments — the dashboard's quota meter is the limiter's own state, not a
 * recomputed estimate.
 */
export async function getCurrentWindowUsage(senderIds: string[], client: Redis = defaultRedis) {
  const usage = new Map<string, number>();
  if (senderIds.length === 0) return usage;
  const now = Date.now();
  const values = await client.mget(senderIds.map((id) => windowKey(id, now)));
  senderIds.forEach((id, i) => usage.set(id, Number(values[i] ?? 0)));
  return usage;
}
