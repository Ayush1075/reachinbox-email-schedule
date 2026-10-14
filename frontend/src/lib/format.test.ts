import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, formatPillTime, formatRelative, pluralize } from './format';

describe('formatDuration', () => {
  it('uses the largest sensible unit', () => {
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(12 * 60_000)).toBe('12m');
    expect(formatDuration((3 * 60 + 5) * 60_000)).toBe('3h 5m');
    expect(formatDuration(52 * 3_600_000)).toBe('2d 4h');
  });
});

describe('formatRelative', () => {
  const now = Date.UTC(2026, 9, 14, 12, 0, 0);
  it('says "now" within five seconds either way', () => {
    expect(formatRelative(now + 2_000, now)).toBe('now');
    expect(formatRelative(now - 2_000, now)).toBe('now');
  });
  it('formats future and past', () => {
    expect(formatRelative(now + 12 * 60_000, now)).toBe('in 12m');
    expect(formatRelative(now - 3 * 60_000, now)).toBe('3m ago');
  });
});

describe('pluralize', () => {
  it('picks the right form and groups digits', () => {
    expect(pluralize(1, 'email')).toBe('1 email');
    expect(pluralize(0, 'email')).toBe('0 emails');
    expect(pluralize(1248, 'email')).toBe('1,248 emails');
    expect(pluralize(2, 'address', 'addresses')).toBe('2 addresses');
  });
});

describe('formatBytes', () => {
  it('scales units', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1.2 * 1024 * 1024)).toBe('1.2 MB');
  });
});

describe('formatPillTime', () => {
  it('shows weekday and seconds within a week', () => {
    const now = new Date(2026, 9, 14, 12, 0, 0).getTime();
    const tue = new Date(2026, 9, 20, 9, 15, 12);
    expect(formatPillTime(tue, now)).toBe('Tue 9:15:12 AM');
  });
  it('shows the date beyond a week', () => {
    const now = new Date(2026, 9, 14, 12, 0, 0).getTime();
    expect(formatPillTime(new Date(2026, 10, 3, 10, 23), now)).toBe('Nov 3, 10:23 AM');
  });
});
