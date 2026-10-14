import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** One option of a segmented single-choice control (rendered inside role="radiogroup"). */
export function ToggleGroupItem({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'h-8 rounded-full px-4 text-sm transition-colors duration-150 ease-out outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        selected ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
