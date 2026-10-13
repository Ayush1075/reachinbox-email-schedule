import { cn } from '@/lib/utils';

/** Envelope inside a rounded square, with a dot for "scheduled". Mirrors app/icon.svg. */
export function ProductMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('size-6 shrink-0', className)}>
      <rect width="24" height="24" rx="6" className="fill-primary" />
      <path
        d="M6.5 9.25 12 13l5.5-3.75M7.25 7.5h9.5c.69 0 1.25.56 1.25 1.25v6.5c0 .69-.56 1.25-1.25 1.25h-9.5C6.56 16.5 6 15.94 6 15.25v-6.5c0-.69.56-1.25 1.25-1.25Z"
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary-foreground"
      />
      <circle cx="17.75" cy="6.25" r="2.25" className="fill-primary-foreground" />
    </svg>
  );
}

export function ProductName({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <ProductMark />
      <span className="text-[15px] font-semibold tracking-tight">ReachInbox</span>
    </span>
  );
}
