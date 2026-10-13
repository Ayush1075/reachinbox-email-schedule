import type { ReactNode } from 'react';
import type { EmailStatus } from '@/types/api';
import { cn } from '@/lib/cn';

type Tone = 'slate' | 'emerald' | 'red' | 'amber' | 'indigo' | 'stone';

// Soft background + darker text; never saturated fills.
const tones: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  stone: 'bg-stone-100 text-stone-500 ring-stone-200',
};

export function Badge({ tone = 'slate', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium whitespace-nowrap ring-1 ring-inset',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const statusTone: Record<EmailStatus, Tone> = {
  SCHEDULED: 'slate',
  QUEUED: 'slate',
  PROCESSING: 'indigo',
  SENT: 'emerald',
  FAILED: 'red',
  RATE_LIMITED: 'amber',
  CANCELLED: 'stone',
};

const statusLabel: Record<EmailStatus, string> = {
  SCHEDULED: 'Scheduled',
  QUEUED: 'Scheduled',
  PROCESSING: 'Sending',
  SENT: 'Sent',
  FAILED: 'Failed',
  RATE_LIMITED: 'Rate limited',
  CANCELLED: 'Cancelled',
};

export function StatusBadge({ status, title }: { status: EmailStatus; title?: string }) {
  return (
    <span title={title}>
      <Badge tone={statusTone[status]}>
        <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
        {statusLabel[status]}
      </Badge>
    </span>
  );
}
