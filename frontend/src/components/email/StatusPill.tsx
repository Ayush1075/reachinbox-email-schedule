import { Ban, CheckCircle2, CircleAlert, Clock, Hourglass, Loader2, type LucideIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDateTime, formatPillTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Email, EmailStatus } from '@/types/api';

type Tone = { label: string; icon: LucideIcon; className: string; spin?: boolean };

/**
 * Every status in the app renders through this pill. Each one has its own
 * icon as well as its own colour, so colour is never the only signal.
 */
const TONES: Record<EmailStatus, Tone> = {
  SCHEDULED: { label: 'Scheduled', icon: Clock, className: 'border-orange-200 bg-orange-100 text-orange-700 dark:border-orange-400/25 dark:bg-orange-400/10 dark:text-orange-300' },
  QUEUED: { label: 'Scheduled', icon: Clock, className: 'border-orange-200 bg-orange-100 text-orange-700 dark:border-orange-400/25 dark:bg-orange-400/10 dark:text-orange-300' },
  PROCESSING: { label: 'Sending', icon: Loader2, spin: true, className: 'border-green-200 bg-primary-soft text-primary-soft-foreground dark:border-green-400/25' },
  RATE_LIMITED: { label: 'Deferred', icon: Hourglass, className: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300' },
  SENT: { label: 'Sent', icon: CheckCircle2, className: 'border-green-200 bg-primary-soft text-primary-soft-foreground dark:border-green-400/25' },
  FAILED: { label: 'Failed', icon: CircleAlert, className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300' },
  CANCELLED: { label: 'Cancelled', icon: Ban, className: 'border-border bg-muted text-muted-foreground' },
};

function describe(email: Pick<Email, 'status' | 'scheduledAt' | 'sentAt' | 'lastError' | 'rescheduleCount'>) {
  switch (email.status) {
    case 'SENT':
      return `Sent ${formatDateTime(email.sentAt ?? email.scheduledAt)}`;
    case 'FAILED':
      return email.lastError ?? 'Delivery failed';
    case 'RATE_LIMITED':
      return `Hourly limit reached. Moved to the next window (${formatDateTime(email.scheduledAt)}); deferred ${email.rescheduleCount}×`;
    case 'PROCESSING':
      return 'Handing off to SMTP now';
    case 'CANCELLED':
      return 'Cancelled before sending';
    default:
      return `Scheduled for ${formatDateTime(email.scheduledAt)}`;
  }
}

/** The time pill from the design: clock + "Tue 9:15:12 AM" for scheduled mail; other statuses get their own tone. */
export function StatusPill({
  email,
  className,
}: {
  email: Pick<Email, 'status' | 'scheduledAt' | 'sentAt' | 'lastError' | 'rescheduleCount'>;
  className?: string;
}) {
  const tone = TONES[email.status];
  const Icon = tone.icon;
  const time = email.status === 'SENT' ? (email.sentAt ?? email.scheduledAt) : email.scheduledAt;
  const text = email.status === 'FAILED' || email.status === 'CANCELLED' || email.status === 'PROCESSING' ? tone.label : formatPillTime(time);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-xs leading-none whitespace-nowrap tabular-nums',
            tone.className,
            className,
          )}
        >
          <Icon className={cn('size-3', tone.spin && 'animate-spin')} aria-hidden />
          <span className="sr-only">{tone.label}: </span>
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent>{describe(email)}</TooltipContent>
    </Tooltip>
  );
}
