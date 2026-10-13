export const HOUR_MS = 60 * 60 * 1000;

/** Start (ms) of the UTC clock hour containing `ms`. */
export function hourWindowStart(ms: number): number {
  return Math.floor(ms / HOUR_MS) * HOUR_MS;
}

/** UTC hour window id, e.g. `2026-10-13T17`. Used in Redis keys. */
export function hourWindowId(ms: number): string {
  return new Date(hourWindowStart(ms)).toISOString().slice(0, 13);
}
