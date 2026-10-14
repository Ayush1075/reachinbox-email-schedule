'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Clock, Loader2, Paperclip } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FocusHeader } from '@/components/layout/FocusHeader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useRemoveAttachment, useUploadAttachment } from '@/hooks/useAttachments';
import { useCreateCampaign } from '@/hooks/useCampaigns';
import { useServerConfig } from '@/hooks/useConfig';
import { useNow } from '@/hooks/useNow';
import { useSenders } from '@/hooks/useSenders';
import { ApiError, errorMessage } from '@/lib/api';
import { formatDateTime, formatDuration, formatNumber, formatTime, pluralize } from '@/lib/format';
import { previewSchedule } from '@/lib/schedulePreview';
import { cn } from '@/lib/utils';
import { AttachmentCard } from './AttachmentCard';
import { RecipientsField } from './RecipientsField';
import { RichTextEditor } from './RichTextEditor';
import { SendLaterPopover } from './SendLaterPopover';
import { SenderPicker } from './SenderPicker';

const MAX_FILES = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
/** A start time must be at least this far ahead. */
const MIN_LEAD_MS = 30_000;

const schema = z.object({
  senderIds: z.array(z.string()).min(1, 'Choose at least one sender'),
  recipients: z.array(z.string()).min(1, 'Add at least one recipient or upload a list'),
  subject: z.string().trim().min(1, 'Subject is required').max(200, 'Subject is limited to 200 characters'),
  delay: z.string().refine((v) => v === '' || (Number(v) >= 0 && Number(v) <= 3600), 'Between 0 and 3600 seconds'),
  hourlyLimit: z.string().refine((v) => v === '' || (Number.isInteger(Number(v)) && Number(v) > 0), 'A whole number above 0'),
  /** HTML from the editor; empty string when it has no visible text. */
  body: z.string().min(1, 'Write a message'),
});
type FormValues = z.infer<typeof schema>;

/** Clock reads live outside the component so render and handlers stay pure. */
const isTooSoon = (d: Date) => d.getTime() < Date.now() + MIN_LEAD_MS;
const startOrNow = (d: Date | null) => (d ?? new Date()).toISOString();

type Draft = { key: string; file: File; id?: string; previewSrc?: string; uploading: boolean };

const smallInput =
  'h-8 w-14 rounded-md border-transparent bg-field px-2 text-center font-mono text-xs shadow-none placeholder:text-muted-foreground md:text-xs dark:bg-field';

function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-destructive">
      {children}
    </p>
  );
}

