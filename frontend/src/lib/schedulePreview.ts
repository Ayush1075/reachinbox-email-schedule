/**
 * Client-side mirror of the backend hour-window planner
 * (backend/src/queue/scheduler.ts), used for the live "completes in ~X"
 * preview in the compose form. It ignores load already committed by other
 * campaigns, which only the server knows — the server plan can therefore
 * finish later than the preview, never earlier.
 */

const HOUR_MS = 3_600_000;
const windowStart = (ms: number) => Math.floor(ms / HOUR_MS) * HOUR_MS;

export type PreviewInput = {
  startAt: Date;
  recipients: number;
  delayBetweenMs: number;
  /** Effective per-sender hourly caps, in round-robin order. */
  senderLimits: number[];
  minSpacingMs: number;
};

export type Preview = { endsAt: Date; durationMs: number; deferredByCap: number; hourWindows: number };

export function previewSchedule({ startAt, recipients, delayBetweenMs, senderLimits, minSpacingMs }: PreviewInput): Preview | null {
  if (recipients === 0 || senderLimits.length === 0 || senderLimits.some((l) => !(l >= 1))) return null;

  const S = senderLimits.length;
  const gap = Math.max(minSpacingMs, delayBetweenMs * S);
  const start = startAt.getTime();
  const load = senderLimits.map(() => new Map<number, number>());
  const cursor: number[] = new Array(S).fill(-Infinity);
  const windows = new Set<number>();
  let end = start;
  let deferred = 0;

  for (let k = 0; k < recipients; k++) {
    const s = k % S;
    let t = Math.max(start + k * delayBetweenMs, cursor[s]!);
    let w = windowStart(t);
    let pushed = false;
    while ((load[s]!.get(w) ?? 0) >= senderLimits[s]!) {
      w += HOUR_MS;
      t = w;
      pushed = true;
    }
    if (pushed) deferred++;
    load[s]!.set(w, (load[s]!.get(w) ?? 0) + 1);
    cursor[s] = t + gap;
    windows.add(w);
    if (t > end) end = t;
  }
  return { endsAt: new Date(end), durationMs: end - start, deferredByCap: deferred, hourWindows: windows.size };
}
