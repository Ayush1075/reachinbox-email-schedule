'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Ban, Layers } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CAMPAIGNS_PAGE_SIZE, useCampaignList, useCancelCampaign } from '@/hooks/useCampaigns';
import { errorMessage } from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CampaignStatus, CampaignSummary } from '@/types/api';

const STATUS: Record<CampaignStatus, { label: string; className: string }> = {
  SCHEDULED: { label: 'Scheduled', className: 'border-orange-200 bg-orange-100 text-orange-700 dark:border-orange-400/25 dark:bg-orange-400/10 dark:text-orange-300' },
  RUNNING: { label: 'Sending', className: 'border-green-200 bg-primary-soft text-primary-soft-foreground dark:border-green-400/25' },
  COMPLETED: { label: 'Completed', className: 'border-green-200 bg-primary-soft text-primary-soft-foreground dark:border-green-400/25' },
  PARTIALLY_FAILED: { label: 'Partly failed', className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300' },
  CANCELLED: { label: 'Cancelled', className: 'border-border bg-muted text-muted-foreground' },
};

const PENDING = ['SCHEDULED', 'QUEUED', 'RATE_LIMITED', 'PROCESSING'] as const;
const pendingOf = (c: CampaignSummary) => PENDING.reduce((n, s) => n + (c.counts[s] ?? 0), 0);

export function CampaignsTable() {
  const [page, setPage] = useState(1);
  const { data, isPending } = useCampaignList(page);
  const cancel = useCancelCampaign();

  const columns = useMemo<ColumnDef<CampaignSummary>[]>(
    () => [
      {
        id: 'subject',
        header: 'Campaign',
        accessorFn: (c) => c.subject,
        cell: ({ row }) => (
          <div className="min-w-0 max-w-[320px]">
            <p className="truncate font-medium" title={row.original.subject}>
              {row.original.subject}
            </p>
            <p className="text-xs text-muted-foreground">Created {formatDateTime(row.original.createdAt)}</p>
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (c) => c.status,
        cell: ({ row }) => {
          const s = STATUS[row.original.status];
          return (
            <Badge variant="outline" className={cn('h-6 px-2.5 font-normal', s.className)}>
              {s.label}
            </Badge>
          );
        },
      },
      {
        id: 'progress',
        header: 'Delivered',
        accessorFn: (c) => (c.totalRecipients > 0 ? (c.counts.SENT ?? 0) / c.totalRecipients : 0),
        cell: ({ row }) => {
          const c = row.original;
          const sent = c.counts.SENT ?? 0;
          const failed = c.counts.FAILED ?? 0;
          return (
            <div className="w-40">
              <p className="font-mono text-xs tabular-nums">
                {formatNumber(sent)} / {formatNumber(c.totalRecipients)}
                {failed > 0 && <span className="text-destructive"> · {formatNumber(failed)} failed</span>}
              </p>
              <Progress
                value={c.totalRecipients > 0 ? (sent / c.totalRecipients) * 100 : 0}
                aria-label={`${sent} of ${c.totalRecipients} delivered`}
                className="mt-1.5"
              />
            </div>
          );
        },
      },
      {
        id: 'startAt',
        header: 'Starts',
        accessorFn: (c) => new Date(c.startAt).getTime(),
        cell: ({ row }) => <span className="font-mono text-xs tabular-nums">{formatDateTime(row.original.startAt)}</span>,
      },
      {
        id: 'plannedEndAt',
        header: 'Planned end',
        accessorFn: (c) => (c.plannedEndAt ? new Date(c.plannedEndAt).getTime() : 0),
        cell: ({ row }) =>
          row.original.plannedEndAt ? <span className="font-mono text-xs tabular-nums">{formatDateTime(row.original.plannedEndAt)}</span> : '—',
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const c = row.original;
          const pending = pendingOf(c);
          if (pending === 0) return null;
          return (
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="icon-sm" aria-label={`Cancel ${pending} pending emails in ${c.subject}`} className="text-muted-foreground">
                  <Ban aria-hidden />
                </Button>
              }
              title="Cancel the rest of this campaign?"
              description={`${formatNumber(pending)} email${pending === 1 ? '' : 's'} that haven't been sent yet will be cancelled. Emails already sent are unaffected.`}
              confirmLabel="Cancel campaign"
              onConfirm={() =>
                cancel.mutate(c.id, {
                  onSuccess: (r) => toast.success(`${formatNumber(r.cancelled)} emails cancelled`),
                  onError: (err) => toast.error(errorMessage(err)),
                })
              }
            />
          );
        },
      },
    ],
    [cancel],
  );

  const pages = data ? Math.max(1, Math.ceil(data.total / CAMPAIGNS_PAGE_SIZE)) : 1;

  return (
    <div className="space-y-3">
      <DataTable
        label="Campaigns"
        columns={columns}
        data={data?.items}
        isLoading={isPending}
        rowKey={(c) => c.id}
        empty={
          <EmptyState
            icon={Layers}
            title="No campaigns yet"
            description="Each time you send or schedule from Compose, the campaign shows up here with its delivery progress."
            action={
              <Button asChild className="rounded-full px-5">
                <Link href="/dashboard/compose">Compose your first email</Link>
              </Button>
            }
          />
        }
      />
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
