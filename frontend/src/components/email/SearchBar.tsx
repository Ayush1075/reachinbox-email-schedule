'use client';

import { Search, X } from 'lucide-react';
import { useState } from 'react';
import { DataTable } from '@/components/legacy-ui/DataTable';
import { EmptyState } from '@/components/legacy-ui/EmptyState';
import { Input, Select } from '@/components/legacy-ui/Field';
import { Pagination } from '@/components/legacy-ui/Pagination';
import { useDebounce } from '@/hooks/useDebounce';
import { useEmailSearch } from '@/hooks/useEmails';

const PAGE_SIZE = 20;
import type { EmailStatus } from '@/types/api';
import { useSearchColumns } from './EmailTables';

const statuses: { value: EmailStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'QUEUED', label: 'Scheduled' },
  { value: 'RATE_LIMITED', label: 'Rate limited' },
  { value: 'SENT', label: 'Sent' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export type SearchState = { q: string; status: EmailStatus | '' };

export function SearchBar({ value, onChange }: { value: SearchState; onChange: (s: SearchState) => void }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1 sm:max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted" aria-hidden />
        <Input
          type="search"
          aria-label="Search emails by recipient, subject or body"
          placeholder="Search emails…"
          value={value.q}
          onChange={(e) => onChange({ ...value, q: e.target.value })}
          className="pr-8 pl-9"
        />
        {value.q && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onChange({ ...value, q: '' })}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-fg-muted hover:text-fg"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <Select
        aria-label="Filter by status"
        value={value.status}
        onChange={(e) => onChange({ ...value, status: e.target.value as EmailStatus | '' })}
        className="sm:w-44"
      >
        {statuses.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** Results from GET /api/search (Elasticsearch, or the Postgres fallback). */
export function SearchResults({ search }: { search: SearchState }) {
  const debouncedQ = useDebounce(search.q.trim(), 300);
  // Page resets to 1 whenever the query or filter changes.
  const queryKey = `${debouncedQ}|${search.status}`;
  const [paging, setPaging] = useState({ queryKey, page: 1 });
  const page = paging.queryKey === queryKey ? paging.page : 1;
  const setPage = (p: number) => setPaging({ queryKey, page: p });

  const { data, isPending } = useEmailSearch({ q: debouncedQ, status: search.status, page, limit: PAGE_SIZE });
  const columns = useSearchColumns();

  return (
    <>
      <div className="flex items-center justify-between border-b border-border px-4 py-2 text-[12px] text-fg-muted">
        <span>
          {data ? (
            <>
              <span className="font-mono tabular-nums">{data.total.toLocaleString()}</span> result{data.total === 1 ? '' : 's'}
            </>
          ) : (
            'Searching…'
          )}
        </span>
        {data && (
          <span title={data.source === 'postgres' ? 'Elasticsearch is unavailable; results come from Postgres' : undefined}>
            via {data.source === 'elasticsearch' ? 'Elasticsearch' : 'Postgres fallback'}
          </span>
        )}
      </div>
      <DataTable
        label="Search results"
        columns={columns}
        rows={data?.items}
        rowKey={(e) => e.id}
        isLoading={isPending}
        empty={<EmptyState icon={Search} title="No matches" description="Try a different recipient, subject or status." />}
      />
      {data && data.total > 0 && <Pagination page={page} limit={PAGE_SIZE} total={data.total} onPageChange={setPage} />}
    </>
  );
}
