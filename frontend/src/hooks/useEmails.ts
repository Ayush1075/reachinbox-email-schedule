'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys, type SearchQuery } from '@/lib/query-keys';
import type { Email, EmailListKind, EmailListParams, Paginated, RecentEmail, SearchResult, Throughput } from '@/types/api';

/** Live polling cadence. TanStack pauses interval refetches while the tab is hidden. */
export const POLL_MS = 5_000;

function listQuery(kind: EmailListKind, params: EmailListParams) {
  return {
    queryKey: queryKeys.emails.list(kind, params),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      api<Paginated<Email>>(`/api/emails/${kind}`, {
        query: {
          page: params.page,
          limit: params.limit,
          status: params.status.join(','),
          sort: params.sort?.field,
          order: params.sort?.order,
        },
        signal,
      }),
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

export function useEmailSearch(query: SearchQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.emails.search(query),
    queryFn: ({ signal }) => api<SearchResult>('/api/search', { query, signal }),
    enabled,
    refetchInterval: POLL_MS,
    placeholderData: keepPreviousData,
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

type ListSnapshot = [readonly unknown[], Paginated<Email> | undefined][];

/** Cancel one scheduled email. The row disappears immediately and comes back if the API refuses. */
export function useCancelEmail() {
  const qc = useQueryClient();
  const scheduledPrefix = ['emails', 'list', 'scheduled'];
  return useMutation({
    mutationFn: (id: string) => api<{ cancelled: number }>(`/api/emails/${id}/cancel`, { method: 'POST' }),
    onMutate: async (id): Promise<{ snapshot: ListSnapshot }> => {
      await qc.cancelQueries({ queryKey: scheduledPrefix });
      const snapshot = qc.getQueriesData<Paginated<Email>>({ queryKey: scheduledPrefix });
      qc.setQueriesData<Paginated<Email>>({ queryKey: scheduledPrefix }, (old) =>
        old && old.items.some((e) => e.id === id)
          ? { ...old, items: old.items.filter((e) => e.id !== id), total: old.total - 1 }
          : old,
      );
      return { snapshot };
    },
    onError: (_err, _id, context) => {
      for (const [key, data] of context?.snapshot ?? []) qc.setQueryData(key, data);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.emails.all });
      void qc.invalidateQueries({ queryKey: queryKeys.stats });
      void qc.invalidateQueries({ queryKey: queryKeys.senders.quotas });
    },
  });
}
