'use client';

import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

/** Whether the tab is visible — TanStack Query pauses interval polling while it isn't. */
export function useDocumentVisible(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.visibilityState === 'visible',
    () => true,
  );
}
