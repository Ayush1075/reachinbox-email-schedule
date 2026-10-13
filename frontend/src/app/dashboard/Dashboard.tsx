'use client';

import { PenSquare } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { StatCards } from '@/components/dashboard/StatCards';
import { useCompose } from '@/components/email/ComposeProvider';
import { ScheduledTable, SentTable } from '@/components/email/EmailTables';
import { SearchBar, SearchResults, type SearchState } from '@/components/email/SearchBar';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/legacy-ui/Button';
import { Tabs } from '@/components/legacy-ui/Tabs';
import { useScheduledEmails, useSentEmails } from '@/hooks/useEmails';

type Tab = 'scheduled' | 'sent';

export function Dashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { openCompose } = useCompose();
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

  // Tab counts (page 1 queries are shared with the tables, so no extra requests).
  const scheduledCount = useScheduledEmails({ page: 1, limit: 20, status: [] }).data?.total;
  const sentCount = useSentEmails({ page: 1, limit: 20, status: [] }).data?.total;

  const searching = search.q.trim().length > 0 || search.status !== '';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Scheduled campaigns update live every few seconds."
        actions={
          <Button onClick={openCompose}>
            <PenSquare className="size-4" aria-hidden />
            Compose New Email
          </Button>
        }
      />

        <StatCards />

        <section className="overflow-hidden rounded-[8px] border border-border bg-surface shadow-[var(--shadow-card)]">
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
              <ScheduledTable onCompose={openCompose} />
            ) : (
              <SentTable />
            )}
          </div>
        </section>
    </div>
  );
}
