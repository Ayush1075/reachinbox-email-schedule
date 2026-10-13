'use client';

import type { KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

export type TabItem<K extends string> = { key: K; label: string; count?: number };

/** Underline tabs with arrow-key navigation (WAI-ARIA tabs pattern). */
export function Tabs<K extends string>({
  items,
  value,
  onChange,
  idPrefix,
}: {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  idPrefix: string;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex((t) => t.key === value);
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
    if (next === null) return;
    const item = items[(next + items.length) % items.length]!;
    onChange(item.key);
    document.getElementById(`${idPrefix}-tab-${item.key}`)?.focus();
  };

  return (
    <div role="tablist" className="flex gap-6 border-b border-border" onKeyDown={onKeyDown}>
      {items.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            id={`${idPrefix}-tab-${t.key}`}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.key)}
            className={cn(
              '-mb-px flex h-10 items-center gap-2 border-b-2 text-sm font-medium transition-colors duration-150',
              active ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-px font-mono text-[11px] tabular-nums',
                  active ? 'bg-accent/10 text-accent' : 'bg-stone-100 text-fg-muted',
                )}
              >
                {t.count.toLocaleString()}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
