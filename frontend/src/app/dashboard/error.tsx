'use client';

import { AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';

/** Route error boundary for the dashboard (Next 16: `retry` re-fetches and re-renders the segment). */
export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-[8px] border border-border bg-surface p-8 text-center">
        <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-[8px] bg-red-50 text-danger">
          <AlertTriangle className="size-5" aria-hidden />
        </div>
        <h1 className="text-base font-semibold">The dashboard couldn’t load</h1>
        <p className="mt-1 text-sm text-fg-muted">{error.message || 'An unexpected error occurred.'}</p>
        <Button className="mt-6" onClick={retry}>
          Try again
        </Button>
      </div>
    </main>
  );
}
