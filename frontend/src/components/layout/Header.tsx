import { ExternalLink } from 'lucide-react';
import { API_URL } from '@/lib/api';
import type { User } from '@/types/api';
import { SlackPill } from './SlackPill';
import { UserMenu } from './UserMenu';

export function Header({ user }: { user: User }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-[6px] bg-accent font-mono text-[13px] font-semibold text-white">R</div>
          <span className="text-sm font-semibold">ReachInbox Scheduler</span>
        </div>
        <nav className="flex items-center gap-2 sm:gap-3">
          <a
            href={`${API_URL}/admin/queues`}
            target="_blank"
            rel="noreferrer"
            className="hidden h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-[13px] font-medium text-fg-muted transition-colors duration-150 hover:bg-bg hover:text-fg sm:inline-flex"
          >
            Queue dashboard
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
          <SlackPill />
          <div className="mx-1 h-5 w-px bg-border" aria-hidden />
          <UserMenu user={user} />
        </nav>
      </div>
    </header>
  );
}
