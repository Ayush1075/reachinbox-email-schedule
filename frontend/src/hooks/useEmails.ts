'use client';

import {
  type InfiniteData,
  keepPreviousData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys, type SearchQuery } from '@/lib/query-keys';
import type {
  Email,
  EmailDetail,
  EmailListKind,
  EmailListParams,
  MailboxFilters,
  Paginated,
  RecentEmail,
  SearchResult,
  Throughput,
} from '@/types/api';

/** Live polling cadence. TanStack pauses interval refetches while the tab is hidden. */
export const POLL_MS = 5_000;
export const MAILBOX_PAGE_SIZE = 50;

function fetchList(kind: EmailListKind, params: EmailListParams, signal: AbortSignal) {
  return api<Paginated<Email>>(`/api/emails/${kind}`, {
    query: {
      page: params.page,
      limit: params.limit,
      status: params.status.join(','),
      sort: params.sort?.field,
      order: params.sort?.order,
      starred: params.starred ? 'true' : undefined,
      archived: params.archived ? 'true' : undefined,
    },
    signal,
  });
}

function fetchSearch(query: SearchQuery, signal: AbortSignal) {
  return api<SearchResult>('/api/search', { query: { ...query, status: query.status.join(',') }, signal });
}

function listQuery(kind: EmailListKind, params: EmailListParams) {
  return {
    queryKey: queryKeys.emails.list(kind, params),
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchList(kind, params, signal),
    refetchInterval: POLL_MS,
    placeholderData: keepPreviousData,
  };
}

export function useScheduledEmails(params: EmailListParams) {
  return useQuery(listQuery('scheduled', params));
}

export function useSentEmails(params: EmailListParams) {
  return useQuery(listQuery('sent', params));
}

/** Totals for the sidebar badges; they match what each list shows (archived/deleted excluded). */
export function useMailboxCounts() {
  const params = { page: 1, limit: 1, status: [] };
  const scheduled = useScheduledEmails(params);
  const sent = useSentEmails(params);
  return { scheduled: scheduled.data?.total, sent: sent.data?.total };
}

export const MAILBOX_STATUSES = {
  scheduled: ['SCHEDULED', 'QUEUED', 'PROCESSING', 'RATE_LIMITED'],
  sent: ['SENT', 'FAILED'],
} as const satisfies Record<EmailListKind, readonly Email['status'][]>;

/**
 * One mailbox (Scheduled or Sent), loaded 50 rows at a time. With search
 * text it switches to Elasticsearch (Postgres fallback) scoped to the same
 * statuses. Polls so rows move from Scheduled to Sent on their own.
 */
export function useMailbox(kind: EmailListKind, filters: MailboxFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.emails.mailbox(kind, filters),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => {
      const status = filters.status.length > 0 ? filters.status : [...MAILBOX_STATUSES[kind]];
      return filters.q
        ? fetchSearch({ q: filters.q, status, page: pageParam, limit: MAILBOX_PAGE_SIZE }, signal)
        : fetchList(kind, { page: pageParam, limit: MAILBOX_PAGE_SIZE, status, starred: filters.starred, archived: filters.archived }, signal);
    },
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
    refetchInterval: POLL_MS,
    placeholderData: keepPreviousData,
  });
}

export function useEmailDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.emails.detail(id),
    queryFn: ({ signal }) => api<EmailDetail>(`/api/emails/${id}`, { signal }),
    refetchInterval: POLL_MS,
  });
}

export function useThroughput() {
  return useQuery({
    queryKey: queryKeys.emails.throughput,
    queryFn: ({ signal }) => api<Throughput>('/api/emails/throughput', { signal }),
    refetchInterval: POLL_MS,
  });
}

export function useRecentActivity(limit = 8) {
  return useQuery({
    queryKey: queryKeys.emails.recent,
    queryFn: ({ signal }) => api<RecentEmail[]>('/api/emails/recent', { query: { limit }, signal }),
    refetchInterval: POLL_MS,
  });
}

type Page = Paginated<Email>;
type CachedList = Page | InfiniteData<Page> | EmailDetail | RecentEmail[];
type Snapshot = [readonly unknown[], unknown][];

/**
 * Apply an optimistic change to one email everywhere it is cached: paged
 * lists, infinite mailboxes, the reading view and the activity feed.
 * `update` returns the new row, or null to remove it from lists.
 */
async function patchEmailEverywhere(qc: QueryClient, id: string, update: (e: Email) => Email | null): Promise<Snapshot> {
  await qc.cancelQueries({ queryKey: queryKeys.emails.all });
  const snapshot = qc.getQueriesData<CachedList>({ queryKey: queryKeys.emails.all });
  const patchPage = (page: Page): Page => {
    if (!page.items.some((e) => e.id === id)) return page;
    const items = page.items.flatMap((e) => (e.id === id ? (update(e) ?? []) : [e]));
    return { ...page, items, total: page.total - (page.items.length - items.length) };
  };
  qc.setQueriesData<CachedList>({ queryKey: queryKeys.emails.all }, (old) => {
    if (!old) return old;
    if (Array.isArray(old)) {
      return old.flatMap((e) => {
        if (e.id !== id) return [e];
        const next = update(e);
        return next ? [{ ...e, ...next }] : [];
      });
    }
    if ('pages' in old) return { ...old, pages: old.pages.map(patchPage) };
    if ('items' in old) return patchPage(old);
    if (old.id === id) {
      const next = update(old);
      return next ? { ...old, ...next } : old;
    }
    return old;
  });
  return snapshot;
}

function useEmailMutation<TVars extends { id: string }>(
  mutationFn: (vars: TVars) => Promise<unknown>,
  optimistic: (vars: TVars) => (e: Email) => Email | null,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onMutate: async (vars: TVars) => ({ snapshot: await patchEmailEverywhere(qc, vars.id, optimistic(vars)) }),
    onError: (_err, _vars, context) => {
      for (const [key, data] of context?.snapshot ?? []) qc.setQueryData(key, data);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.emails.all });
      void qc.invalidateQueries({ queryKey: queryKeys.stats });
      void qc.invalidateQueries({ queryKey: queryKeys.senders.quotas });
    },
  });
}

export function useStarEmail() {
  return useEmailMutation(
    ({ id, starred }: { id: string; starred: boolean }) => api(`/api/emails/${id}`, { method: 'PATCH', body: { starred } }),
    ({ starred }) =>
      (e) => ({ ...e, starred }),
  );
}

/** Archiving hides the email from its mailbox (it reappears under the "Archived" filter). */
export function useArchiveEmail() {
  return useEmailMutation(
    ({ id, archived }: { id: string; archived: boolean }) => api(`/api/emails/${id}`, { method: 'PATCH', body: { archived } }),
    () => () => null,
  );
}

/** Cancels a pending email first, so a deleted email can never go out. */
export function useDeleteEmail() {
  return useEmailMutation(
    ({ id }: { id: string }) => api(`/api/emails/${id}`, { method: 'DELETE' }),
    () => () => null,
  );
}

/** Cancel a scheduled email but keep it (as CANCELLED) in the record. */
export function useCancelEmail() {
  return useEmailMutation(
    ({ id }: { id: string }) => api<{ cancelled: number }>(`/api/emails/${id}/cancel`, { method: 'POST' }),
    () => () => null,
  );
}
