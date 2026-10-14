'use client';

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useThroughput } from '@/hooks/useEmails';
import { useHydrated } from '@/hooks/useHydrated';
import { formatNumber, formatTime } from '@/lib/format';

type Point = { at: number; sent: number };

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-sm">
      <p className="font-mono tabular-nums">{formatNumber(point.sent)} sent</p>
      <p className="text-muted-foreground">{formatTime(point.at)}</p>
    </div>
  );
}

/** Emails sent per 5-minute bucket over the last hour. */
export function ThroughputChart() {
  const { data, isPending } = useThroughput();
  const hydrated = useHydrated();
  const points: Point[] = (data?.buckets ?? []).map((b) => ({ at: new Date(b.bucketStart).getTime(), sent: b.sent }));
  const total = points.reduce((n, p) => n + p.sent, 0);

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Throughput</CardTitle>
        <CardDescription>
          {data ? `${formatNumber(total)} sent in the last hour, in 5-minute buckets.` : 'Emails sent per 5 minutes over the last hour.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-40" role="img" aria-label={`Emails sent per five minutes over the last hour; ${total} in total`}>
          {isPending || !hydrated ? (
            <Skeleton className="size-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="throughput-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="at" hide />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--border)' }} />
                <Area type="monotone" dataKey="sent" stroke="var(--primary)" strokeWidth={1.5} fill="url(#throughput-fill)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted-foreground" aria-hidden>
          <span>60 min ago</span>
          <span>Now</span>
        </div>
      </CardContent>
    </Card>
  );
}
