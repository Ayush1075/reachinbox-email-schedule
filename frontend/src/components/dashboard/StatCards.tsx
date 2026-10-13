'use client';

import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { useCountUp } from '@/hooks/useCountUp';
import { useStats } from '@/hooks/useStats';
import { cn } from '@/lib/cn';
import { formatTime } from '@/lib/format';
import type { Stats } from '@/types/api';

function Card({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-[8px] border border-border bg-surface p-5 shadow-[var(--shadow-card)]', className)}>
      <p className="text-[12px] font-medium tracking-wide text-fg-muted uppercase">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function StatNumber({ value, tone }: { value: number | undefined; tone?: 'danger' }) {
  const shown = useCountUp(value);
  if (shown === undefined) return <Skeleton className="h-8 w-16" />;
  return (
    <p className={cn('font-mono text-[28px] leading-8 font-semibold tabular-nums', tone === 'danger' && shown > 0 && 'text-danger')}>
      {shown.toLocaleString()}
    </p>
  );
}

function QuotaCard({ stats }: { stats: Stats | undefined }) {
  const used = useCountUp(stats?.currentHour.used);
  const limit = stats?.currentHour.limit ?? 0;
  const pct = limit > 0 && used !== undefined ? Math.min(100, (used / limit) * 100) : 0;
  const tone = pct >= 100 ? 'bg-danger' : pct >= 80 ? 'bg-warning' : 'bg-accent';

  return (
    <Card label="Current hour usage">
      {stats === undefined || used === undefined ? (
        <Skeleton className="h-8 w-28" />
      ) : (
        <>
          <p className="font-mono text-[28px] leading-8 font-semibold tabular-nums">
            {used.toLocaleString()}
            <span className="text-base font-normal text-fg-muted"> / {limit.toLocaleString()}</span>
          </p>
          <div
            className="mt-3 h-1 overflow-hidden rounded-full bg-stone-100"
            role="progressbar"
            aria-valuenow={used}
            aria-valuemin={0}
            aria-valuemax={limit}
            aria-label="Emails sent this hour across all senders"
          >
            <div className={cn('h-full rounded-full transition-[width] duration-500 ease-out', tone)} style={{ width: `${pct}%` }} />
          </div>
          <ul className="mt-3 space-y-1">
            {stats.currentHour.senders.map((s) => (
              <li key={s.senderId} className="flex items-center justify-between gap-2 text-[12px] text-fg-muted" title={s.fromAddress}>
                <span className="truncate">{s.label}</span>
                <span className={cn('font-mono tabular-nums', s.used >= s.limit && 'font-medium text-danger')}>
                  {s.used}/{s.limit}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-fg-muted">Window resets at {formatTime(stats.currentHour.windowEnd)}</p>
        </>
      )}
    </Card>
  );
}

export function StatCards() {
  const { data } = useStats();
  return (
    <section aria-label="Overview" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card label="Total scheduled">
        <StatNumber value={data?.scheduled} />
        {data && data.rateLimited > 0 && <p className="mt-1 text-[12px] text-warning">{data.rateLimited.toLocaleString()} deferred by rate limit</p>}
      </Card>
      <Card label="Sent today">
        <StatNumber value={data?.sentToday} />
      </Card>
      <Card label="Failed">
        <StatNumber value={data?.failed} tone="danger" />
      </Card>
      <QuotaCard stats={data} />
    </section>
  );
}
