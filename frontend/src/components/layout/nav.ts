import { AtSign, CalendarClock, LayoutDashboard, Layers, type LucideIcon, Send, Settings } from 'lucide-react';

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/scheduled', label: 'Scheduled', icon: CalendarClock },
  { href: '/dashboard/sent', label: 'Sent', icon: Send },
  { href: '/dashboard/campaigns', label: 'Campaigns', icon: Layers },
  { href: '/dashboard/senders', label: 'Senders', icon: AtSign },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export function isActive(pathname: string, href: string): boolean {
  return href === '/dashboard' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function currentNavItem(pathname: string): NavItem | undefined {
  return navItems.find((item) => isActive(pathname, item.href));
}
