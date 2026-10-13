import { differenceInCalendarDays, differenceInMilliseconds, format, isSameYear, isToday } from 'date-fns';

type DateInput = string | number | Date;

const numberFormat = new Intl.NumberFormat();

/** "Oct 14, 4:05 PM" — the year only appears when it isn't the current one. */
export function formatDateTime(value: DateInput): string {
  const d = new Date(value);
  return format(d, isSameYear(d, new Date()) ? 'MMM d, h:mm a' : 'MMM d, yyyy, h:mm a');
}

/** Mailbox pill time: "Tue 9:15:12 AM" within a week either side, otherwise "Oct 21, 9:15 AM". */
export function formatPillTime(value: DateInput, now: number = Date.now()): string {
  const d = new Date(value);
  if (Math.abs(differenceInCalendarDays(d, now)) < 7) return format(d, 'EEE h:mm:ss a');
  return format(d, isSameYear(d, now) ? 'MMM d, h:mm a' : 'MMM d, yyyy');
}

/** "4:05 PM" today, otherwise "Oct 14, 4:05 PM". */
export function formatTime(value: DateInput): string {
  const d = new Date(value);
  return isToday(d) ? format(d, 'h:mm a') : formatDateTime(d);
}

/** Compact duration: 45s, 12m, 3h 5m, 2d 4h. */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

/** "in 12m" / "3m ago" / "now". */
export function formatRelative(value: DateInput, now: number = Date.now()): string {
  const diff = differenceInMilliseconds(new Date(value), now);
  if (Math.abs(diff) < 5_000) return 'now';
  return diff > 0 ? `in ${formatDuration(diff)}` : `${formatDuration(-diff)} ago`;
}

export function formatNumber(n: number): string {
  return numberFormat.format(n);
}

/** "1 email", "1,248 emails". */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

/** Local value for <input type="datetime-local">. */
export function toDateTimeLocal(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

/** Local "HH:mm" for an <input type="time">. */
export function toTimeInput(date: Date): string {
  return format(date, 'HH:mm');
}

/** "1.2 MB", "340 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
