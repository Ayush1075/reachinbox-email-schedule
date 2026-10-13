import { AtSign, Clock, LayoutDashboard, Layers, type LucideIcon, Send, Settings } from 'lucide-react';

export type NavItem = { href: string; label: string; icon: LucideIcon; count?: 'scheduled' | 'sent' };
export type NavSection = { title: string; items: NavItem[] };

export const navSections: NavSection[] = [
  {
    title: 'Core',
    items: [
      { href: '/dashboard/scheduled', label: 'Scheduled', icon: Clock, count: 'scheduled' },
      { href: '/dashboard/sent', label: 'Sent', icon: Send, count: 'sent' },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { href: '/dashboard/overview', label: 'Overview', icon: LayoutDashboard },
      { href: '/dashboard/campaigns', label: 'Campaigns', icon: Layers },
      { href: '/dashboard/senders', label: 'Senders', icon: AtSign },
      { href: '/dashboard/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
