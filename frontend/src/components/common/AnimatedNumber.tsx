'use client';

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { formatNumber } from '@/lib/format';

/** Counts up from 0 the first time it appears (0.4s); later updates snap so polling doesn't re-animate. */
export function AnimatedNumber({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const motionValue = useMotionValue(0);
  const text = useTransform(motionValue, (v) => formatNumber(Math.round(v)));
  const first = useRef(true);

  useEffect(() => {
    const duration = first.current && !reduce ? 0.4 : 0;
    first.current = false;
    const controls = animate(motionValue, value, { duration, ease: 'easeOut' });
    return () => controls.stop();
  }, [value, reduce, motionValue]);

  return <motion.span>{text}</motion.span>;
}
