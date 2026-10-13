'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, Suspense, useEffect } from 'react';
import { ComposeProvider } from '@/components/email/ComposeProvider';
import { useMe } from '@/hooks/useAuth';
import { useStoredFlag } from '@/hooks/useStoredFlag';
import { ApiError } from '@/lib/api';
import { Sidebar } from './Sidebar';
import { SlackRedirectNotice } from './SlackRedirectNotice';
import { Topbar } from './Topbar';

const isUnauthorized = (err: unknown) => err instanceof ApiError && err.status === 401;

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const [collapsed, setCollapsed] = useStoredFlag('sidebar-collapsed');

  // No session (or it expired) → back to sign-in.
  useEffect(() => {
    if (isUnauthorized(me.error)) router.replace('/');
  }, [me.error, router]);

  if (me.error && !isUnauthorized(me.error)) throw me.error;

  // Pages render while the session check is in flight (their queries run in
  // parallel with it); only the account menu waits for the user.
  return (
    <ComposeProvider>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium shadow-sm focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <div className="flex min-h-svh">
        <Sidebar collapsed={collapsed} onToggleCollapsed={() => setCollapsed(!collapsed)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar user={me.data} />
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 outline-none sm:px-6 lg:py-8">
            {children}
          </main>
        </div>
      </div>
      <Suspense fallback={null}>
        <SlackRedirectNotice />
      </Suspense>
    </ComposeProvider>
  );
}
