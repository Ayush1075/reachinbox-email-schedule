'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { isActive, navItems } from './nav';
import { OnbLogo } from './OnbLogo';
import { SlackStatusPill } from './SlackStatusPill';
import { ThemeToggle } from './ThemeToggle';

/** Nav links. `rail` renders icons only, with labels in tooltips. */
export function SidebarNav({ rail = false, onNavigate }: { rail?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        const link = (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            aria-label={rail ? label : undefined}
            className={cn(
              'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors duration-150 ease-out focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
              active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              rail && 'w-8 justify-center px-0',
            )}
          >
            <Icon className={cn('size-4 shrink-0', active && 'text-primary')} aria-hidden />
            {!rail && label}
          </Link>
        );
        if (!rail) return link;
        return (
          <Tooltip key={href}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}

/** Full sidebar content, shared by the desktop sidebar and the mobile sheet. */
export function SidebarBody({ rail = false, onNavigate }: { rail?: boolean; onNavigate?: () => void }) {
  return (
    <>
      <div className={cn('flex h-14 shrink-0 items-center', rail ? 'justify-center' : 'px-4')}>
        <Link
          href="/dashboard"
          onClick={onNavigate}
          aria-label="ONB home"
          className="flex items-center gap-2.5 rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <OnbLogo className={rail ? 'h-4' : undefined} />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <SidebarNav rail={rail} onNavigate={onNavigate} />
      </div>
    </>
  );
}

/**
 * Desktop sidebar: full width on xl, an icon rail between md and xl (or when
 * the user collapses it), and hidden below md where the topbar opens a sheet.
 */
export function Sidebar({ collapsed, onToggleCollapsed }: { collapsed: boolean; onToggleCollapsed: () => void }) {
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-svh shrink-0 flex-col border-r bg-background md:flex',
        collapsed ? 'w-14' : 'w-14 xl:w-60',
      )}
    >
      <div className={cn('flex min-h-0 flex-1 flex-col', !collapsed && 'xl:hidden')}>
        <SidebarBody rail />
      </div>
      {!collapsed && (
        <div className="hidden min-h-0 flex-1 flex-col xl:flex">
          <SidebarBody />
        </div>
      )}

      <div className={cn('flex flex-col gap-2 border-t p-3', !collapsed && 'xl:hidden')}>
        <SlackStatusPill compact />
        <ThemeToggle />
      </div>
      {!collapsed && (
        <div className="hidden flex-col gap-2 border-t p-3 xl:flex">
          <SlackStatusPill />
          <div className="flex items-center justify-between">
            <ThemeToggle />
            <CollapseButton collapsed={false} onClick={onToggleCollapsed} />
          </div>
        </div>
      )}
      {collapsed && (
        <div className="hidden justify-center px-3 pb-3 xl:flex">
          <CollapseButton collapsed onClick={onToggleCollapsed} />
        </div>
      )}
    </aside>
  );
}

function CollapseButton({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" onClick={onClick} aria-label={label}>
          {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
