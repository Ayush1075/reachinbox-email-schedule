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

type SignInInput = { accessToken: string } | { email: string; password: string };

/** Google (OAuth access token from the custom button) or email + password. Both set the session cookie. */
export function useSignIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SignInInput) =>
      api<{ user: User }>('accessToken' in input ? '/api/auth/google' : '/api/auth/email', { method: 'POST', body: input }),
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
