import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary/90 disabled:bg-primary/50',
  secondary: 'border border-border bg-surface text-fg hover:bg-bg disabled:text-fg-muted',
  ghost: 'text-fg-muted hover:bg-bg hover:text-fg disabled:opacity-50',
  danger: 'border border-border bg-surface text-danger hover:border-danger/40 hover:bg-danger/5 disabled:opacity-50',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

export function Button({ variant = 'primary', size = 'md', loading, disabled, className, children, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[6px] font-medium whitespace-nowrap transition-colors duration-150 ease-out disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
