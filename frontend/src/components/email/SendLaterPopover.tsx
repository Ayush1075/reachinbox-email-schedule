'use client';

import { addDays, format, set, startOfDay } from 'date-fns';
import { CalendarIcon, Clock } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useNow } from '@/hooks/useNow';
import { formatDateTime, toTimeInput } from '@/lib/format';
import { cn } from '@/lib/utils';

/** A start time must be at least this far ahead so the job exists before it is due. */
const MIN_LEAD_MS = 30_000;

const atTomorrow = (hours: number, minutes = 0) => set(addDays(new Date(), 1), { hours, minutes, seconds: 0, milliseconds: 0 });

function presets() {
  return [
    { label: 'Tomorrow', at: atTomorrow(9) },
    { label: 'Tomorrow, 10:00 AM', at: atTomorrow(10) },
    { label: 'Tomorrow, 11:00 AM', at: atTomorrow(11) },
    { label: 'Tomorrow, 3:00 PM', at: atTomorrow(15) },
  ];
}

function SendLaterPanel({
  value,
  onChange,
  onClose,
}: {
  value: Date | null;
  onChange: (next: Date | null) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Date | null>(value);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const now = useNow();
  const tooSoon = draft !== null && draft.getTime() < now + MIN_LEAD_MS;

  const pickDay = (day: Date | undefined) => {
    if (!day) return;
    const base = draft ?? new Date(Date.now() + 60 * 60_000);
    setDraft(set(day, { hours: base.getHours(), minutes: base.getMinutes(), seconds: 0, milliseconds: 0 }));
  };

  const pickTime = (text: string) => {
    const [h, m] = text.split(':').map(Number);
    if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return;
    setDraft(set(draft ?? new Date(), { hours: h, minutes: m, seconds: 0, milliseconds: 0 }));
  };

  return (
    <>
        <p className="text-sm font-medium">Send Later</p>

        <div className="mt-3">
          <Label htmlFor="send-later-date" className="sr-only">
            Pick date and time
          </Label>
          <button
            id="send-later-date"
            type="button"
            onClick={() => setCalendarOpen((o) => !o)}
            aria-expanded={calendarOpen}
            className={cn(
              'flex h-9 w-full items-center justify-between border-b px-0.5 text-left text-xs outline-none focus-visible:border-ring',
              !draft && 'text-muted-foreground',
            )}
          >
            {draft ? formatDateTime(draft) : 'Pick date & time'}
            <CalendarIcon className="size-4 text-muted-foreground" aria-hidden />
          </button>
        </div>

        {calendarOpen && (
          <div className="mt-2 rounded-lg border">
            <Calendar mode="single" selected={draft ?? undefined} onSelect={pickDay} disabled={{ before: startOfDay(new Date()) }} />
            <div className="flex items-center gap-2 border-t px-3 py-2">
              <Clock className="size-4 text-muted-foreground" aria-hidden />
              <Label htmlFor="send-later-time" className="sr-only">
                Time
              </Label>
              <Input
                id="send-later-time"
                type="time"
                value={draft ? toTimeInput(draft) : ''}
                onChange={(e) => pickTime(e.target.value)}
                className="h-8 border-transparent bg-field text-sm shadow-none dark:bg-field"
              />
            </div>
          </div>
        )}
        {tooSoon && <p className="mt-1.5 text-xs text-destructive">Pick a time in the future.</p>}

        <ul className="mt-2">
          {presets().map((p) => (
            <li key={p.label}>
              <button
                type="button"
                onClick={() => setDraft(p.at)}
                className={cn(
                  'w-full rounded-md px-0.5 py-2 text-left text-xs outline-none hover:bg-field focus-visible:ring-2 focus-visible:ring-ring',
                  draft && format(draft, 'yyyy-MM-dd HH:mm') === format(p.at, 'yyyy-MM-dd HH:mm') && 'font-semibold text-primary',
                )}
              >
                {p.label}
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-center justify-end gap-2">
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mr-auto text-muted-foreground"
              onClick={() => {
                onChange(null);
                onClose();
              }}
            >
              Send now
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => onClose()}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!draft || tooSoon}
            className="rounded-full border-primary px-4 text-primary hover:bg-primary-soft hover:text-primary"
            onClick={() => {
              onChange(draft);
              onClose();
            }}
          >
            Done
          </Button>
        </div>
    </>
  );
}

/**
 * "Send Later" panel from the design.  is the chosen send time, or
 * null to send as soon as possible; Done commits, Cancel discards the draft.
 */
export function SendLaterPopover({
  value,
  onChange,
  trigger,
}: {
  value: Date | null;
  onChange: (next: Date | null) => void;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-[300px] gap-0 p-4">
        <SendLaterPanel value={value} onChange={onChange} onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
