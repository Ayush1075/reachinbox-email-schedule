'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { User } from '@/types/api';

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => api<{ user: User }>('/api/auth/me', { signal }).then((d) => d.user),
    retry: false,
    staleTime: 60_000,
  });
}

export function useGoogleLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (credential: string) => api<{ user: User }>('/api/auth/google', { method: 'POST', body: { credential } }),
    onSuccess: ({ user }) => qc.setQueryData(queryKeys.me, user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => qc.clear(),
  });
}
