'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { CreateCampaignInput, CreateCampaignResult } from '@/types/api';

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCampaignInput) => api<CreateCampaignResult>('/api/campaigns', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.emails.all });
      void qc.invalidateQueries({ queryKey: queryKeys.stats });
      void qc.invalidateQueries({ queryKey: queryKeys.senders.quotas });
    },
  });
}
