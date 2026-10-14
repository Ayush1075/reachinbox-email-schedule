'use client';

import { ListFilter, Inbox, RefreshCw, Search, Send, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { MobileNavButton } from '@/components/layout/Sidebar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDebounce } from '@/hooks/useDebounce';
import { useMailbox } from '@/hooks/useEmails';
import { errorMessage } from '@/lib/api';
import { pluralize } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { EmailListKind, EmailStatus, MailboxFilters } from '@/types/api';
import { EmailRow } from './EmailRow';

const STATUS_FILTERS: Record<EmailListKind, { label: string; statuses: EmailStatus[] }[]> = {
  scheduled: [
    { label: 'Scheduled', statuses: ['SCHEDULED', 'QUEUED'] },
    { label: 'Sending', statuses: ['PROCESSING'] },
    { label: 'Deferred by rate limit', statuses: ['RATE_LIMITED'] },
  ],
  sent: [
    { label: 'Sent', statuses: ['SENT'] },
    { label: 'Failed', statuses: ['FAILED'] },
  ],
};

const EMPTY = { q: '', status: [], starred: false, archived: false } satisfies MailboxFilters;

function RowSkeleton() {
  return (
    <li className="flex h-14 items-center gap-4 border-b px-6" aria-hidden>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-6 w-28 rounded-full" />
      <Skeleton className="h-4 flex-1" />
    </li>
  );
}

export function MailboxView({ kind }: { kind: EmailListKind }) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Omit<MailboxFilters, 'q'>>(EMPTY);
  const q = useDebounce(search.trim(), 300);
  const mailbox = useMailbox(kind, { ...filters, q });
  const [manualRefresh, setManualRefresh] = useState(false);
  const sentinel = useRef<HTMLLIElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl+K jumps to search from anywhere in the mailbox.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = mailbox;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
    }, { rootMargin: '400px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const emails = mailbox.data?.pages.flatMap((p) => p.items) ?? [];
  const total = mailbox.data?.pages[0]?.total;
  const filtered = filters.status.length > 0 || filters.starred || filters.archived || q !== '';
  const toggleStatus = (statuses: EmailStatus[], on: boolean) =>
    setFilters((f) => ({ ...f, status: on ? [...f.status, ...statuses] : f.status.filter((s) => !statuses.includes(s)) }));

  const refresh = async () => {
    setManualRefresh(true);
    await mailbox.refetch();
    setManualRefresh(false);
  };

  return (
    <div className="flex min-h-svh flex-col">
      <div className="sticky top-0 z-20 flex items-center gap-2.5 bg-background/95 px-4 pt-5 pb-4 backdrop-blur sm:px-6">
        <MobileNavButton />
        <div className="relative w-full max-w-[673px]">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            ref={searchInput}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            aria-label={`Search ${kind} emails`}
            className="h-[38px] rounded-full border-transparent bg-field pr-9 pl-10 text-sm shadow-none focus-visible:border-ring md:text-sm dark:bg-field [&::-webkit-search-cancel-button]:hidden"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Filter" className={cn('relative text-muted-foreground', filtered && q === '' && 'text-primary')}>
                  <ListFilter aria-hidden />
                  {filtered && q === '' && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" aria-hidden />}
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Filter</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            {STATUS_FILTERS[kind].map(({ label, statuses }) => (
              <DropdownMenuCheckboxItem
                key={label}
                checked={statuses.every((s) => filters.status.includes(s))}
                onCheckedChange={(on) => toggleStatus(statuses, on)}
                onSelect={(e) => e.preventDefault()}
              >
                {label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={filters.starred}
              onCheckedChange={(on) => setFilters((f) => ({ ...f, starred: on }))}
              onSelect={(e) => e.preventDefault()}
            >
              Starred only
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={filters.archived}
              onCheckedChange={(on) => setFilters((f) => ({ ...f, archived: on }))}
              onSelect={(e) => e.preventDefault()}
            >
              Archived
            </DropdownMenuCheckboxItem>
            {filtered && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setFilters(EMPTY)}>Clear filters</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Refresh" onClick={() => void refresh()} className="text-muted-foreground">
              <RefreshCw className={cn(manualRefresh && 'animate-spin')} aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh. The list also updates every 5 seconds.</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex-1 pr-0 sm:pr-4 sm:pl-6">
        <p className="sr-only" aria-live="polite">
          {total !== undefined && pluralize(total, q ? 'search result' : `${kind} email`)}
        </p>
        {q && filters.archived && <p className="px-6 pb-2 text-xs text-muted-foreground">Search covers the main mailbox; archived emails are not searched.</p>}

        {mailbox.isError ? (
          <Alert variant="destructive" className="mx-6 my-4 w-auto">
            <AlertDescription className="flex items-center justify-between gap-4">
              {errorMessage(mailbox.error)}
              <Button size="sm" variant="outline" onClick={() => void mailbox.refetch()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : mailbox.isPending ? (
          <ul aria-label="Loading emails">
            {Array.from({ length: 8 }, (_, i) => (
              <RowSkeleton key={i} />
            ))}
          </ul>
        ) : emails.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={Search}
              title="No emails match"
              description="Try a different search, or clear the filters."
              action={
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => {
                    setSearch('');
                    setFilters(EMPTY);
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : kind === 'scheduled' ? (
            <EmptyState
              icon={Inbox}
              title="Nothing scheduled"
              description="Compose an email and pick a send time. It waits here until it goes out."
              action={
                <Button asChild className="rounded-full px-5">
                  <Link href="/dashboard/compose">Compose your first email</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState icon={Send} title="Nothing sent yet" description="Sent and failed emails land here, each with a link to the real message in Ethereal." />
          )
        ) : (
          <ul aria-label={`${kind === 'scheduled' ? 'Scheduled' : 'Sent'} emails`}>
            {emails.map((email) => (
              <EmailRow key={email.id} email={email} />
            ))}
            {hasNextPage && (
              <li ref={sentinel} aria-hidden>
                {isFetchingNextPage && <RowSkeleton />}
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
