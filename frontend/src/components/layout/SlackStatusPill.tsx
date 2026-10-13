'use client';

import { Hash } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { startSlackInstall, useSlackStatus } from '@/hooks/useSlackStatus';
import { cn } from '@/lib/utils';

/** Sidebar footer status. `compact` renders an icon-only version for the collapsed rail. */
export function SlackStatusPill({ compact = false }: { compact?: boolean }) {
  const { data, isPending } = useSlackStatus();

  if (isPending || !data) return <Skeleton className={cn('h-8', compact ? 'w-8' : 'w-full')} />;

  if (!data.configured || !data.connected) {
    const label = data.configured ? 'Connect Slack' : 'Slack not configured';
    const button = (
      <Button
        variant="outline"
        size={compact ? 'icon-sm' : 'sm'}
        className={cn(!compact && 'w-full justify-start')}
        disabled={!data.configured}
        onClick={startSlackInstall}
        aria-label={compact ? label : undefined}
      >
        <Hash aria-hidden />
        {!compact && label}
      </Button>
    );
    if (data.configured && !compact) return button;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Disabled buttons swallow pointer events; the span keeps the tooltip reachable. */}
          <span tabIndex={data.configured ? undefined : 0} className="block">
            {button}
          </span>
        </TooltipTrigger>
        <TooltipContent side="right">
          {data.configured ? label : 'Set SLACK_CLIENT_ID, SLACK_CLIENT_SECRET and SLACK_REDIRECT_URI on the API'}
        </TooltipContent>
      </Tooltip>
    );
  }

  const channel = data.channelName ?? 'Slack';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href="/dashboard/settings"
          aria-label={`Slack connected to ${channel}${data.teamName ? ` in ${data.teamName}` : ''}`}
          className={cn(
            'flex h-8 items-center gap-2 rounded-md border px-2.5 text-[13px] font-medium transition-colors duration-150 ease-out hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
            compact && 'w-8 justify-center px-0',
          )}
        >
          <span className="size-2 shrink-0 rounded-full bg-success" aria-hidden />
          {!compact && <span className="truncate font-mono text-xs">{channel}</span>}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">
        Rate-limit alerts post to {channel}
        {data.teamName ? ` in ${data.teamName}` : ''}
      </TooltipContent>
    </Tooltip>
  );
}
