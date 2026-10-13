import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

export function Pagination({
  page,
  limit,
  total,
  onPageChange,
}: {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-3">
      <p className="text-[13px] text-fg-muted">
        <span className="font-mono tabular-nums">
          {from.toLocaleString()}–{to.toLocaleString()}
        </span>{' '}
        of <span className="font-mono tabular-nums">{total.toLocaleString()}</span>
      </p>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </Button>
        <span className="px-2 font-mono text-[13px] text-fg-muted tabular-nums">
          {page} / {pages}
        </span>
        <Button variant="ghost" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= pages} aria-label="Next page">
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
