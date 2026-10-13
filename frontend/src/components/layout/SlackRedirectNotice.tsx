'use client';

import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';

const notices: Record<string, (reason: string | null) => void> = {
  connected: () => toast.success('Slack connected', { description: 'Rate-limit alerts will post to your channel.' }),
  error: (reason) => toast.error('Slack connection failed', reason ? { description: reason } : undefined),
  not_configured: () => toast.error('Slack is not configured on the server'),
};

/** The API's Slack OAuth callback redirects back with ?slack=…; show it once, then clean the URL. */
export function SlackRedirectNotice() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const slack = params.get('slack');
  const reason = params.get('reason');

  useEffect(() => {
    if (!slack) return;
    notices[slack]?.(reason);
    void qc.invalidateQueries({ queryKey: queryKeys.slack });
    void qc.invalidateQueries({ queryKey: queryKeys.me });
    router.replace(pathname, { scroll: false });
  }, [slack, reason, pathname, router, qc]);

  return null;
}
