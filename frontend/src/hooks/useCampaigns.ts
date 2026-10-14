'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { CampaignSummary, CreateCampaignInput, CreateCampaignResult, Paginated } from '@/types/api';
import { POLL_MS } from './useEmails';

export const CAMPAIGNS_PAGE_SIZE = 20;

export function useCampaignList(page: number) {
  return useQuery({
    queryKey: queryKeys.campaigns.list(page),
    queryFn: ({ signal }) => api<Paginated<CampaignSummary>>('/api/campaigns', { query: { page, limit: CAMPAIGNS_PAGE_SIZE }, signal }),
    refetchInterval: POLL_MS,
    placeholderData: keepPreviousData,
  });
}

/** Cancels every email in the campaign that hasn't been sent yet. */
export function useCancelCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ cancelled: number }>(`/api/campaigns/${id}`, { method: 'DELETE' }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.campaigns.all });
      void qc.invalidateQueries({ queryKey: queryKeys.emails.all });
      void qc.invalidateQueries({ queryKey: queryKeys.stats });
      void qc.invalidateQueries({ queryKey: queryKeys.senders.quotas });
    },
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCampaignInput) => api<CreateCampaignResult>('/api/campaigns', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.emails.all });
      void qc.invalidateQueries({ queryKey: queryKeys.campaigns.all });
      void qc.invalidateQueries({ queryKey: queryKeys.stats });
      void qc.invalidateQueries({ queryKey: queryKeys.senders.quotas });
    },
  });
}
