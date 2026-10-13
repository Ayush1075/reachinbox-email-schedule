'use client';

import { Archive, Star, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useArchiveEmail, useCancelEmail, useDeleteEmail, useStarEmail } from '@/hooks/useEmails';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Email } from '@/types/api';
import { StatusPill } from './StatusPill';

/** Icon button with a tooltip. Extra props (from a dialog trigger, say) land on the button itself. */
function RowAction({ label, children, ...props }: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} className="text-muted-foreground hover:text-foreground" {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * A mailbox row as drawn in the design: "To:" · time pill · subject – preview · star.
 * The whole row opens the email; the pill, hover actions and star sit above
 * the link so they stay independently clickable.
 */
export function EmailRow({ email }: { email: Email }) {
  const star = useStarEmail();
  const archive = useArchiveEmail();
  const cancel = useCancelEmail();
  const remove = useDeleteEmail();
  const pending = email.status === 'SCHEDULED' || email.status === 'QUEUED' || email.status === 'RATE_LIMITED';
  const fail = (err: unknown) => toast.error(errorMessage(err));

  return (
    <li className="group relative flex min-h-14 flex-wrap items-center gap-x-1.5 gap-y-1 border-b py-3 pr-4 pl-6 transition-colors duration-150 ease-out hover:bg-field/60 md:flex-nowrap md:py-0">
      <Link
        href={`/dashboard/emails/${email.id}`}
        className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        aria-label={`${email.subject}, to ${email.recipient}`}
      />
      <span className="w-full truncate pr-4 text-sm md:w-[202px] md:shrink-0" title={email.recipient}>
        To: {email.recipient}
      </span>
      <StatusPill email={email} className="relative" />
      <span className="min-w-0 flex-1 basis-full truncate text-sm md:basis-auto">
        <span>{email.subject}</span>
        {email.preview && <span className="text-muted-foreground"> - {email.preview}</span>}
      </span>

      <span className="relative flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 max-md:hidden">
        {pending ? (
          <ConfirmDialog
            trigger={
              <RowAction label="Cancel email">
                <X aria-hidden />
              </RowAction>
            }
            title="Cancel this email?"
            description={`It won't be sent to ${email.recipient}. Other emails in the campaign are unaffected.`}
            confirmLabel="Cancel email"
            onConfirm={() => cancel.mutate({ id: email.id }, { onSuccess: () => toast.success('Email cancelled'), onError: fail })}
          />
        ) : (
          <>
            <RowAction
              label={email.archived ? 'Unarchive' : 'Archive'}
              onClick={() => archive.mutate({ id: email.id, archived: !email.archived }, { onError: fail })}
            >
              <Archive aria-hidden />
            </RowAction>
            <ConfirmDialog
              trigger={
                <RowAction label="Delete">
                  <Trash2 aria-hidden />
                </RowAction>
              }
              title="Delete this email?"
              description="It will be removed from your mailbox. Delivery history in Ethereal is unaffected."
              confirmLabel="Delete"
              onConfirm={() => remove.mutate({ id: email.id }, { onError: fail })}
            />
          </>
        )}
      </span>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={email.starred ? 'Unstar' : 'Star'}
        aria-pressed={email.starred}
        onClick={() => star.mutate({ id: email.id, starred: !email.starred }, { onError: fail })}
        className={cn('relative ml-auto text-muted-foreground/70 hover:text-foreground', email.starred && 'text-amber-500 hover:text-amber-500')}
      >
        <Star className={cn('size-4', email.starred && 'fill-current')} aria-hidden />
      </Button>
    </li>
  );
}
