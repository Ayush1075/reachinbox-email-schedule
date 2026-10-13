'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { CreateSenderInput, Sender, SenderQuotas, SmtpCheck, SmtpCredentials, UpdateSenderInput } from '@/types/api';
import { POLL_MS } from './useEmails';

export function useSenders() {
  return useQuery({
    queryKey: queryKeys.senders.list,
    queryFn: ({ signal }) => api<Sender[]>('/api/senders', { signal }),
    staleTime: 30_000,
  });
}

/** Per-sender usage for the current hour, read from the rate limiter's own Redis counters. */
export function useQuotas() {
  return useQuery({
    queryKey: queryKeys.senders.quotas,
    queryFn: ({ signal }) => api<SenderQuotas>('/api/senders/quotas', { signal }),
    refetchInterval: POLL_MS,
  });
}

function useInvalidateSenders() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: queryKeys.senders.all });
    void qc.invalidateQueries({ queryKey: queryKeys.stats });
  };
}

export function useCreateSender() {
  const invalidate = useInvalidateSenders();
  return useMutation({
    mutationFn: (input: CreateSenderInput) => api<Sender>('/api/senders', { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

/** Provisions a fresh Ethereal test mailbox as a sender. */
export function useCreateEtherealSender() {
  const invalidate = useInvalidateSenders();
  return useMutation({
    mutationFn: () => api<Sender>('/api/senders/ethereal', { method: 'POST', body: {} }),
    onSuccess: invalidate,
  });
}

export function useUpdateSender() {
  const invalidate = useInvalidateSenders();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateSenderInput & { id: string }) =>
      api<Sender>(`/api/senders/${id}`, { method: 'PATCH', body: input }),
    onSuccess: invalidate,
  });
}

/** Tests credentials before a sender is saved. */
export function useVerifySmtp() {
  return useMutation({
    mutationFn: (credentials: SmtpCredentials) => api<SmtpCheck>('/api/senders/verify', { method: 'POST', body: credentials }),
  });
}

/** Tests a saved sender's stored credentials. */
export function useVerifySender() {
  return useMutation({
    mutationFn: (id: string) => api<SmtpCheck>(`/api/senders/${id}/verify`, { method: 'POST' }),
  });
}
