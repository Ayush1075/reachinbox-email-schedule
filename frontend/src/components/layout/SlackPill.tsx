'use client';

import { Hash, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { startSlackInstall, useDisconnectSlack, useSlackStatus, useSlackTest } from '@/hooks/useSlackStatus';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';

const pill = 'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors duration-150';

export function SlackPill() {
  const { data, isPending } = useSlackStatus();
  const disconnect = useDisconnectSlack();
  const test = useSlackTest();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (isPending || !data) return <span className={cn(pill, 'w-28 animate-shimmer border-border bg-stone-100')} aria-hidden />;

  if (!data.configured) {
    return (
      <span className={cn(pill, 'cursor-help border-border text-fg-muted')} title="Set SLACK_CLIENT_ID, SLACK_CLIENT_SECRET and SLACK_REDIRECT_URI on the API">
        <Hash className="size-3.5" aria-hidden />
        Slack not configured
      </span>
    );
  }

  if (!data.connected) {
    return (
      <button type="button" onClick={startSlackInstall} className={cn(pill, 'border-border bg-surface text-fg hover:border-stone-300 hover:bg-bg')}>
        <Hash className="size-3.5" aria-hidden />
        Connect Slack
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(pill, 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/70')}
        title={`Rate-limit alerts post to ${data.channelName ?? 'Slack'}${data.teamName ? ` in ${data.teamName}` : ''}`}
      >
        <span className="size-1.5 rounded-full bg-success" aria-hidden />
        Slack <span className="max-w-28 truncate font-mono text-[12px] opacity-80">{data.channelName}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1.5 w-56 rounded-[8px] border border-border bg-surface py-1 shadow-[0_8px_30px_rgb(28_25_23/0.08)]">
          <p className="border-b border-border px-3 py-2 text-[12px] text-fg-muted">
            Connected to <span className="font-medium text-fg">{data.teamName}</span>
          </p>
          <button
            role="menuitem"
            type="button"
            disabled={test.isPending}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-bg disabled:opacity-50"
            onClick={() =>
              test.mutate(undefined, {
                onSuccess: () => toast.success('Test message posted to Slack'),
                onError: (err) => toast.error(errorMessage(err)),
              })
            }
          >
            {test.isPending && <Loader2 className="size-3.5 animate-spin" />}
            Send test message
          </button>
          <button
            role="menuitem"
            type="button"
            className="w-full px-3 py-2 text-left text-sm text-danger hover:bg-bg"
            onClick={() =>
              disconnect.mutate(undefined, {
                onSuccess: () => {
                  setOpen(false);
                  toast.success('Slack disconnected');
                },
                onError: (err) => toast.error(errorMessage(err)),
              })
            }
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
