'use client';

import { ChevronDown, ExternalLink, Laptop, LogOut, Moon, Settings, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useLogout, useMe } from '@/hooks/useAuth';
import { useHydrated } from '@/hooks/useHydrated';
import { API_URL, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { User } from '@/types/api';

export const BULL_BOARD_URL = `${API_URL}/admin/queues`;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function UserAvatar({ user, className }: { user: User; className?: string }) {
  return (
    <Avatar className={className}>
      {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback className="bg-primary-soft text-xs font-medium text-primary-soft-foreground">{initials(user.name)}</AvatarFallback>
    </Avatar>
  );
}

const themes = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Laptop },
] as const;

/** Account menu items shared by the sidebar card and the avatar in full-page views. */
function AccountMenuContent({ user, align }: { user: User; align: 'start' | 'end' }) {
  const router = useRouter();
  const logout = useLogout();
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenuContent align={align} className="w-64">
      <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
        <span className="truncate text-sm font-medium text-foreground">{user.name}</span>
        <span className="truncate text-xs text-muted-foreground">{user.email}</span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <Link href="/dashboard/settings">
          <Settings aria-hidden />
          Settings
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <a href={BULL_BOARD_URL} target="_blank" rel="noreferrer">
          <ExternalLink aria-hidden />
          Queue dashboard
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Sun className="dark:hidden" aria-hidden />
          <Moon className="hidden dark:block" aria-hidden />
          Theme
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup value={theme ?? 'light'} onValueChange={setTheme}>
            {themes.map(({ value, label, icon: Icon }) => (
              <DropdownMenuRadioItem key={value} value={value}>
                <Icon aria-hidden />
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        disabled={logout.isPending}
        onSelect={() =>
          logout.mutate(undefined, {
            onSuccess: () => router.replace('/'),
            onError: (err) => toast.error(errorMessage(err)),
          })
        }
      >
        <LogOut aria-hidden />
        Log out
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

/** The sidebar's account card: avatar, name, email and a chevron, as in the design. */
export function AccountCard() {
  const { data: user } = useMe();
  const hydrated = useHydrated();
  if (!user || !hydrated) return <Skeleton className="h-14 w-full rounded-xl" aria-label="Loading account" />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex h-14 w-full items-center gap-2.5 rounded-xl bg-field px-3 text-left transition-colors duration-150 ease-out outline-none',
          'hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:bg-accent',
        )}
        aria-label={`Account menu for ${user.name}`}
      >
        <UserAvatar user={user} className="size-[30px]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm leading-tight font-medium">{user.name}</span>
          <span className="block truncate text-[11px] leading-tight text-muted-foreground">{user.email}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <AccountMenuContent user={user} align="start" />
    </DropdownMenu>
  );
}

/** Avatar button for the full-page views (reading view, compose). */
export function AccountAvatarButton() {
  const { data: user } = useMe();
  const hydrated = useHydrated();
  if (!user || !hydrated) return <Skeleton className="size-8 rounded-full" aria-label="Loading account" />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={`Account menu for ${user.name}`}
      >
        <UserAvatar user={user} className="size-8" />
      </DropdownMenuTrigger>
      <AccountMenuContent user={user} align="end" />
    </DropdownMenu>
  );
}
