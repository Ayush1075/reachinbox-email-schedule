'use client';

import { CheckCircle2, Loader2, MoreHorizontal, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { quotaTone, TONE_BAR } from '@/components/dashboard/QuotaPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useUpdateSender, useVerifySender } from '@/hooks/useSenders';
import { errorMessage } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Sender, SenderQuotas, SmtpCheck } from '@/types/api';

type Quota = SenderQuotas['senders'][number] | undefined;

function EditDialog({ sender, open, onOpenChange }: { sender: Sender; open: boolean; onOpenChange: (open: boolean) => void }) {
  const update = useUpdateSender();
  const [label, setLabel] = useState(sender.label);
  const [limit, setLimit] = useState(sender.hourlyLimit?.toString() ?? '');
  const limitInvalid = limit !== '' && !(Number.isInteger(Number(limit)) && Number(limit) > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Edit sender</DialogTitle>
          <DialogDescription className="font-mono text-xs">{sender.fromAddress}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!label.trim() || limitInvalid) return;
            update.mutate(
              { id: sender.id, label: label.trim(), hourlyLimit: limit === '' ? null : Number(limit) },
              {
                onSuccess: () => {
                  toast.success('Sender updated');
                  onOpenChange(false);
                },
                onError: (err) => toast.error(errorMessage(err)),
              },
            );
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`label-${sender.id}`} className="text-xs">
              Name
            </Label>
            <Input id={`label-${sender.id}`} value={label} onChange={(e) => setLabel(e.target.value)} className="h-9 border-transparent bg-field shadow-none dark:bg-field" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`limit-${sender.id}`} className="text-xs">
              Hourly limit
            </Label>
            <Input
              id={`limit-${sender.id}`}
              type="number"
              inputMode="numeric"
              min={1}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder={`Server default (${sender.effectiveHourlyLimit})`}
              aria-invalid={limitInvalid || undefined}
              className="h-9 border-transparent bg-field font-mono shadow-none dark:bg-field"
            />
            {limitInvalid && (
              <p role="alert" className="text-xs text-destructive">
                A whole number above 0
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending || !label.trim() || limitInvalid} className="rounded-full px-5">
              {update.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SenderCard({ sender, quota }: { sender: Sender; quota: Quota }) {
  const [editing, setEditing] = useState(false);
  const [check, setCheck] = useState<SmtpCheck | null>(null);
  const update = useUpdateSender();
  const verify = useVerifySender();
  const used = quota?.used ?? 0;
  const limit = quota?.limit ?? sender.effectiveHourlyLimit;
  const tone = quotaTone(used, limit);

  const runCheck = () => {
    setCheck(null);
    verify.mutate(sender.id, { onSuccess: setCheck, onError: (err) => setCheck({ ok: false, latencyMs: 0, error: errorMessage(err) }) });
  };

  const dot = check ? (check.ok ? 'bg-primary' : 'bg-destructive') : sender.isActive ? 'bg-primary' : 'bg-muted-foreground/40';
  const dotLabel = check ? (check.ok ? 'Connection OK' : 'Connection failed') : sender.isActive ? 'Active' : 'Deactivated';

  return (
    <Card className={cn('gap-0 py-4 shadow-none', !sender.isActive && 'opacity-70')}>
      <CardContent className="px-5">
        <div className="flex items-start gap-3">
          <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', dot)} role="img" aria-label={dotLabel} title={dotLabel} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{sender.label}</p>
            <p className="truncate font-mono text-xs text-muted-foreground" title={sender.fromAddress}>
              {sender.fromAddress}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${sender.label}`} className="-mt-1 -mr-2 text-muted-foreground">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(true)}>Edit</DropdownMenuItem>
              <DropdownMenuItem onSelect={runCheck}>Test connection</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  update.mutate(
                    { id: sender.id, isActive: !sender.isActive },
                    {
                      onSuccess: () => toast.success(sender.isActive ? 'Sender deactivated' : 'Sender activated'),
                      onError: (err) => toast.error(errorMessage(err)),
                    },
                  )
                }
              >
                {sender.isActive ? 'Deactivate' : 'Activate'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-4">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">This hour</span>
            <span className={cn('font-mono tabular-nums', tone === 'full' && 'text-destructive')}>
              {formatNumber(used)} / {formatNumber(limit)}
            </span>
          </div>
          <Progress
            value={limit > 0 ? Math.min(100, (used / limit) * 100) : 0}
            aria-label={`${sender.label}: ${used} of ${limit} emails this hour`}
            className={cn('mt-1.5', TONE_BAR[tone])}
          />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Hourly limit</dt>
            <dd className="font-mono">
              {formatNumber(sender.effectiveHourlyLimit)}
              {sender.hourlyLimit === null && <span className="text-muted-foreground"> (default)</span>}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">SMTP</dt>
            <dd className="truncate font-mono" title={`${sender.smtpHost}:${sender.smtpPort}`}>
              {sender.smtpHost}:{sender.smtpPort}
            </dd>
          </div>
        </dl>

        <div aria-live="polite" className="mt-3 min-h-4 text-xs">
          {verify.isPending && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Testing connection…
            </p>
          )}
          {check?.ok === true && (
            <p className="flex items-center gap-1.5 text-primary">
              <CheckCircle2 className="size-3.5" aria-hidden />
              Connected in {check.latencyMs} ms
            </p>
          )}
          {check?.ok === false && (
            <p className="flex items-start gap-1.5 text-destructive">
              <XCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {check.error}
            </p>
          )}
        </div>
      </CardContent>
      {editing && <EditDialog sender={sender} open={editing} onOpenChange={setEditing} />}
    </Card>
  );
}
