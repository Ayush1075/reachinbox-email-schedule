'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, API_URL } from '@/lib/api';
import type { SlackStatus } from '@/types/api';

const slackKey = ['slack'] as const;

export function useSlackStatus() {
  return useQuery({
    queryKey: slackKey,
    queryFn: ({ signal }) => api<SlackStatus>('/api/slack/status', { signal }),
    staleTime: 30_000,
  });
}

/** Full-page navigation: the API redirects to Slack's consent screen. */
export function startSlackInstall() {
  window.location.href = `${API_URL}/api/slack/install`;
}

export function useDisconnectSlack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/api/slack/disconnect', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: slackKey }),
  });
}

export function useSlackTest() {
  return useMutation({ mutationFn: () => api('/api/slack/test', { method: 'POST' }) });
}
