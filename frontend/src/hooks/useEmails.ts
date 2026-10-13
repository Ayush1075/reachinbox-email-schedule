'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Email, EmailStatus, Paginated, SearchResult } from '@/types/api';

/** Live polling cadence. TanStack pauses interval refetches while the tab is hidden. */
export const POLL_MS = 5_000;
export const PAGE_SIZE = 20;

export const emailKeys = {
  all: ['emails'] as const,
  list: (kind: 'scheduled' | 'sent', page: number) => ['emails', kind, page] as const,
  search: (params: SearchParams) => ['emails', 'search', params] as const,
};

export function useEmails(kind: 'scheduled' | 'sent', page: number) {
  return useQuery({
    queryKey: emailKeys.list(kind, page),
    queryFn: ({ signal }) => api<Paginated<Email>>(`/api/emails/${kind}`, { query: { page, limit: PAGE_SIZE }, signal }),
    refetchInterval: POLL_MS,
    placeholderData: keepPreviousData,
  });
}

export type SearchParams = { q: string; status: EmailStatus | ''; page: number };

export function useEmailSearch(params: SearchParams, enabled: boolean) {
  return useQuery({
    queryKey: emailKeys.search(params),
    queryFn: ({ signal }) =>
      api<SearchResult>('/api/search', { query: { q: params.q, status: params.status, page: params.page, limit: PAGE_SIZE }, signal }),
    enabled,
    refetchInterval: POLL_MS,
    placeholderData: keepPreviousData,
  });
}

export function useCancelEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ cancelled: number }>(`/api/emails/${id}/cancel`, { method: 'POST' }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: emailKeys.all });
      void qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}
