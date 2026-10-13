'use client';

import { ExternalLink, Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { API_URL } from '@/lib/api';
import type { User } from '@/types/api';
import { currentNavItem } from './nav';
import { SidebarBody } from './Sidebar';
import { SlackStatusPill } from './SlackStatusPill';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

export const BULL_BOARD_URL = `${API_URL}/admin/queues`;

export function Topbar({ user, search }: { user: User | undefined; search?: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const page = currentNavItem(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur sm:px-6">
      <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
        <Menu aria-hidden />
      </Button>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 gap-0 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Move between dashboard sections</SheetDescription>
          <SidebarBody onNavigate={() => setMobileOpen(false)} />
          <div className="flex items-center gap-2 border-t p-3">
            <div className="min-w-0 flex-1">
              <SlackStatusPill />
            </div>
            <ThemeToggle />
          </div>
        </SheetContent>
      </Sheet>

      <nav aria-label="Breadcrumb" className="min-w-0 shrink-0 text-sm">
        <ol className="flex items-center gap-1.5">
          <li className="hidden text-muted-foreground sm:block">Dashboard</li>
          <li aria-hidden className="hidden text-muted-foreground/60 sm:block">
            /
          </li>
          <li aria-current="page" className="truncate font-medium">
            {page?.label ?? 'Not found'}
          </li>
        </ol>
      </nav>

      <div className="flex min-w-0 flex-1 justify-center">{search}</div>

      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
          <a href={BULL_BOARD_URL} target="_blank" rel="noreferrer">
            Queue Dashboard
            <ExternalLink className="text-muted-foreground" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </Button>
        {user ? <UserMenu user={user} /> : <Skeleton className="size-7 rounded-full" aria-label="Loading account" />}
      </div>
    </header>
  );
}
