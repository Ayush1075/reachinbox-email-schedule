'use client';

import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useHydrated } from '@/hooks/useHydrated';

/**
 * Renders children only after hydration. Dashboard pages are driven entirely
 * by client queries, and a query already cached when a streamed subtree
 * hydrates would otherwise render different markup than the server sent.
 */
export function ClientOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const hydrated = useHydrated();
  return hydrated ? children : (fallback ?? <PageSkeleton />);
}

export function PageSkeleton() {
  return (
    <div className="space-y-4 p-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-14" />
      <Skeleton className="h-14" />
      <Skeleton className="h-14" />
    </div>
  );
}
