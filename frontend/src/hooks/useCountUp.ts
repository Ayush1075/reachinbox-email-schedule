'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Animates from 0 to `target` the first time a value arrives, then tracks
 * later updates instantly (polling shouldn't re-animate every 5s).
 */
export function useCountUp(target: number | undefined, durationMs = 700): number | undefined {
  const [value, setValue] = useState<number | undefined>(undefined);
  const animated = useRef(false);

  useEffect(() => {
    if (target === undefined) return;
    if (animated.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      animated.current = true;
      setValue(target);
      return;
    }
    animated.current = true;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}
