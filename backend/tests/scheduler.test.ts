import { describe, expect, it } from 'vitest';
import { HOUR_MS, hourWindowStart } from '../src/lib/time';
import { planSchedule } from '../src/queue/scheduler';
import { resolveEffectiveLimit } from '../src/services/limits';

const T0 = new Date('2026-10-13T10:00:00.000Z');

function countByWindow(slots: { senderId: string; scheduledAt: Date }[]) {
  const counts = new Map<string, number>();
  for (const s of slots) {
    const key = `${s.senderId}@${hourWindowStart(s.scheduledAt.getTime())}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

describe('planSchedule (hour-window planner)', () => {
  it('spaces emails by delayBetweenMs when well under the cap', () => {
    const plan = planSchedule({
      startAt: T0,
      delayBetweenMs: 5_000,
      recipientCount: 4,
      senders: [{ id: 'a', hourlyLimit: 200 }],
      minSpacingMs: 0,
    });
    expect(plan.slots.map((s) => s.scheduledAt.getTime() - T0.getTime())).toEqual([0, 5_000, 10_000, 15_000]);
    expect(plan.deferredByCap).toBe(0);
  });

  it('assigns senders round-robin', () => {
    const plan = planSchedule({
      startAt: T0,
      delayBetweenMs: 1_000,
      recipientCount: 5,
      senders: [
        { id: 'a', hourlyLimit: 10 },
        { id: 'b', hourlyLimit: 10 },
      ],
      minSpacingMs: 0,
    });
    expect(plan.slots.map((s) => s.senderId)).toEqual(['a', 'b', 'a', 'b', 'a']);
  });

  it('never books more than hourlyLimit into one sender window', () => {
    const plan = planSchedule({
      startAt: T0,
      delayBetweenMs: 0,
      recipientCount: 1000,
      senders: [
        { id: 'a', hourlyLimit: 200 },
        { id: 'b', hourlyLimit: 200 },
      ],
      minSpacingMs: 2_000,
    });
    for (const count of countByWindow(plan.slots).values()) expect(count).toBeLessThanOrEqual(200);
    // 1000 emails / (2 senders × 200/h) → windows 10:00, 11:00, 12:00 (last one half full)
    expect(hourWindowStart(plan.endsAt.getTime())).toBe(T0.getTime() + 2 * HOUR_MS);
    expect(plan.deferredByCap).toBeGreaterThan(0);
  });

  it('pushes overflow to the start of the next window and keeps per-sender order', () => {
    const plan = planSchedule({
      startAt: T0,
      delayBetweenMs: 1_000,
      recipientCount: 5,
      senders: [{ id: 'a', hourlyLimit: 2 }],
      minSpacingMs: 0,
    });
    const offsets = plan.slots.map((s) => s.scheduledAt.getTime() - T0.getTime());
    expect(offsets).toEqual([0, 1_000, HOUR_MS, HOUR_MS + 1_000, 2 * HOUR_MS]);
    for (let i = 1; i < offsets.length; i++) expect(offsets[i]!).toBeGreaterThan(offsets[i - 1]!);
  });

  it('enforces minimum spacing per sender even when delayBetweenMs is 0', () => {
    const plan = planSchedule({
      startAt: T0,
      delayBetweenMs: 0,
      recipientCount: 3,
      senders: [{ id: 'a', hourlyLimit: 100 }],
      minSpacingMs: 2_000,
    });
    expect(plan.slots.map((s) => s.scheduledAt.getTime() - T0.getTime())).toEqual([0, 2_000, 4_000]);
  });

  it('fills around load already committed by other campaigns', () => {
    const existingLoad = new Map([['a', new Map([[T0.getTime(), 9]])]]);
    const plan = planSchedule({
      startAt: T0,
      delayBetweenMs: 0,
      recipientCount: 3,
      senders: [{ id: 'a', hourlyLimit: 10 }],
      minSpacingMs: 0,
      existingLoad,
    });
    expect(plan.slots.map((s) => hourWindowStart(s.scheduledAt.getTime()) - T0.getTime())).toEqual([0, HOUR_MS, HOUR_MS]);
    // Caller's map is not mutated.
    expect(existingLoad.get('a')!.get(T0.getTime())).toBe(9);
  });

  it('starting mid-hour only uses the remaining capacity of that window', () => {
    const start = new Date(T0.getTime() + 59 * 60_000); // 10:59
    const plan = planSchedule({
      startAt: start,
      delayBetweenMs: 30_000,
      recipientCount: 4,
      senders: [{ id: 'a', hourlyLimit: 100 }],
      minSpacingMs: 0,
    });
    const windows = plan.slots.map((s) => hourWindowStart(s.scheduledAt.getTime()));
    expect(windows).toEqual([T0.getTime(), T0.getTime(), T0.getTime() + HOUR_MS, T0.getTime() + HOUR_MS]);
  });

  it('rejects an empty sender list and invalid limits', () => {
    const base = { startAt: T0, delayBetweenMs: 0, recipientCount: 1, minSpacingMs: 0 };
    expect(() => planSchedule({ ...base, senders: [] })).toThrow();
    expect(() => planSchedule({ ...base, senders: [{ id: 'a', hourlyLimit: 0 }] })).toThrow();
  });
});

describe('resolveEffectiveLimit (cap precedence)', () => {
  const defaults = { perSender: undefined, global: 200 };

  it('falls back sender → per-sender env → global env', () => {
    expect(resolveEffectiveLimit(50, null, defaults)).toBe(50);
    expect(resolveEffectiveLimit(null, null, { perSender: 120, global: 200 })).toBe(120);
    expect(resolveEffectiveLimit(null, null, defaults)).toBe(200);
  });

  it('lets a campaign tighten but never raise the sender cap', () => {
    expect(resolveEffectiveLimit(100, 30, defaults)).toBe(30);
    expect(resolveEffectiveLimit(100, 500, defaults)).toBe(100);
  });
});
