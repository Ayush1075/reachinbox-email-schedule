'use client';

import { PenSquare } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { StatCards } from '@/components/dashboard/StatCards';
import { ComposeModal } from '@/components/email/ComposeModal';
import { ScheduledTable, SentTable } from '@/components/email/EmailTables';
import { SearchBar, SearchResults, type SearchState } from '@/components/email/SearchBar';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/legacy-ui/Button';
import { Tabs } from '@/components/legacy-ui/Tabs';
import { useMe } from '@/hooks/useAuth';
import { useScheduledEmails, useSentEmails } from '@/hooks/useEmails';
import { ApiError } from '@/lib/api';
import { DashboardSkeleton } from './DashboardSkeleton';

type Tab = 'scheduled' | 'sent';

const slackMessages: Record<string, (reason: string | null) => void> = {
  connected: () => toast.success('Slack connected — rate-limit alerts will post to your channel'),
  error: (reason) => toast.error(`Slack connection failed${reason ? `: ${reason}` : ''}`),
  not_configured: () => toast.error('Slack is not configured on the server'),
};

export function Dashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const me = useMe();
  const [composeOpen, setComposeOpen] = useState(false);
  const [search, setSearch] = useState<SearchState>({ q: '', status: '' });

  // Tab lives in the URL so refresh/back preserve it.
  const tab: Tab = params.get('tab') === 'sent' ? 'sent' : 'scheduled';
  const setTab = useCallback(
    (t: Tab) => {
      const next = new URLSearchParams(params);
      if (t === 'scheduled') next.delete('tab');
      else next.set('tab', t);
      router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
    },
    [params, pathname, router],
  );

  // One-shot toast after the Slack OAuth redirect, then clean the URL.
  useEffect(() => {
    const slack = params.get('slack');
    if (!slack) return;
    slackMessages[slack]?.(params.get('reason'));
    const next = new URLSearchParams(params);
    next.delete('slack');
    next.delete('reason');
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
  }, [params, pathname, router]);

  // Not signed in (or session expired) → login.
  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) router.replace('/');
  }, [me.error, router]);

  // Tab counts (page 1 queries are shared with the tables, so no extra requests).
  const scheduledCount = useScheduledEmails({ page: 1, limit: 20, status: [] }).data?.total;
  const sentCount = useSentEmails({ page: 1, limit: 20, status: [] }).data?.total;

  if (!me.data) {
    if (me.error && !(me.error instanceof ApiError && me.error.status === 401)) throw me.error;
    return <DashboardSkeleton />;
  }

  const searching = search.q.trim().length > 0 || search.status !== '';

  return (
    <>
      <Header user={me.data} />
      <main className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <p className="mt-1 text-sm text-fg-muted">Scheduled campaigns update live every few seconds.</p>
          </div>
          <Button onClick={() => setComposeOpen(true)} className="self-start sm:self-auto">
            <PenSquare className="size-4" aria-hidden />
            Compose New Email
          </Button>
        </div>

        <StatCards />

        <section className="mt-8 overflow-hidden rounded-[8px] border border-border bg-surface shadow-[var(--shadow-card)]">
          <div className="flex flex-col gap-3 px-4 pt-3 lg:flex-row lg:items-end lg:justify-between">
            {searching ? (
              <h2 className="flex h-10 items-center text-base font-semibold">Search results</h2>
            ) : (
              <Tabs
                idPrefix="emails"
                value={tab}
                onChange={setTab}
                items={[
                  { key: 'scheduled', label: 'Scheduled', count: scheduledCount },
                  { key: 'sent', label: 'Sent', count: sentCount },
                ]}
              />
            )}
            <div className="pb-3">
              <SearchBar value={search} onChange={setSearch} />
            </div>
          </div>
          <div id="emails-panel" role="tabpanel" aria-labelledby={searching ? undefined : `emails-tab-${tab}`} className="border-t border-border">
            {searching ? (
              <SearchResults search={search} />
            ) : tab === 'scheduled' ? (
              <ScheduledTable onCompose={() => setComposeOpen(true)} />
            ) : (
              <SentTable />
            )}
          </div>
        </section>
      </main>
      <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} />
    </>
  );
}
