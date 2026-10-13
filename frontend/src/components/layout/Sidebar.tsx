'use client';

import { Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useMailboxCounts } from '@/hooks/useEmails';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AccountCard } from './AccountMenu';
import { isActive, navSections } from './nav';
import { OnbLogo } from './OnbLogo';

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const counts = useMailboxCounts();

  return (
    <div className="flex h-full flex-col px-2 pt-[19px] pb-4">
      <Link
        href="/dashboard/scheduled"
        onClick={onNavigate}
        className="ml-[11px] w-fit rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="ONB, go to scheduled emails"
      >
        <OnbLogo />
      </Link>

      <div className="mt-[11px]">
        <AccountCard />
      </div>

      <Button
        asChild
        variant="outline"
        className="mt-2.5 h-[34px] w-full rounded-full border-primary bg-background text-sm font-normal text-primary shadow-none hover:bg-primary-soft hover:text-primary dark:border-primary dark:bg-background"
      >
        <Link href="/dashboard/compose" onClick={onNavigate}>
          Compose
        </Link>
      </Button>

      <nav aria-label="Main" className="mt-6 flex flex-col gap-5">
        {navSections.map((section) => (
          <div key={section.title}>
            <p className="mb-0.5 px-4 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{section.title}</p>
            <ul>
              {section.items.map(({ href, label, icon: Icon, count }) => {
                const active = isActive(pathname, href);
                const total = count ? counts[count] : undefined;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex h-9 items-center gap-2.5 rounded-[10px] px-4 text-sm transition-colors duration-150 ease-out outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                        active ? 'bg-primary-soft font-semibold text-foreground' : 'text-foreground hover:bg-field',
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      <span className="flex-1">{label}</span>
                      {total !== undefined && (
                        <span className="text-[13px] font-normal text-muted-foreground tabular-nums" aria-label={`${total} emails`}>
                          {formatNumber(total)}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

/** Fixed sidebar from lg up; below that it lives in a sheet opened by MobileNavButton. */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-svh w-[252px] shrink-0 overflow-y-auto lg:block">
      <SidebarContent />
    </aside>
  );
}

export function MobileNavButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon-sm" className={cn('lg:hidden', className)} aria-label="Open navigation" onClick={() => setOpen(true)}>
        <Menu aria-hidden />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[268px] gap-0 p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Move between mailbox sections</SheetDescription>
          <SidebarContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
