'use client';

import { Gauge } from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useNow } from '@/hooks/useNow';
import { useQuotas } from '@/hooks/useSenders';
import { formatDuration, formatTime, pluralize } from '@/lib/format';
import { cn } from '@/lib/utils';

export function quotaTone(used: number, limit: number): 'ok' | 'high' | 'full' {
  const pct = limit > 0 ? used / limit : 0;
  return pct >= 1 ? 'full' : pct >= 0.8 ? 'high' : 'ok';
}

/** Amber above 80% of the limit, red at 100%. */
export const TONE_BAR = {
  ok: '',
  high: '[&_[data-slot=progress-indicator]]:bg-warning',
  full: '[&_[data-slot=progress-indicator]]:bg-destructive',
} as const;

/**
 * Per-sender usage of the current hour window. Numbers come from the Redis
 * counters the rate limiter itself increments, so what is shown here is what
 * the limiter will enforce.
 */
export function QuotaPanel() {
  const { data, isPending } = useQuotas();
  const now = useNow();
  const senders = (data?.senders ?? []).filter((s) => s.isActive || s.used > 0);
  const deferred = senders.reduce((n, s) => n + s.deferred, 0);

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Hourly quota</CardTitle>
        <CardDescription>
          Emails each sender has sent in the current UTC hour.
          {data && now > 0 && <> Resets in {formatDuration(new Date(data.windowEnd).getTime() - now)} ({formatTime(data.windowEnd)}).</>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {deferred > 0 && (
          <Alert>
            <AlertTitle>{pluralize(deferred, 'email')} deferred to the next window</AlertTitle>
            <AlertDescription>
              A sender reached its hourly limit. Nothing is dropped: those emails were rescheduled and keep their order.
            </AlertDescription>
          </Alert>
        )}
        {isPending ? (
          <div className="space-y-5" aria-busy="true" aria-label="Loading quotas">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : senders.length === 0 ? (
          <EmptyState icon={Gauge} title="No senders yet" description="Add a sender to see its hourly usage." className="py-8" />
        ) : (
          <ul className="space-y-5">
            {senders.map((s) => {
              const tone = quotaTone(s.used, s.limit);
              return (
                <li key={s.senderId}>
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{s.label}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">{s.fromAddress}</p>
                    </div>
                    <p className={cn('font-mono text-sm tabular-nums', tone === 'full' && 'text-destructive')}>
                      {s.used} / {s.limit}
                      {tone === 'full' && <span className="sr-only"> (limit reached)</span>}
                    </p>
                  </div>
                  <Progress
                    value={s.limit > 0 ? Math.min(100, (s.used / s.limit) * 100) : 0}
                    aria-label={`${s.label}: ${s.used} of ${s.limit} emails this hour`}
                    className={cn('mt-2', TONE_BAR[tone])}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
