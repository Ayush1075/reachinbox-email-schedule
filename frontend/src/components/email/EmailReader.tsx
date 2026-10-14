'use client';

import { Archive, ChevronDown, ExternalLink, Star, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { FocusHeader } from '@/components/layout/FocusHeader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useArchiveEmail, useDeleteEmail, useEmailDetail, useStarEmail } from '@/hooks/useEmails';
import { API_URL, ApiError, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AttachmentCard } from './AttachmentCard';
import { StatusPill } from './StatusPill';

const IMAGE_TYPES = /^image\/(png|jpe?g|gif|webp)$/;

function HeaderAction({ label, children, ...props }: React.ComponentProps<typeof Button> & { label: string }) {
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

/** The reading view: one email, as the recipient will see it. */
export function EmailReader({ id }: { id: string }) {
  const router = useRouter();
  const { data: email, error, isPending } = useEmailDetail(id);
  const star = useStarEmail();
  const archive = useArchiveEmail();
  const remove = useDeleteEmail();
  const fail = (err: unknown) => toast.error(errorMessage(err));
  const mailbox = email && (email.status === 'SENT' || email.status === 'FAILED') ? '/dashboard/sent' : '/dashboard/scheduled';

  if (error instanceof ApiError && error.status === 404) {
    return (
      <>
        <FocusHeader title="Email not found" fallbackHref="/dashboard/scheduled" />
        <p className="px-6 text-sm text-muted-foreground">This email was deleted or never existed.</p>
      </>
    );
  }

  return (
    <>
      <FocusHeader
        title={email?.subject ?? <Skeleton className="h-6 w-72" />}
        fallbackHref={mailbox}
        actions={
          email && (
            <>
              <HeaderAction
                label={email.starred ? 'Unstar' : 'Star'}
                aria-pressed={email.starred}
                onClick={() => star.mutate({ id, starred: !email.starred }, { onError: fail })}
                className={cn(email.starred && 'text-amber-500 hover:text-amber-500')}
              >
                <Star className={cn(email.starred && 'fill-current')} aria-hidden />
              </HeaderAction>
              <HeaderAction
                label={email.archived ? 'Unarchive' : 'Archive'}
                onClick={() =>
                  archive.mutate(
                    { id, archived: !email.archived },
                    { onSuccess: () => router.push(mailbox), onError: fail },
                  )
                }
              >
                <Archive aria-hidden />
              </HeaderAction>
              <ConfirmDialog
                trigger={
                  <HeaderAction label="Delete">
                    <Trash2 aria-hidden />
                  </HeaderAction>
                }
                title="Delete this email?"
                description={
                  email.status === 'SENT' || email.status === 'FAILED'
                    ? 'It will be removed from your mailbox.'
                    : "It hasn't been sent yet, so deleting it also cancels the send."
                }
                confirmLabel="Delete"
                onConfirm={() => remove.mutate({ id }, { onSuccess: () => router.push(mailbox), onError: fail })}
              />
            </>
          )
        }
      />

      <div className="mx-auto w-full max-w-[860px] px-4 pb-16 sm:px-6 md:pl-[6.5rem]">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(error)}</AlertDescription>
          </Alert>
        ) : isPending ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading email">
            <Skeleton className="h-10 w-80" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : (
          <article>
            <div className="flex items-start gap-3.5">
              <span
                aria-hidden
                className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground"
              >
                {email.sender.label.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <p className="min-w-0 truncate text-sm">
                    <span className="font-semibold">{email.sender.label}</span>{' '}
                    <span className="text-muted-foreground">&lt;{email.sender.fromAddress}&gt;</span>
                  </p>
                  <time dateTime={email.sentAt ?? email.scheduledAt} className="text-xs text-muted-foreground">
                    {formatDateTime(email.sentAt ?? email.scheduledAt)}
                  </time>
                </div>
                <Popover>
                  <PopoverTrigger className="mt-0.5 flex items-center gap-1 rounded-sm text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    to {email.recipient}
                    <ChevronDown className="size-3" aria-hidden />
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-80 space-y-2 text-sm">
                    <dl className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1.5">
                      <dt className="text-muted-foreground">From</dt>
                      <dd className="truncate">{email.sender.fromAddress}</dd>
                      <dt className="text-muted-foreground">To</dt>
                      <dd className="truncate">{email.recipient}</dd>
                      <dt className="text-muted-foreground">Status</dt>
                      <dd>
                        <StatusPill email={email} />
                      </dd>
                      {email.attempts > 1 && (
                        <>
                          <dt className="text-muted-foreground">Attempts</dt>
                          <dd>{email.attempts}</dd>
                        </>
                      )}
                    </dl>
                    {email.lastError && <p className="text-xs text-destructive">{email.lastError}</p>}
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="mt-6 pl-0 md:pl-[3.1rem]">
              {email.status !== 'SENT' && (
                <div className="mb-5">
                  <StatusPill email={email} />
                </div>
              )}
              {email.bodyIsHtml ? (
                <div
                  className="prose-email text-sm leading-6 [&_a]:text-primary [&_a]:underline [&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-amber-300 [&_blockquote]:bg-amber-50 [&_blockquote]:px-4 [&_blockquote]:py-2 dark:[&_blockquote]:bg-amber-400/10 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_li]:my-0.5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6"
                  // Sanitized on the server (see backend services/html.ts) before it was ever stored.
                  dangerouslySetInnerHTML={{ __html: email.body }}
                />
              ) : (
                <p className="text-sm leading-6 whitespace-pre-wrap">{email.body}</p>
              )}

              {email.attachments.length > 0 && (
                <ul className="mt-8 flex flex-wrap gap-4" aria-label="Attachments">
                  {email.attachments.map((a) => (
                    <li key={a.id}>
                      <AttachmentCard
                        filename={a.filename}
                        size={a.size}
                        href={`${API_URL}/api/attachments/${a.id}`}
                        previewSrc={IMAGE_TYPES.test(a.contentType) ? `${API_URL}/api/attachments/${a.id}` : undefined}
                      />
                    </li>
                  ))}
                </ul>
              )}

              {email.previewUrl && (
                <Button asChild variant="outline" size="sm" className="mt-8 rounded-full">
                  <a href={email.previewUrl} target="_blank" rel="noreferrer">
                    View delivered message in Ethereal
                    <ExternalLink aria-hidden />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </Button>
              )}
            </div>
          </article>
        )}
      </div>
    </>
  );
}
