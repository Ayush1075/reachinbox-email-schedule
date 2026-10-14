'use client';

import { ChevronDown, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { useCreateEtherealSender, useQuotas, useSenders } from '@/hooks/useSenders';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Sender } from '@/types/api';

/**
 * "From" selector. Several senders can be chosen: emails rotate across them
 * round-robin. Each row shows how much of its hourly limit is already used.
 */
export function SenderPicker({
  value,
  onChange,
  invalid,
  describedBy,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const senders = useSenders();
  const quotas = useQuotas();
  const create = useCreateEtherealSender();
  const active = (senders.data ?? []).filter((s) => s.isActive);
  const chosen = active.filter((s) => value.includes(s.id));
  const usage = new Map(quotas.data?.senders.map((q) => [q.senderId, q]));

  if (senders.isPending) return <Skeleton className="h-8 w-56 rounded-md" aria-label="Loading senders" />;

  if (active.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">No sender yet.</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={create.isPending}
          onClick={() =>
            create.mutate(undefined, {
              onSuccess: (s: Sender) => {
                onChange([s.id]);
                toast.success(`Added ${s.label}`, { description: s.fromAddress });
              },
              onError: (err) => toast.error(errorMessage(err)),
            })
          }
          className="rounded-full"
        >
          <Plus aria-hidden />
          {create.isPending ? 'Creating…' : 'Add an Ethereal sender'}
        </Button>
      </div>
    );
  }

  const label = chosen.length === 0 ? 'Choose sender' : chosen[0]!.fromAddress;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`From: ${chosen.length === 0 ? 'none selected' : chosen.map((s) => s.fromAddress).join(', ')}`}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'inline-flex h-8 max-w-full items-center gap-2 rounded-lg bg-field px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
            invalid && 'ring-2 ring-destructive/40',
          )}
        >
          <span className="truncate">{label}</span>
          {chosen.length > 1 && <span className="rounded-full bg-background px-1.5 text-xs text-muted-foreground">+{chosen.length - 1}</span>}
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] gap-1 p-2">
        <p className="px-2 pt-1 pb-1.5 text-xs text-muted-foreground">
          {chosen.length > 1 ? 'Emails rotate across the selected senders.' : 'Select one or more senders.'}
        </p>
        <ul>
          {active.map((s) => {
            const checked = value.includes(s.id);
            const q = usage.get(s.id);
            const id = `sender-${s.id}`;
            return (
              <li key={s.id}>
                <label htmlFor={id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-field">
                  <Checkbox
                    id={id}
                    checked={checked}
                    onCheckedChange={(on) => onChange(on ? [...value, s.id] : value.filter((v) => v !== s.id))}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{s.fromAddress}</span>
                    <span className="block text-xs text-muted-foreground">{s.label}</span>
                  </span>
                  <span
                    className={cn('font-mono text-xs tabular-nums text-muted-foreground', q && q.used >= q.limit && 'text-destructive')}
                    title="Sent this hour / hourly limit"
                  >
                    {q ? `${q.used}/${q.limit}` : `${s.effectiveHourlyLimit}/h`}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
