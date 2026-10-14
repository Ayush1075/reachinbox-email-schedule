'use client';

import { AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

/** Error boundary for the dashboard area: recoverable, never a blank screen. */
export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="size-5" aria-hidden />
        </span>
        <h1 className="mt-4 text-base font-semibold">This page couldn&apos;t load</h1>
        <p className="mt-1 text-sm text-muted-foreground">{error.message || 'An unexpected error occurred.'}</p>
        <Button className="mt-6 rounded-full px-5" onClick={retry}>
          Try again
        </Button>
      </div>
    </main>
  );
}
