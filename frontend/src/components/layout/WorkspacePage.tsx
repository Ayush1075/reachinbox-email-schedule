import type { ReactNode } from 'react';
import { MobileNavButton } from './Sidebar';

/** Frame for the workspace pages (Overview, Campaigns, Senders, Settings). */
export function WorkspacePage({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pt-5 pb-16 sm:px-6">
      <div className="flex items-start gap-2">
        <MobileNavButton className="-ml-2 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
      <div className="mt-6 space-y-6">{children}</div>
    </div>
  );
}
