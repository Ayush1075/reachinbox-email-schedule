'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, Suspense, useEffect } from 'react';
import { useMe } from '@/hooks/useAuth';
import { ApiError } from '@/lib/api';
import { SlackRedirectNotice } from './SlackRedirectNotice';

const isUnauthorized = (err: unknown) => err instanceof ApiError && err.status === 401;

/**
 * Guards every /dashboard route. Pages render while the session check is in
 * flight (their queries run in parallel with it); a missing or expired
 * session sends the visitor back to the login page.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const me = useMe();
  const router = useRouter();

  useEffect(() => {
    if (isUnauthorized(me.error)) router.replace('/');
  }, [me.error, router]);

  if (me.error && !isUnauthorized(me.error)) throw me.error;

  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium shadow-sm focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      {children}
      <Suspense fallback={null}>
        <SlackRedirectNotice />
      </Suspense>
    </>
  );
}
