'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, API_URL } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { SlackStatus } from '@/types/api';

export function useSlackStatus() {
  return useQuery({
    queryKey: queryKeys.slack,
    queryFn: ({ signal }) => api<SlackStatus>('/api/slack/status', { signal }),
    staleTime: 30_000,
  });
}

/** Full-page navigation: the API redirects to Slack's consent screen. */
export function startSlackInstall() {
  // Absolute URL on the API origin (not a Next.js route), so a full navigation is correct here.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = `${API_URL}/api/slack/install`;
}

export function useDisconnectSlack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/api/slack/disconnect', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.slack }),
  });
}

export function useSlackTest() {
  return useMutation({ mutationFn: () => api('/api/slack/test', { method: 'POST' }) });
}
