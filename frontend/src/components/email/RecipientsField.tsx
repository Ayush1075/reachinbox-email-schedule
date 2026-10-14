'use client';

import { Upload, X } from 'lucide-react';
import { type KeyboardEvent, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { isValidEmail, parseRecipients } from '@/lib/recipients';
import { cn } from '@/lib/utils';

const FILE_MAX_BYTES = 5 * 1024 * 1024;
const COLLAPSED_CHIPS = 3;

export type RecipientsSummary = { file: string | null; invalid: number; duplicates: number };

/** Splits pasted or typed text on commas, semicolons, whitespace and newlines. */
const tokenize = (text: string) => text.split(/[\s,;]+/).map((t) => t.trim().toLowerCase()).filter(Boolean);

/**
 * "To" row: address chips, free typing (Enter, comma or space commits) and
 * the "Upload List" button / drop zone for .csv and .txt files. Everything
 * is parsed in the browser; only valid, de-duplicated addresses are kept.
 */
export function RecipientsField({
  value,
  onChange,
  maxRecipients,
  invalid,
  id,
  describedBy,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  maxRecipients?: number;
  invalid?: boolean;
  id: string;
  describedBy?: string;
}) {
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [summary, setSummary] = useState<RecipientsSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Merges candidate addresses into the list, reporting what was skipped. */
  const addAddresses = (candidates: string[], file: string | null) => {
    const seen = new Set(value);
    const next = [...value];
    let invalidCount = 0;
    let duplicates = 0;
    for (const c of candidates) {
      if (!isValidEmail(c)) invalidCount++;
      else if (seen.has(c)) duplicates++;
      else {
        seen.add(c);
        next.push(c);
      }
    }
    const capped = maxRecipients ? next.slice(0, maxRecipients) : next;
    if (capped.length < next.length) toast.error(`At most ${maxRecipients?.toLocaleString()} recipients per campaign`);
    onChange(capped);
    if (file || invalidCount > 0 || duplicates > 0) setSummary({ file, invalid: invalidCount, duplicates });
    return invalidCount;
  };

  const commitDraft = () => {
    const tokens = tokenize(draft);
    if (tokens.length === 0) return;
    const bad = addAddresses(tokens, null);
    // Keep what failed validation in the box so it can be corrected.
    setDraft(bad > 0 ? tokens.filter((t) => !isValidEmail(t)).join(' ') : '');
  };

  const onFile = async (file: File) => {
    if (!/\.(csv|txt)$/i.test(file.name)) return void toast.error('Upload a .csv or .txt file');
    if (file.size > FILE_MAX_BYTES) return void toast.error('That file is larger than 5 MB');
    const parsed = parseRecipients(await file.text());
    if (parsed.valid.length === 0) return void toast.error('No valid email addresses found in that file');
    const before = value.length;
    addAddresses(parsed.valid, file.name);
    // Rows the parser rejected count as invalid; merge its tallies with ours.
    setSummary((s) => (s ? { ...s, invalid: s.invalid + parsed.invalid.length, duplicates: s.duplicates + parsed.duplicates } : s));
    toast.success(`${(parsed.valid.length).toLocaleString()} email addresses detected`, {
      description: before > 0 ? `Added to the ${before.toLocaleString()} already in the list.` : undefined,
    });
  };

  const { getRootProps, getInputProps, open, isDragActive } = useDropzone({
    noClick: true,
    noKeyboard: true,
    multiple: false,
    accept: { 'text/csv': ['.csv'], 'text/plain': ['.txt'] },
    onDropAccepted: ([file]) => file && void onFile(file),
    onDropRejected: () => toast.error('Upload a .csv or .txt file'),
  });

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === ' ') {
      if (draft.trim()) {
        e.preventDefault();
        commitDraft();
      }
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const hidden = expanded ? 0 : Math.max(0, value.length - COLLAPSED_CHIPS);
  const shown = expanded ? value : value.slice(0, COLLAPSED_CHIPS);

  return (
    <div>
      <div
        {...getRootProps()}
        className={cn(
          'flex min-h-11 flex-wrap items-center gap-1.5 border-b py-1.5 transition-colors',
          isDragActive && 'bg-primary-soft',
          invalid && 'border-destructive',
        )}
      >
        <input {...getInputProps()} aria-label="Upload recipient list" />
        <ul className="contents" aria-label="Recipients">
          {shown.map((address) => (
            <li
              key={address}
              className="inline-flex h-6 max-w-[220px] items-center gap-1 rounded-full border border-primary/40 bg-primary-soft pr-1 pl-2.5 text-xs text-primary-soft-foreground"
            >
              <span className="truncate">{address}</span>
              <button
                type="button"
                aria-label={`Remove ${address}`}
                onClick={() => onChange(value.filter((a) => a !== address))}
                className="rounded-full p-0.5 outline-none hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
          {hidden > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setExpanded(true)}
                aria-label={`Show ${hidden.toLocaleString()} more recipients`}
                className="inline-flex h-6 items-center rounded-full border border-primary/40 bg-primary-soft px-2.5 text-xs text-primary-soft-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                +{hidden.toLocaleString()}
              </button>
            </li>
          )}
          {expanded && value.length > COLLAPSED_CHIPS && (
            <li>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="px-1.5 text-xs text-muted-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                Show less
              </button>
            </li>
          )}
        </ul>
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="email"
          autoComplete="off"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commitDraft}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (/[\s,;]/.test(text.trim())) {
              e.preventDefault();
              addAddresses(tokenize(text), null);
            }
          }}
          placeholder={value.length === 0 ? 'recipient@example.com' : ''}
          aria-label="To"
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          className="h-7 min-w-[160px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={open}
          className="ml-auto h-8 gap-1.5 px-2 text-[13px] font-normal text-primary hover:bg-primary-soft hover:text-primary"
        >
          <Upload aria-hidden />
          Upload List
        </Button>
      </div>

      {(summary || value.length > 0) && (
        <p className="mt-1.5 text-xs text-muted-foreground" aria-live="polite">
          <span className="font-mono tabular-nums text-foreground">{value.length.toLocaleString()}</span>{' '}
          {value.length === 1 ? 'valid email address' : 'valid email addresses'}
          {summary?.file && <> from {summary.file}</>}
          {summary && summary.invalid > 0 && <span className="text-warning"> · {summary.invalid.toLocaleString()} invalid skipped</span>}
          {summary && summary.duplicates > 0 && <> · {summary.duplicates.toLocaleString()} duplicate{summary.duplicates === 1 ? '' : 's'} removed</>}
          {value.length > 0 && (
            <>
              {' · '}
              <button
                type="button"
                onClick={() => {
                  onChange([]);
                  setSummary(null);
                }}
                className="underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                Clear all
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
