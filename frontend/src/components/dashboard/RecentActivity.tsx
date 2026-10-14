'use client';

import { Activity } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/common/EmptyState';
import { StatusPill } from '@/components/email/StatusPill';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useRecentActivity } from '@/hooks/useEmails';
import { useNow } from '@/hooks/useNow';
import { formatRelative } from '@/lib/format';

/** The eight most recent state changes, each linking to its email. */
export function RecentActivity() {
  const { data, isPending } = useRecentActivity(8);
  const now = useNow();

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Recent activity</CardTitle>
        <CardDescription>The latest changes across your campaigns.</CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading activity">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <EmptyState icon={Activity} title="No activity yet" description="Schedule an email and its progress shows up here." className="py-8" />
        ) : (
          <ul className="-my-1 divide-y">
            {data.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/dashboard/emails/${e.id}`}
                  className="flex items-center gap-3 rounded-sm py-2.5 outline-none hover:bg-field/60 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-xs" title={e.recipient}>
                    {e.recipient}
                  </span>
                  <StatusPill email={e} className="shrink-0" />
                  <span className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{now > 0 ? formatRelative(e.updatedAt, now) : ''}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
