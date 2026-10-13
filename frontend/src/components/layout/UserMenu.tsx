'use client';

import { ChevronDown, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useLogout } from '@/hooks/useAuth';
import { errorMessage } from '@/lib/api';
import type { User } from '@/types/api';

function Avatar({ user }: { user: User }) {
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return user.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote Google avatar, tiny, no optimisation needed
    <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-7 rounded-full border border-border object-cover" />
  ) : (
    <span className="flex size-7 items-center justify-center rounded-full bg-stone-200 text-[11px] font-semibold text-fg-muted">{initials}</span>
  );
}

export function UserMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const logout = useLogout();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-[6px] py-1 pr-1.5 pl-1 transition-colors duration-150 hover:bg-bg"
      >
        <Avatar user={user} />
        <span className="hidden max-w-36 truncate text-sm font-medium md:block">{user.name}</span>
        <ChevronDown className="size-3.5 text-fg-muted" aria-hidden />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1.5 w-64 rounded-[8px] border border-border bg-surface py-1 shadow-[0_8px_30px_rgb(28_25_23/0.08)]">
          <div className="border-b border-border px-3 py-2.5">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate font-mono text-[12px] text-fg-muted">{user.email}</p>
          </div>
          <button
            role="menuitem"
            type="button"
            disabled={logout.isPending}
            onClick={() =>
              logout.mutate(undefined, {
                onSuccess: () => router.replace('/'),
                onError: (err) => toast.error(errorMessage(err)),
              })
            }
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fg transition-colors duration-150 hover:bg-bg disabled:opacity-50"
          >
            <LogOut className="size-4 text-fg-muted" aria-hidden />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
