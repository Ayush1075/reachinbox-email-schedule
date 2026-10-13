import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

/** Sidebar + content, for the mailbox lists and workspace pages. */
export function MailShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh bg-background">
      <Sidebar />
      <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
        {children}
      </main>
    </div>
  );
}