export function ComposeForm() {
  const ids = useId();
  const router = useRouter();
  const config = useServerConfig();
  const senders = useSenders();
  const createCampaign = useCreateCampaign();
  const upload = useUploadAttachment();
  const removeUpload = useRemoveAttachment();
  const now = useNow();
  const fileInput = useRef<HTMLInputElement>(null);

  const [startAt, setStartAt] = useState<Date | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [startError, setStartError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { senderIds: [], recipients: [], subject: '', delay: '', hourlyLimit: '', body: '' },
  });
  const { errors } = form.formState;
  // useWatch (not form.watch) so the React Compiler can still memoize this component.
  const [recipients, senderIds, delay, hourlyLimit] = useWatch({ control: form.control, name: ['recipients', 'senderIds', 'delay', 'hourlyLimit'] });

  const activeSenders = useMemo(() => (senders.data ?? []).filter((s) => s.isActive), [senders.data]);
  const chosen = activeSenders.filter((s) => senderIds.includes(s.id));

  // Default to the first sender, as the design's single From field does; the user can add more.
  const firstSenderId = activeSenders[0]?.id;
  const { getValues, setValue } = form;
  useEffect(() => {
    if (firstSenderId && getValues('senderIds').length === 0) setValue('senderIds', [firstSenderId]);
  }, [firstSenderId, getValues, setValue]);

  const delayMs = delay === '' ? 0 : Math.round(Number(delay) * 1000);
  const limit = hourlyLimit === '' ? null : Number(hourlyLimit);
  const startMs = startAt?.getTime() ?? now + 10_000;

  const preview = (() => {
    if (now === 0 || recipients.length === 0 || chosen.length === 0 || Number.isNaN(delayMs)) return null;
    const limits = chosen.map((s) => (limit && limit > 0 ? Math.min(s.effectiveHourlyLimit, limit) : s.effectiveHourlyLimit));
    const plan = previewSchedule({
      startAt: new Date(startMs),
      recipients: recipients.length,
      delayBetweenMs: delayMs,
      senderLimits: limits,
      minSpacingMs: config.data?.minDelayBetweenEmailsMs ?? 0,
    });
    return plan && { ...plan, limits, startMs };
  })();

  const totalBytes = drafts.reduce((n, d) => n + d.file.size, 0);

  const addFiles = (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      if (drafts.length >= MAX_FILES) return void toast.error(`At most ${MAX_FILES} attachments`);
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`${file.name} is larger than 5 MB`);
        continue;
      }
      if (totalBytes + file.size > MAX_TOTAL_BYTES) {
        toast.error('Attachments are limited to 10 MB in total');
        continue;
      }
      const key = crypto.randomUUID();
      const previewSrc = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      setDrafts((d) => [...d, { key, file, previewSrc, uploading: true }]);
      upload.mutate(file, {
        onSuccess: (a) => setDrafts((d) => d.map((x) => (x.key === key ? { ...x, id: a.id, uploading: false } : x))),
        onError: (err) => {
          setDrafts((d) => d.filter((x) => x.key !== key));
          toast.error(`Could not upload ${file.name}`, { description: errorMessage(err) });
        },
      });
    }
    if (fileInput.current) fileInput.current.value = '';
  };

  const removeDraft = (draft: Draft) => {
    setDrafts((d) => d.filter((x) => x.key !== draft.key));
    if (draft.previewSrc) URL.revokeObjectURL(draft.previewSrc);
    if (draft.id) removeUpload.mutate(draft.id);
  };

  const submit = form.handleSubmit((v) => {
    if (drafts.some((d) => d.uploading)) return void toast.error('Wait for attachments to finish uploading');
    if (startAt && isTooSoon(startAt)) {
      setStartError('Pick a send time in the future.');
      return;
    }
    if (config.data && v.recipients.length > config.data.maxRecipients) {
      return void form.setError('recipients', { message: `At most ${config.data.maxRecipients.toLocaleString()} recipients per campaign` });
    }
    setStartError(null);

    createCampaign.mutate(
      {
        subject: v.subject.trim(),
        body: v.body,
        bodyFormat: 'html',
        recipients: v.recipients,
        startAt: startOrNow(startAt),
        delayBetweenMs: v.delay === '' ? 0 : Math.round(Number(v.delay) * 1000),
        hourlyLimit: v.hourlyLimit === '' ? null : Number(v.hourlyLimit),
        senderIds: chosen.map((s) => s.id),
        attachmentIds: drafts.flatMap((d) => (d.id ? [d.id] : [])),
      },
      {
        onSuccess: (res) => {
          toast.success(`${pluralize(res.campaign.totalRecipients, 'email')} scheduled`, {
            description: `Finishing around ${formatDateTime(res.plan.endsAt)}.`,
          });
          if (!res.enqueued) toast('Queue unavailable', { description: 'Emails are saved and will be enqueued automatically.' });
          drafts.forEach((d) => d.previewSrc && URL.revokeObjectURL(d.previewSrc));
          router.push('/dashboard/scheduled');
        },
        onError: (err) => {
          const bad = err instanceof ApiError ? (err.details as { invalid?: string[] } | undefined)?.invalid : undefined;
          toast.error(bad?.length ? `${errorMessage(err)}: ${bad.slice(0, 3).join(', ')}` : errorMessage(err));
        },
      },
    );
  });

  const sending = createCampaign.isPending;
  const err = (name: keyof FormValues) => ({ 'aria-invalid': errors[name] ? true : undefined, 'aria-describedby': errors[name] ? `${ids}-${name}-error` : undefined });
  const rowLabel = 'w-[52px] shrink-0 pt-0.5 text-[13px] text-foreground';

  const spillText = (() => {
    if (!preview) return null;
    const total = recipients.length;
    const perHour = preview.limits.reduce((a, b) => a + b, 0);
    return preview.deferredByCap > 0
      ? `Exceeds hourly capacity: ${formatNumber(Math.min(total, perHour))} send in the first window and ${formatNumber(preview.deferredByCap)} move to later hours.`
      : 'No rate-limit deferral expected.';
  })();

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <FocusHeader
        title="Compose New Email"
        fallbackHref="/dashboard/scheduled"
        showAccount={false}
        actions={
          <>
            <input ref={fileInput} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} aria-label="Attach files" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={drafts.length > 0 ? `Attach files (${drafts.length} attached)` : 'Attach files'}
                  onClick={() => fileInput.current?.click()}
                  className={cn('relative text-muted-foreground', drafts.length > 0 && 'text-primary')}
                >
                  <Paperclip aria-hidden />
                  {drafts.length > 0 && <span className="absolute -right-0.5 -bottom-0.5 text-[9px] leading-none font-medium">{drafts.length}</span>}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Attach files (up to {MAX_FILES}, 5 MB each)</TooltipContent>
            </Tooltip>

            <SendLaterPopover
              value={startAt}
              onChange={(d) => {
                setStartAt(d);
                setStartError(null);
              }}
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={startAt ? `Scheduled for ${formatDateTime(startAt)}. Change send time` : 'Choose when to send'}
                  className={cn('text-muted-foreground', startAt && 'text-primary')}
                >
                  <Clock aria-hidden />
                </Button>
              }
            />

            <Button
              type="submit"
              variant="outline"
              disabled={sending}
              className="ml-2 h-8 rounded-full border-primary bg-background px-5 text-[13px] font-normal text-primary shadow-none hover:bg-primary-soft hover:text-primary dark:bg-background"
            >
              {sending && <Loader2 className="animate-spin" aria-hidden />}
              {startAt ? 'Send Later' : 'Send'}
            </Button>
          </>
        }
      />

      <div className="mx-auto w-full max-w-[860px] px-4 pb-20 sm:px-6 md:pl-[6.5rem]">
        {startAt && (
          <p className="mb-3 text-xs text-muted-foreground" aria-live="polite">
            Scheduled for <span className="font-medium text-foreground">{formatDateTime(startAt)}</span>
          </p>
        )}
        {startError && (
          <Alert variant="destructive" className="mb-3">
            <AlertDescription>{startError}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-start gap-3 py-2">
          <Label htmlFor={`${ids}-from`} className={rowLabel}>
            From
          </Label>
          <div id={`${ids}-from`} className="min-w-0">
            <Controller
              control={form.control}
              name="senderIds"
              render={({ field }) => (
                <SenderPicker
                  value={senderIds}
                  onChange={field.onChange}
                  invalid={Boolean(errors.senderIds)}
                  describedBy={errors.senderIds ? `${ids}-senderIds-error` : undefined}
                />
              )}
            />
            <FieldError id={`${ids}-senderIds-error`}>{errors.senderIds?.message}</FieldError>
          </div>
        </div>

        <div className="flex items-start gap-3 py-0.5">
          <Label htmlFor={`${ids}-to`} className={cn(rowLabel, 'pt-3')}>
            To
          </Label>
          <div className="min-w-0 flex-1">
            <Controller
              control={form.control}
              name="recipients"
              render={({ field }) => (
                <RecipientsField
                  id={`${ids}-to`}
                  value={field.value}
                  onChange={field.onChange}
                  maxRecipients={config.data?.maxRecipients}
                  invalid={Boolean(errors.recipients)}
                  describedBy={errors.recipients ? `${ids}-recipients-error` : undefined}
                />
              )}
            />
            <FieldError id={`${ids}-recipients-error`}>{errors.recipients?.message}</FieldError>
          </div>
        </div>

        <div className="flex items-start gap-3 py-0.5">
          <Label htmlFor={`${ids}-subject`} className={cn(rowLabel, 'pt-3')}>
            Subject
          </Label>
          <div className="min-w-0 flex-1">
            <input
              id={`${ids}-subject`}
              type="text"
              placeholder="Subject"
              autoComplete="off"
              maxLength={200}
              className={cn('h-11 w-full border-b bg-transparent text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring', errors.subject && 'border-destructive')}
              {...err('subject')}
              {...form.register('subject')}
            />
            <FieldError id={`${ids}-subject-error`}>{errors.subject?.message}</FieldError>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-start gap-x-6 gap-y-3">
          <div className="flex items-center gap-3">
            <Label htmlFor={`${ids}-delay`} className="text-[13px]">
              Delay between 2 emails
            </Label>
            <div>
              <Input
                id={`${ids}-delay`}
                type="number"
                inputMode="decimal"
                min={0}
                max={3600}
                step="any"
                placeholder="00"
                title="Seconds between emails"
                className={smallInput}
                {...err('delay')}
                {...form.register('delay')}
              />
            </div>
            <span className="-ml-3 text-xs text-muted-foreground" aria-hidden>
              s
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor={`${ids}-limit`} className="text-[13px]">
              Hourly Limit
            </Label>
            <Input
              id={`${ids}-limit`}
              type="number"
              inputMode="numeric"
              min={1}
              placeholder="00"
              title={`Emails per sender per hour (default ${config.data?.defaultHourlyLimit ?? 200})`}
              className={smallInput}
              {...err('hourlyLimit')}
              {...form.register('hourlyLimit')}
            />
          </div>
        </div>
        <FieldError id={`${ids}-delay-error`}>{errors.delay?.message}</FieldError>
        <FieldError id={`${ids}-hourlyLimit-error`}>{errors.hourlyLimit?.message}</FieldError>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Leave blank to use the defaults: at least {formatDuration(config.data?.minDelayBetweenEmailsMs ?? 2000)} between emails and{' '}
          {config.data?.defaultHourlyLimit ?? 200} per sender per hour.
        </p>

        <div className="mt-4" aria-live="polite">
          {preview ? (
            <p
              className={cn(
                'rounded-lg px-3.5 py-2.5 text-xs leading-5',
                preview.deferredByCap > 0 ? 'bg-amber-50 text-amber-900 dark:bg-amber-400/10 dark:text-amber-200' : 'bg-field text-muted-foreground',
              )}
            >
              <span className="font-mono tabular-nums">{formatNumber(recipients.length)}</span> emails ·{' '}
              <span className="font-mono tabular-nums">{chosen.length}</span> {chosen.length === 1 ? 'sender' : 'senders'} ·{' '}
              {new Set(preview.limits).size === 1 ? `${preview.limits[0]}/hour each` : 'mixed hourly limits'} → first send{' '}
              {formatTime(preview.startMs)}, completes in ~{formatDuration(preview.durationMs)} at {formatTime(preview.endsAt)}. {spillText}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Add recipients to preview the delivery schedule.</p>
          )}
        </div>

        <div className="mt-5">
          <RichTextEditor
            id={`${ids}-body`}
            invalid={Boolean(errors.body)}
            onChange={(html, isEmpty) => form.setValue('body', isEmpty ? '' : html, { shouldValidate: form.formState.isSubmitted, shouldDirty: true })}
          />
          <FieldError id={`${ids}-body-error`}>{errors.body?.message}</FieldError>
        </div>

        {drafts.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-4" aria-label="Attachments">
            {drafts.map((d) => (
              <li key={d.key}>
                <AttachmentCard
                  filename={d.file.name}
                  size={d.file.size}
                  previewSrc={d.previewSrc}
                  uploading={d.uploading}
                  onRemove={() => removeDraft(d)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </form>
  );
}
