'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AccountAvatarButton } from './AccountMenu';

/**
 * Header for the full-page views (reading an email, composing): back arrow,
 * title, actions, and optionally the account avatar.
 */
export function FocusHeader({
  title,
  fallbackHref,
  actions,
  showAccount = true,
}: {
  title: ReactNode;
  /** Where "back" goes when there's no in-app history (opened from a link). */
  fallbackHref: string;
  actions?: ReactNode;
  showAccount?: boolean;
}) {
  const router = useRouter();
  const back = () => (window.history.length > 1 ? router.back() : router.push(fallbackHref));

  return (
    <header className="sticky top-0 z-20 flex h-[78px] items-center gap-3 bg-background/95 px-4 backdrop-blur sm:px-6">
      <Button variant="ghost" size="icon-sm" onClick={back} aria-label="Back" className="-ml-1 shrink-0">
        <ArrowLeft className="size-5" aria-hidden />
      </Button>
      <h1 className="min-w-0 flex-1 truncate text-xl leading-tight font-normal sm:text-[23px]">{title}</h1>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      {showAccount && (
        <>
          <span className="mx-1.5 h-6 w-px shrink-0 bg-border" aria-hidden />
          <AccountAvatarButton />
        </>
      )}
    </header>
  );
}
