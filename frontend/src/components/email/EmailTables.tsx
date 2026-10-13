'use client';

import { ArrowUpRight, Inbox, Send, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { type Column, DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { PAGE_SIZE, useCancelEmail, useEmails } from '@/hooks/useEmails';
import { errorMessage } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/format';
import type { Email, Paginated } from '@/types/api';

/** Re-render periodically so "in 12m" stays accurate between polls. */
function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function TimeCell({ iso, now }: { iso: string | null; now: number }) {
  if (!iso) return <span className="text-fg-muted">—</span>;
  return (
    <div className="flex flex-col leading-tight whitespace-nowrap">
      <span className="font-mono text-[13px] tabular-nums">{formatDateTime(iso)}</span>
      <span className="text-[12px] text-fg-muted">{formatRelative(iso, now)}</span>
    </div>
  );
}

const recipientCol: Column<Email> = {
  key: 'recipient',
  header: 'Recipient',
  className: 'w-[26%]',
  cell: (e) => (
    <span className="block max-w-[280px] truncate font-mono text-[13px]" title={e.recipient}>
      {e.recipient}
    </span>
  ),
};

const subjectCol: Column<Email> = {
  key: 'subject',
  header: 'Subject',
  cell: (e) => (
    <span className="block max-w-[320px] truncate" title={e.subject}>
      {e.subject}
    </span>
  ),
};

const senderCol: Column<Email> = {
  key: 'sender',
  header: 'Sender',
  className: 'w-[14%]',
  cell: (e) => (
    <span className="block max-w-[160px] truncate text-fg-muted" title={e.sender.fromAddress}>
      {e.sender.label}
    </span>
  ),
};

function statusCol(): Column<Email> {
  return {
    key: 'status',
    header: 'Status',
    className: 'w-[130px]',
    cell: (e) => (
      <StatusBadge
        status={e.status}
        title={
          e.status === 'RATE_LIMITED'
            ? `Hourly limit reached — rescheduled ${e.rescheduleCount}× into the next window`
            : (e.lastError ?? undefined)
        }
      />
    ),
  };
}

function TableShell({
  data,
  isLoading,
  columns,
  page,
  onPageChange,
  empty,
  label,
}: {
  data: Paginated<Email> | undefined;
  isLoading: boolean;
  columns: Column<Email>[];
  page: number;
  onPageChange: (p: number) => void;
  empty: React.ReactNode;
  label: string;
}) {
  return (
    <>
      <DataTable label={label} columns={columns} rows={data?.items} rowKey={(e) => e.id} isLoading={isLoading} empty={empty} />
      {data && data.total > 0 && <Pagination page={page} limit={PAGE_SIZE} total={data.total} onPageChange={onPageChange} />}
    </>
  );
}

export function ScheduledTable({ onCompose }: { onCompose: () => void }) {
  const [page, setPage] = useState(1);
  const { data, isPending } = useEmails('scheduled', page);
  const cancel = useCancelEmail();
  const now = useNow();

  const columns: Column<Email>[] = [
    recipientCol,
    subjectCol,
    senderCol,
    { key: 'scheduledAt', header: 'Scheduled at', className: 'w-[170px]', cell: (e) => <TimeCell iso={e.scheduledAt} now={now} /> },
    statusCol(),
    {
      key: 'actions',
      header: '',
      className: 'w-[56px] text-right',
      cell: (e) =>
        e.status !== 'PROCESSING' && (
          <button
            type="button"
            aria-label={`Cancel email to ${e.recipient}`}
            title="Cancel"
            disabled={cancel.isPending && cancel.variables === e.id}
            onClick={() =>
              cancel.mutate(e.id, {
                onSuccess: () => toast.success('Email cancelled'),
                onError: (err) => toast.error(errorMessage(err)),
              })
            }
            className="rounded-[6px] p-1.5 text-fg-muted transition-colors duration-150 hover:bg-danger/5 hover:text-danger disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        ),
    },
  ];

  return (
    <TableShell
      label="Scheduled emails"
      data={data}
      isLoading={isPending}
      columns={columns}
      page={page}
      onPageChange={setPage}
      empty={
        <EmptyState
          icon={Inbox}
          title="Nothing scheduled"
          description="Upload a list of recipients and pick a start time — emails will appear here until they go out."
          action={<Button onClick={onCompose}>Compose your first email</Button>}
        />
      }
    />
  );
}

export function SentTable() {
  const [page, setPage] = useState(1);
  const { data, isPending } = useEmails('sent', page);
  const now = useNow();

  const columns: Column<Email>[] = [
    recipientCol,
    subjectCol,
    senderCol,
    { key: 'sentAt', header: 'Sent at', className: 'w-[170px]', cell: (e) => <TimeCell iso={e.sentAt} now={now} /> },
    statusCol(),
    { key: 'preview', header: 'Preview', className: 'w-[100px]', cell: (e) => <PreviewLink email={e} /> },
  ];

  return (
    <TableShell
      label="Sent emails"
      data={data}
      isLoading={isPending}
      columns={columns}
      page={page}
      onPageChange={setPage}
      empty={<EmptyState icon={Send} title="No emails sent yet" description="Sent and failed emails show up here, with a link to view each message in Ethereal." />}
    />
  );
}

export function PreviewLink({ email }: { email: Email }) {
  if (email.previewUrl) {
    return (
      <a
        href={email.previewUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-[13px] font-medium text-accent transition-colors duration-150 hover:text-accent-hover"
      >
        View
        <ArrowUpRight className="size-3.5" aria-hidden />
      </a>
    );
  }
  if (email.status === 'FAILED') {
    return (
      <span className="cursor-help text-[13px] text-fg-muted underline decoration-dotted underline-offset-2" title={email.lastError ?? 'Failed'}>
        Error
      </span>
    );
  }
  return <span className="text-fg-muted">—</span>;
}

/** Column set for mixed search results (any status). */
export function useSearchColumns(): Column<Email>[] {
  const now = useNow();
  return [
    recipientCol,
    subjectCol,
    senderCol,
    { key: 'time', header: 'Time', className: 'w-[170px]', cell: (e) => <TimeCell iso={e.sentAt ?? e.scheduledAt} now={now} /> },
    statusCol(),
    { key: 'preview', header: 'Preview', className: 'w-[100px]', cell: (e) => <PreviewLink email={e} /> },
  ];
}
