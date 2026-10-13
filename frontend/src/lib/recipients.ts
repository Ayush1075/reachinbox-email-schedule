import Papa from 'papaparse';

/**
 * Same pattern the API validates with (zod v3 `z.string().email()`), so the
 * "N valid addresses" count shown before submit is exactly what the server
 * will accept.
 */
const EMAIL_RE = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9-]*\.)+[A-Z]{2,}$/i;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

export type ParsedRecipients = {
  valid: string[];
  invalid: { row: number; value: string }[];
  duplicates: number;
  /** Non-empty data rows examined (header excluded). */
  totalRows: number;
  hasHeader: boolean;
  column: number;
};

const HEADER_RE = /^\s*(e-?mail(\s*address)?|recipient|to)\s*$/i;

/**
 * Parse a .csv or .txt list of recipients.
 *
 * - Header row optional: a first-row cell like "email" / "Email Address" marks
 *   the email column; otherwise the column with the most valid addresses wins.
 * - Headerless single-column files (one address per line) just work.
 * - Values are trimmed and lower-cased, invalid ones reported with their
 *   1-based row number, and duplicates removed keeping first occurrence order.
 */
export function parseRecipients(text: string): ParsedRecipients {
  const { data } = Papa.parse<string[]>(text.replace(/^﻿/, ''), {
    skipEmptyLines: 'greedy',
    delimitersToGuess: [',', ';', '\t', '|'],
  });
  const rows = data.map((r) => r.map((c) => (c ?? '').trim()));

  let column = 0;
  let hasHeader = false;
  const first = rows[0] ?? [];
  const headerIdx = first.findIndex((c) => HEADER_RE.test(c));
  if (headerIdx !== -1) {
    column = headerIdx;
    hasHeader = true;
  } else {
    const width = Math.max(0, ...rows.slice(0, 50).map((r) => r.length));
    let best = -1;
    for (let c = 0; c < width; c++) {
      const score = rows.slice(0, 50).filter((r) => isValidEmail(r[c] ?? '')).length;
      if (score > best) {
        best = score;
        column = c;
      }
    }
    // A first row with no email anywhere is a header we didn't recognise.
    hasHeader = rows.length > 1 && !first.some((c) => isValidEmail(c)) && first.some((c) => c.length > 0);
  }

  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: { row: number; value: string }[] = [];
  let duplicates = 0;
  let totalRows = 0;

  rows.forEach((r, i) => {
    if (hasHeader && i === 0) return;
    const value = (r[column] ?? '').toLowerCase();
    if (!value) return;
    totalRows++;
    if (!isValidEmail(value)) invalid.push({ row: i + 1, value: r[column] ?? '' });
    else if (seen.has(value)) duplicates++;
    else {
      seen.add(value);
      valid.push(value);
    }
  });

  return { valid, invalid, duplicates, totalRows, hasHeader, column };
}
