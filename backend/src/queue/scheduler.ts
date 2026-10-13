import { HOUR_MS, hourWindowStart } from '../lib/time';

/**
 * Hour-window planner.
 *
 * Decides *when* each email of a campaign should fire, before anything is
 * enqueued, so that the plan already respects every sender's hourly cap.
 * The runtime Redis limiter (services/rateLimiter.ts) then acts as a safety
 * net for things the planner cannot see — e.g. two campaigns created at the
 * same instant competing for one sender — rather than as the primary
 * mechanism. Discovering the limit only at send time would mean waking up
 * hundreds of jobs at the top of every hour just to defer them again.
 *
 * Rules, per recipient k (in CSV order):
 *   1. sender       = senders[k mod S]                       (round-robin)
 *   2. earliest     = startAt + k × delayBetweenMs
 *   3. t            = max(earliest, sender's cursor)         (per-sender order + min spacing)
 *   4. while the sender's UTC hour window containing t is full → t = next window start
 *   5. book the slot; cursor = t + max(minSpacingMs, delayBetweenMs × S)
 *
 * Step 5 keeps the requested pacing after an overflow: emails pushed into the
 * next window keep their delayBetweenMs rhythm instead of bunching up.
 *
 * Windows are fixed UTC clock hours — the same windows the Redis limiter
 * keys on — so planner and limiter agree on what "this hour" means.
 */

export type PlannerSender = {
  id: string;
  /** Effective per-hour cap for this sender in this campaign. */
  hourlyLimit: number;
};

export type PlanInput = {
  startAt: Date;
  delayBetweenMs: number;
  recipientCount: number;
  senders: PlannerSender[];
  minSpacingMs: number;
  /**
   * Emails already committed for these senders, by window: senderId → (windowStartMs → count).
   * Lets a new campaign fill around existing ones instead of overbooking.
   */
  existingLoad?: Map<string, Map<number, number>>;
};

export type PlannedSlot = { sequenceIndex: number; senderId: string; scheduledAt: Date };

export type Plan = {
  slots: PlannedSlot[];
  /** Fire time of the last email. */
  endsAt: Date;
  /** Number of emails the cap pushed into a later hour window. */
  deferredByCap: number;
};

export function planSchedule(input: PlanInput): Plan {
  const { startAt, delayBetweenMs, recipientCount, senders, minSpacingMs } = input;
  if (senders.length === 0) throw new Error('planSchedule: at least one sender is required');
  for (const s of senders) {
    if (!Number.isInteger(s.hourlyLimit) || s.hourlyLimit < 1) {
      throw new Error(`planSchedule: sender ${s.id} has invalid hourlyLimit ${s.hourlyLimit}`);
    }
  }

  // Copy so the caller's map is not mutated.
  const load = new Map<string, Map<number, number>>();
  for (const s of senders) load.set(s.id, new Map(input.existingLoad?.get(s.id) ?? []));
  const cursor = new Map<string, number>();
  const perSenderGap = Math.max(minSpacingMs, delayBetweenMs * senders.length);

  const slots: PlannedSlot[] = new Array(recipientCount);
  const start = startAt.getTime();
  let endsAt = start;
  let deferredByCap = 0;

  for (let k = 0; k < recipientCount; k++) {
    const sender = senders[k % senders.length]!;
    const windows = load.get(sender.id)!;

    const earliest = start + k * delayBetweenMs;
    let t = Math.max(earliest, cursor.get(sender.id) ?? earliest);
    let window = hourWindowStart(t);
    let pushed = false;
    while ((windows.get(window) ?? 0) >= sender.hourlyLimit) {
      window += HOUR_MS;
      t = window;
      pushed = true;
    }
    if (pushed) deferredByCap++;

    windows.set(window, (windows.get(window) ?? 0) + 1);
    cursor.set(sender.id, t + perSenderGap);
    slots[k] = { sequenceIndex: k, senderId: sender.id, scheduledAt: new Date(t) };
    if (t > endsAt) endsAt = t;
  }

  return { slots, endsAt: new Date(endsAt), deferredByCap };
}
