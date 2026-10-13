'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { ServerConfig } from '@/types/api';

/** Non-secret scheduling defaults from the server's environment. */
export function useServerConfig() {
  return useQuery({
    queryKey: queryKeys.config,
    queryFn: ({ signal }) => api<ServerConfig>('/api/config', { signal }),
    staleTime: Infinity,
  });
}
