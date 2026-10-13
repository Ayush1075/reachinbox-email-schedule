import type { InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const control =
  'w-full rounded-[8px] border border-border bg-surface px-3 text-sm text-fg placeholder:text-fg-muted/70 transition-colors duration-150 hover:border-stone-300 focus:border-accent focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-accent/15 disabled:bg-bg disabled:text-fg-muted aria-invalid:border-danger aria-invalid:focus:ring-danger/15';

export function Input({ className, ref, ...props }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={cn(control, 'h-9', className)} {...props} />;
}

export function Textarea({ className, ref, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea ref={ref} className={cn(control, 'min-h-28 resize-y py-2 leading-relaxed', className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(control, 'h-9 cursor-pointer pr-8', className)} {...props}>
      {children}
    </select>
  );
}

/** Label + control + hint/error, wired for accessibility. */
export function Field({
  id,
  label,
  hint,
  error,
  trailing,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[12px] font-medium tracking-wide text-fg-muted uppercase">
          {label}
        </label>
        {trailing}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
