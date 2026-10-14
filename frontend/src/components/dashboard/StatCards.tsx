'use client';

import { AlertTriangle, CalendarClock, Gauge, Send, type LucideIcon } from 'lucide-react';
import { AnimatedNumber } from '@/components/common/AnimatedNumber';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useStats } from '@/hooks/useStats';
import { formatNumber, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';

function StatCard({
  label,
  icon: Icon,
  value,
  total,
  caption,
  tone,
}: {
  label: string;
  icon: LucideIcon;
  value: number | undefined;
  /** Renders "value / total" (the current-hour usage card). */
  total?: number;
  caption?: string;
  tone?: 'danger';
}) {
  return (
    <Card className="gap-0 py-4 shadow-none">
      <CardContent className="px-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <Icon className="size-4 text-muted-foreground" aria-hidden />
        </div>
        <div className="mt-3 min-h-9">
          {value === undefined ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <p className={cn('font-mono text-3xl leading-9 font-semibold tabular-nums', tone === 'danger' && value > 0 && 'text-destructive')}>
              <AnimatedNumber value={value} />
              {total !== undefined && <span className="text-base font-normal text-muted-foreground"> / {formatNumber(total)}</span>}
            </p>
          )}
        </div>
        <p className="mt-1 min-h-4 text-xs text-muted-foreground">{caption}</p>
      </CardContent>
    </Card>
  );
}

export function StatCards() {
  const { data } = useStats();
  return (
    <section aria-label="Overview" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Total scheduled"
        icon={CalendarClock}
        value={data?.scheduled}
        caption={data && data.rateLimited > 0 ? `${formatNumber(data.rateLimited)} deferred by the hourly limit` : 'Waiting to be sent'}
      />
      <StatCard label="Sent today" icon={Send} value={data?.sentToday} caption="Since local midnight" />
      <StatCard label="Failed" icon={AlertTriangle} value={data?.failed} tone="danger" caption="Needs attention" />
      <StatCard
        label="Current hour usage"
        icon={Gauge}
        value={data?.currentHour.used}
        total={data?.currentHour.limit}
        caption={data ? `Window resets at ${formatTime(data.currentHour.windowEnd)}` : undefined}
      />
    </section>
  );
}
