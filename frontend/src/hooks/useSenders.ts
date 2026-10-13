'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Sender } from '@/types/api';

export const sendersKey = ['senders'] as const;

export function useSenders() {
  return useQuery({
    queryKey: sendersKey,
    queryFn: ({ signal }) => api<Sender[]>('/api/senders', { signal }),
    staleTime: 30_000,
  });
}

export function useCreateEtherealSender() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<Sender>('/api/senders/ethereal', { method: 'POST', body: {} }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sendersKey });
      void qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export type ServerConfig = {
  minDelayBetweenEmailsMs: number;
  defaultHourlyLimit: number;
  maxRecipients: number;
  bullBoardPath: string;
};

export function useServerConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: ({ signal }) => api<ServerConfig>('/api/config', { signal }),
    staleTime: Infinity,
  });
}
