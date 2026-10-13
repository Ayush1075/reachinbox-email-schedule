'use client';

import { CheckCircle2, Clock, FileText, Plus, Upload, X } from 'lucide-react';
import { type DragEvent, type FormEvent, useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/legacy-ui/Button';
import { Field, Input, Textarea } from '@/components/legacy-ui/Field';
import { Modal } from '@/components/legacy-ui/Modal';
import { Skeleton } from '@/components/legacy-ui/Skeleton';
import { useCreateCampaign } from '@/hooks/useCampaigns';
import { useServerConfig } from '@/hooks/useConfig';
import { useCreateEtherealSender, useSenders } from '@/hooks/useSenders';
import { ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, formatDuration, formatTime, toDateTimeLocal } from '@/lib/format';
import { type ParsedRecipients, parseRecipients } from '@/lib/recipients';
import { previewSchedule } from '@/lib/schedulePreview';

const BODY_MAX = 50_000;
const SUBJECT_MAX = 300;
const FILE_MAX_BYTES = 5 * 1024 * 1024;

/** Default start: five minutes from now (local time, for datetime-local). */
const defaultStartAt = () => toDateTimeLocal(new Date(Date.now() + 5 * 60_000));
/** Allow a minute of slack so a just-submitted "now" isn't rejected. */
const isPast = (d: Date) => d.getTime() < Date.now() - 60_000;

type Errors = Partial<Record<'subject' | 'body' | 'recipients' | 'startAt' | 'delay' | 'hourlyLimit' | 'senders', string>>;

function RecipientsDrop({
  id,
  file,
  parsed,
  onFile,
  onClear,
  invalid,
}: {
  id: string;
  file: string | null;
  parsed: ParsedRecipients | null;
  onFile: (f: File) => void;
  onClear: () => void;
  invalid: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };

  if (parsed && file) {
    return (
      <div className="rounded-[8px] border border-border bg-bg/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <FileText className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{file}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm">
                <CheckCircle2 className="size-4 text-success" aria-hidden />
                <span>
                  <span className="font-mono font-semibold tabular-nums">{parsed.valid.length.toLocaleString()}</span> valid email address
                  {parsed.valid.length === 1 ? '' : 'es'} detected
                </span>
              </p>
              {(parsed.invalid.length > 0 || parsed.duplicates > 0) && (
                <p className="mt-1 text-[13px] text-fg-muted">
                  {parsed.invalid.length > 0 && (
                    <span className="text-warning">
                      {parsed.invalid.length.toLocaleString()} invalid row{parsed.invalid.length === 1 ? '' : 's'} skipped
                    </span>
                  )}
                  {parsed.invalid.length > 0 && parsed.duplicates > 0 && ' · '}
                  {parsed.duplicates > 0 && `${parsed.duplicates.toLocaleString()} duplicate${parsed.duplicates === 1 ? '' : 's'} removed`}
                </p>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClear} aria-label="Remove file">
            <X className="size-4" />
          </Button>
        </div>

        {parsed.valid.length > 0 && (
          <ul className="mt-3 space-y-0.5 border-t border-border pt-3 font-mono text-[12px] text-fg-muted" aria-label="First recipients">
            {parsed.valid.slice(0, 5).map((r) => (
              <li key={r} className="truncate">
                {r}
              </li>
            ))}
            {parsed.valid.length > 5 && <li>+ {(parsed.valid.length - 5).toLocaleString()} more</li>}
          </ul>
        )}
        {parsed.invalid.length > 0 && (
          <details className="mt-2 text-[12px] text-fg-muted">
            <summary className="cursor-pointer select-none">Show invalid rows</summary>
            <ul className="mt-1 max-h-24 overflow-y-auto font-mono">
              {parsed.invalid.slice(0, 50).map((r) => (
                <li key={r.row}>
                  row {r.row}: {r.value || '(empty)'}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        'flex flex-col items-center justify-center rounded-[8px] border border-dashed px-4 py-7 text-center transition-colors duration-150',
        dragging ? 'border-primary bg-primary/5' : invalid ? 'border-danger/60' : 'border-stone-300 hover:border-stone-400',
      )}
    >
      <Upload className="size-5 text-fg-muted" aria-hidden />
      <p className="mt-2 text-sm">
        Drop a <span className="font-mono">.csv</span> or <span className="font-mono">.txt</span> file, or{' '}
        <button type="button" onClick={() => inputRef.current?.click()} className="font-medium text-primary hover:text-primary/90">
          browse
        </button>
      </p>
      <p className="mt-0.5 text-[12px] text-fg-muted">One address per line, or a CSV with an “email” column</p>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

export function ComposeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ids = useId();
  const senders = useSenders();
  const config = useServerConfig();
  const createSender = useCreateEtherealSender();
  const createCampaign = useCreateCampaign();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedRecipients | null>(null);
  const [startAt, setStartAt] = useState(defaultStartAt);
  const [delaySec, setDelaySec] = useState('2');
  const [hourlyLimit, setHourlyLimit] = useState('');
  const [selected, setSelected] = useState<string[] | null>(null);
  const [errors, setErrors] = useState<Errors>({});

  const activeSenders = useMemo(() => (senders.data ?? []).filter((s) => s.isActive), [senders.data]);
  // Default to every sender until the user changes the selection.
  const senderIds = selected ?? activeSenders.map((s) => s.id);
  const chosen = activeSenders.filter((s) => senderIds.includes(s.id));

  const limitNum = hourlyLimit.trim() ? Number(hourlyLimit) : null;
  const delayMs = Math.round(Number(delaySec) * 1000);
  const startDate = new Date(startAt);

  // Cheap O(n) simulation (n ≤ 10k), so it simply recomputes on every render.
  const preview = (() => {
    if (!parsed || chosen.length === 0 || Number.isNaN(startDate.getTime()) || !(delayMs >= 0)) return null;
    const limits = chosen.map((s) => (limitNum && limitNum > 0 ? Math.min(s.effectiveHourlyLimit, limitNum) : s.effectiveHourlyLimit));
    const result = previewSchedule({
      startAt: startDate,
      recipients: parsed.valid.length,
      delayBetweenMs: delayMs,
      senderLimits: limits,
      minSpacingMs: config.data?.minDelayBetweenEmailsMs ?? 0,
    });
    return result && { ...result, limits };
  })();

  const reset = () => {
    setSubject('');
    setBody('');
    setFileName(null);
    setParsed(null);
    setStartAt(defaultStartAt());
    setDelaySec('2');
    setHourlyLimit('');
    setSelected(null);
    setErrors({});
  };

  const onFile = async (f: File) => {
    if (!/\.(csv|txt)$/i.test(f.name)) return void toast.error('Please upload a .csv or .txt file');
    if (f.size > FILE_MAX_BYTES) return void toast.error('File is larger than 5 MB');
    const result = parseRecipients(await f.text());
    if (result.valid.length === 0) toast.error('No valid email addresses found in that file');
    setFileName(f.name);
    setParsed(result);
    setErrors((e) => ({ ...e, recipients: undefined }));
  };

  const validate = (): Errors => {
    const e: Errors = {};
    if (!subject.trim()) e.subject = 'Subject is required';
    if (!body.trim()) e.body = 'Body is required';
    if (!parsed || parsed.valid.length === 0) e.recipients = 'Upload a file with at least one valid address';
    else if (config.data && parsed.valid.length > config.data.maxRecipients)
      e.recipients = `At most ${config.data.maxRecipients.toLocaleString()} recipients per campaign`;
    if (Number.isNaN(startDate.getTime())) e.startAt = 'Pick a start time';
    else if (isPast(startDate)) e.startAt = 'Start time is in the past';
    if (!(delayMs >= 0) || delayMs > 3_600_000) e.delay = 'Between 0 and 3600 seconds';
    if (limitNum !== null && !(Number.isInteger(limitNum) && limitNum > 0)) e.hourlyLimit = 'Whole number above 0';
    if (chosen.length === 0) e.senders = 'Select at least one sender';
    return e;
  };

  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    createCampaign.mutate(
      {
        subject: subject.trim(),
        body,
        recipients: parsed!.valid,
        startAt: startDate.toISOString(),
        delayBetweenMs: delayMs,
        hourlyLimit: limitNum,
        senderIds: chosen.map((s) => s.id),
        bodyFormat: 'text',
        attachmentIds: [],
      },
      {
        onSuccess: (res) => {
          toast.success(
            `${res.campaign.totalRecipients.toLocaleString()} emails scheduled · finishing around ${formatDateTime(res.plan.endsAt)}`,
          );
          if (!res.enqueued) toast('Queue unavailable — emails are saved and will be enqueued automatically.', { icon: '!' });
          reset();
          onClose();
        },
        onError: (err) => {
          const invalid = err instanceof ApiError ? (err.details as { invalid?: string[] } | undefined)?.invalid : undefined;
          toast.error(invalid?.length ? `${errorMessage(err)}: ${invalid.slice(0, 3).join(', ')}` : errorMessage(err));
        },
      },
    );
  };

  const field = (name: keyof Errors) => ({
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `${ids}-${name}-error` : undefined,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Compose new email"
      description="Schedule one email to every address in your list."
      className="sm:max-w-[720px]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={createCampaign.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={`${ids}-form`} loading={createCampaign.isPending}>
            {parsed?.valid.length ? `Schedule ${parsed.valid.length.toLocaleString()} emails` : 'Schedule'}
          </Button>
        </>
      }
    >
      <form id={`${ids}-form`} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <Field id={`${ids}-subject`} label="Subject" error={errors.subject}>
          <Input
            id={`${ids}-subject`}
            data-autofocus
            value={subject}
            maxLength={SUBJECT_MAX}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Quick question about your outbound setup"
            {...field('subject')}
          />
        </Field>

        <Field
          id={`${ids}-body`}
          label="Body"
          error={errors.body}
          trailing={
            <span className={cn('font-mono text-[12px] tabular-nums', body.length > BODY_MAX * 0.9 ? 'text-warning' : 'text-fg-muted')}>
              {body.length.toLocaleString()} / {BODY_MAX.toLocaleString()}
            </span>
          }
        >
          <Textarea
            id={`${ids}-body`}
            value={body}
            maxLength={BODY_MAX}
            rows={6}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a plain-text message…"
            {...field('body')}
          />
        </Field>

        <Field id={`${ids}-recipients`} label="Recipients" error={errors.recipients}>
          <RecipientsDrop
            id={`${ids}-recipients`}
            file={fileName}
            parsed={parsed}
            onFile={(f) => void onFile(f)}
            onClear={() => {
              setFileName(null);
              setParsed(null);
            }}
            invalid={Boolean(errors.recipients)}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field id={`${ids}-startAt`} label="Start time" error={errors.startAt}>
            <Input
              id={`${ids}-startAt`}
              type="datetime-local"
              value={startAt}
              min={toDateTimeLocal(new Date())}
              onChange={(e) => setStartAt(e.target.value)}
              className="font-mono text-[13px]"
              {...field('startAt')}
            />
          </Field>
          <Field id={`${ids}-delay`} label="Delay between (s)" error={errors.delay}>
            <Input
              id={`${ids}-delay`}
              type="number"
              inputMode="decimal"
              min={0}
              max={3600}
              step="0.5"
              value={delaySec}
              onChange={(e) => setDelaySec(e.target.value)}
              className="font-mono"
              {...field('delay')}
            />
          </Field>
          <Field id={`${ids}-hourlyLimit`} label="Hourly limit / sender" error={errors.hourlyLimit}>
            <Input
              id={`${ids}-hourlyLimit`}
              type="number"
              inputMode="numeric"
              min={1}
              value={hourlyLimit}
              onChange={(e) => setHourlyLimit(e.target.value)}
              placeholder={`Default (${config.data?.defaultHourlyLimit ?? 200})`}
              className="font-mono"
              {...field('hourlyLimit')}
            />
          </Field>
        </div>

        <Field
          id={`${ids}-senders`}
          label="Senders"
          error={errors.senders}
          hint={chosen.length > 1 ? 'Emails rotate across selected senders round-robin.' : undefined}
          trailing={
            activeSenders.length > 0 && (
              <button
                type="button"
                disabled={createSender.isPending}
                onClick={() =>
                  createSender.mutate(undefined, {
                    onSuccess: (s) => toast.success(`Added ${s.label}`),
                    onError: (err) => toast.error(errorMessage(err)),
                  })
                }
                className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:text-primary/90 disabled:opacity-50"
              >
                <Plus className="size-3.5" aria-hidden />
                {createSender.isPending ? 'Creating…' : 'Add Ethereal sender'}
              </button>
            )
          }
        >
          {senders.isPending ? (
            <Skeleton className="h-14 w-full" />
          ) : activeSenders.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-[8px] border border-border bg-bg/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-fg-muted">No senders yet. Create a free Ethereal test mailbox — nothing reaches real inboxes.</p>
              <Button
                variant="secondary"
                size="sm"
                loading={createSender.isPending}
                onClick={() =>
                  createSender.mutate(undefined, {
                    onSuccess: (s) => toast.success(`Added ${s.label} <${s.fromAddress}>`),
                    onError: (err) => toast.error(errorMessage(err)),
                  })
                }
              >
                Create Ethereal sender
              </Button>
            </div>
          ) : (
            <div id={`${ids}-senders`} role="group" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {activeSenders.map((s) => {
                const checked = senderIds.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-[8px] border p-3 transition-colors duration-150',
                      checked ? 'border-primary/50 bg-primary/[0.03]' : 'border-border hover:border-stone-300',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setSelected(checked ? senderIds.filter((x) => x !== s.id) : [...senderIds, s.id])}
                      className="mt-0.5 size-4 accent-[var(--primary)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{s.label}</span>
                        <span className="shrink-0 font-mono text-[11px] text-fg-muted">{s.effectiveHourlyLimit}/h</span>
                      </span>
                      <span className="block truncate font-mono text-[12px] text-fg-muted">{s.fromAddress}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </Field>

        <div aria-live="polite" className="rounded-[8px] border border-border bg-bg/60 px-4 py-3">
          {preview && parsed ? (
            <div className="flex items-start gap-2.5">
              <Clock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <div className="text-sm">
                <p>
                  <span className="font-mono tabular-nums">{parsed.valid.length.toLocaleString()}</span> emails ·{' '}
                  <span className="font-mono tabular-nums">{chosen.length}</span> sender{chosen.length === 1 ? '' : 's'} ·{' '}
                  {new Set(preview.limits).size === 1 ? (
                    <>
                      <span className="font-mono tabular-nums">{preview.limits[0]}</span>/hour each
                    </>
                  ) : (
                    'mixed hourly limits'
                  )}{' '}
                  → completes in ~<span className="font-medium">{formatDuration(preview.durationMs)}</span>, finishing around{' '}
                  <span className="font-medium">{preview.durationMs > 20 * 3_600_000 ? formatDateTime(preview.endsAt) : formatTime(preview.endsAt)}</span>.
                </p>
                {preview.deferredByCap > 0 && (
                  <p className="mt-1 text-[13px] text-fg-muted">
                    Hourly limits spread this campaign across {preview.hourWindows} hour windows — nothing is dropped.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-fg-muted">
              <Clock className="size-4" aria-hidden />
              Upload recipients and pick senders to see the delivery schedule.
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
