'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CreateCampaignInput, CreateCampaignResult } from '@/types/api';
import { emailKeys } from './useEmails';

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCampaignInput) => api<CreateCampaignResult>('/api/campaigns', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: emailKeys.all });
      void qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useCancelCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ cancelled: number }>(`/api/campaigns/${id}`, { method: 'DELETE' }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: emailKeys.all });
      void qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}
