'use client';

import { useSyncExternalStore } from 'react';

const TICK_MS = 15_000;
const listeners = new Set<() => void>();
let now = 0;
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  timer ??= setInterval(() => {
    now = Date.now();
    listeners.forEach((l) => l());
  }, TICK_MS);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
      now = 0;
    }
  };
}

function getSnapshot() {
  if (now === 0) now = Date.now();
  return now;
}

/**
 * Shared clock that ticks every 15s so relative labels ("in 12m") stay
 * accurate between polls. Reads 0 during prerender, where no rows exist yet.
 */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
