'use client';

import { useEffect, useState } from 'react';

/** Current time, refreshed periodically so relative labels ("in 12m") stay accurate between polls. */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
