import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Skeleton } from './Skeleton';

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Tailwind width / alignment classes applied to both th and td. */
  className?: string;
};

/**
 * Generic table shared by the Scheduled and Sent views — they differ only in
 * their column config. Sticky header, 48px rows, horizontal scroll on narrow
 * screens instead of breaking the layout.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading,
  empty,
  skeletonRows = 8,
  label,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  isLoading: boolean;
  empty: ReactNode;
  skeletonRows?: number;
  label: string;
}) {
  if (!isLoading && rows && rows.length === 0) return <>{empty}</>;

  return (
    <div className="max-h-[640px] overflow-auto">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm" aria-label={label} aria-busy={isLoading}>
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="shadow-[inset_0_-1px_0_var(--border)]">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn('h-10 px-4 text-[12px] font-medium tracking-wide whitespace-nowrap text-fg-muted uppercase', c.className)}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading || !rows
            ? Array.from({ length: skeletonRows }, (_, i) => (
                <tr key={i} className="h-12 border-b border-border last:border-0">
                  {columns.map((c, j) => (
                    <td key={c.key} className={cn('px-4', c.className)}>
                      <Skeleton className={cn('h-3.5', j === 0 ? 'w-44' : j === 1 ? 'w-56' : 'w-20')} />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => (
                <tr key={rowKey(row)} className="h-12 border-b border-border transition-colors duration-150 last:border-0 hover:bg-bg/70">
                  {columns.map((c) => (
                    <td key={c.key} className={cn('px-4 align-middle', c.className)}>
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
