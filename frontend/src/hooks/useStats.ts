'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Stats } from '@/types/api';
import { POLL_MS } from './useEmails';

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: ({ signal }) => {
      // "Sent today" uses the viewer's local midnight, not UTC.
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      return api<Stats>('/api/emails/stats', { query: { since: since.toISOString() }, signal });
    },
    refetchInterval: POLL_MS,
  });
}
