'use client';

import { AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

/** Catches errors from the dashboard shell itself (route segments have their own boundary). */
export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="size-5" aria-hidden />
        </div>
        <h1 className="text-base font-semibold">Something went wrong</h1>
        <p className="mt-1 text-sm text-muted-foreground">{error.message || 'An unexpected error occurred.'}</p>
        <Button className="mt-6" onClick={retry}>
          Try again
        </Button>
      </div>
    </main>
  );
}
