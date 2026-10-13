import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-shimmer rounded-[4px] bg-stone-200/70', className)} aria-hidden />;
}
