import { describe, expect, it } from 'vitest';
import { isValidEmail, parseRecipients } from './recipients';
import { previewSchedule } from './schedulePreview';

describe('parseRecipients', () => {
  it('reads a headerless single-column list', () => {
    const r = parseRecipients('a@x.com\nb@x.com\n\nc@x.com\n');
    expect(r.valid).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
    expect(r.hasHeader).toBe(false);
    expect(r.totalRows).toBe(3);
  });

  it('uses a recognised header to pick the email column', () => {
    const csv = 'Name,Email Address,Company\nAda,ADA@x.com,Acme\nBob,bob@x.com,Beta\n';
    const r = parseRecipients(csv);
    expect(r.hasHeader).toBe(true);
    expect(r.column).toBe(1);
    expect(r.valid).toEqual(['ada@x.com', 'bob@x.com']);
  });

  it('detects the email column without a header', () => {
    const r = parseRecipients('Ada,ada@x.com\nBob,bob@x.com\n');
    expect(r.column).toBe(1);
    expect(r.valid).toHaveLength(2);
  });

  it('treats an unrecognised non-email first row as a header', () => {
    const r = parseRecipients('contact\nada@x.com\nbob@x.com');
    expect(r.hasHeader).toBe(true);
    expect(r.valid).toEqual(['ada@x.com', 'bob@x.com']);
    expect(r.invalid).toEqual([]);
  });

  it('reports invalid rows with 1-based row numbers and dedupes case-insensitively', () => {
    const r = parseRecipients('email\na@x.com\nnot-an-email\nA@X.com\nb@x\n');
    expect(r.valid).toEqual(['a@x.com']);
    expect(r.duplicates).toBe(1);
    expect(r.invalid).toEqual([
      { row: 3, value: 'not-an-email' },
      { row: 5, value: 'b@x' },
    ]);
  });

  it('handles semicolon delimiters, quotes, BOM and CRLF', () => {
    const r = parseRecipients('﻿email;name\r\n"a@x.com";"A, Person"\r\nb@x.com;B\r\n');
    expect(r.valid).toEqual(['a@x.com', 'b@x.com']);
  });

  it('matches the server email rules', () => {
    expect(isValidEmail('first.last+tag@sub.example.co')).toBe(true);
    expect(isValidEmail('.a@x.com')).toBe(false);
    expect(isValidEmail('a..b@x.com')).toBe(false);
    expect(isValidEmail('a@x.c')).toBe(false);
  });
});

describe('previewSchedule', () => {
  const start = new Date('2026-10-13T10:00:00Z');

  it('spreads 1000 emails over 2 senders at 200/h across 3 hour windows', () => {
    const p = previewSchedule({ startAt: start, recipients: 1000, delayBetweenMs: 0, senderLimits: [200, 200], minSpacingMs: 2000 })!;
    expect(p.hourWindows).toBe(3);
    expect(p.endsAt.getTime()).toBeGreaterThanOrEqual(Date.parse('2026-10-13T12:00:00Z'));
    expect(p.endsAt.getTime()).toBeLessThan(Date.parse('2026-10-13T13:00:00Z'));
  });

  it('is limited by delay when well under the cap', () => {
    const p = previewSchedule({ startAt: start, recipients: 10, delayBetweenMs: 60_000, senderLimits: [200], minSpacingMs: 2000 })!;
    expect(p.durationMs).toBe(9 * 60_000);
    expect(p.deferredByCap).toBe(0);
  });

  it('returns null without recipients or senders', () => {
    expect(previewSchedule({ startAt: start, recipients: 0, delayBetweenMs: 0, senderLimits: [10], minSpacingMs: 0 })).toBeNull();
    expect(previewSchedule({ startAt: start, recipients: 5, delayBetweenMs: 0, senderLimits: [], minSpacingMs: 0 })).toBeNull();
  });
});
