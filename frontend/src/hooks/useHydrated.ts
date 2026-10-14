'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False during server render and the hydration pass, true afterwards. Use it
 * for client-only data (a query that may already be cached) so the first
 * client render matches the server HTML.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
