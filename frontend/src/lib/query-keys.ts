import type { EmailListKind, EmailListParams, EmailStatus } from '@/types/api';

export type SearchQuery = { q: string; status: EmailStatus | ''; page: number; limit: number };

/**
 * Every TanStack Query key in the app. Hierarchical, so invalidating a prefix
 * (e.g. `queryKeys.emails.all`) refreshes every list, search and feed below it.
 */
export const queryKeys = {
  me: ['me'] as const,
  config: ['config'] as const,
  stats: ['stats'] as const,
  slack: ['slack'] as const,
  emails: {
    all: ['emails'] as const,
    list: (kind: EmailListKind, params: EmailListParams) => ['emails', 'list', kind, params] as const,
    search: (query: SearchQuery) => ['emails', 'search', query] as const,
    throughput: ['emails', 'throughput'] as const,
    recent: ['emails', 'recent'] as const,
  },
  senders: {
    all: ['senders'] as const,
    list: ['senders', 'list'] as const,
    quotas: ['senders', 'quotas'] as const,
  },
};
