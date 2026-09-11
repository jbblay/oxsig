'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  Box,
  Crosshair,
  GraduationCap,
  Home,
  LibraryBig,
  LogIn,
  LogOut,
  MessageCircle,
  Moon,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  RadioTower,
  Settings2,
  Sun,
  Swords,
  X,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/use-auth';

const groups = [
  {
    label: 'Workspace',
    items: [
      { href: '/home', label: 'Dashboard', icon: Home },
      { href: '/collab', label: 'Collaborate', icon: MessageCircle },
      { href: '/live', label: 'Live Workspace', icon: RadioTower },
      { href: '/collab/storyboards', label: 'Boards', icon: BookOpen },
      { href: '/manage', label: 'Resources', icon: Settings2 },
    ],
  },
  {
    label: 'Practice',
    items: [
      { href: '/academy', label: 'Academy', icon: GraduationCap },
      { href: '/operations', label: 'Operations', icon: Crosshair },
      { href: '/warroom', label: 'WarRoom', icon: Swords },
      { href: '/labs', label: 'Cyber Lab', icon: Box },
      { href: '/vault', label: 'Vault', icon: LibraryBig },
    ],
  },
];

function initials(value?: string | null) {
  const text = value?.trim() || 'O';
  return text.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'O';
}

function isItemActive(pathname: string, href: string) {
  if (href === '/home') return pathname === '/home';
  if (href === '/collab') return pathname === '/collab';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function workspaceColor(href: string) {
  if (href === '/collab/storyboards') return 'boards';
  if (href === '/operations') return 'labs';
  if (href === '/warroom') return 'live';
  return href.slice(1);
}

function guestHref(href: string) {
  if (href === '/home' || href === '/operations') return href;
  if (href === '/academy') return '/explore';
  if (href === '/collab' || href === '/live' || href === '/warroom') return '/explore#collaboration';
  if (href === '/labs') return '/explore#live-environments';
  if (href === '/vault') return '/explore#proof';
  if (href === '/collab/storyboards' || href === '/manage') return '/explore#platform';
  return '/explore';
}

function SidebarContent({
  collapsed,
  mobile,
  onNavigate,
  onToggle,
}: {
  collapsed: boolean;
  mobile?: boolean;
  onNavigate?: () => void;
  onToggle?: () => void;
}) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { user, logout, isAuthenticated } = useAuth();
  const compact = collapsed && !mobile;

  return (
    <div className="oxsig-navigation flex h-full min-h-0 w-full flex-col">
      <div className={cn('flex h-14 items-center border-b border-sidebar-border/70', compact ? 'justify-center px-2' : 'justify-between px-3')}>
        <Link href={isAuthenticated ? '/home' : '/explore'} onClick={onNavigate} className={cn('flex min-w-0 items-center gap-2.5', compact && 'justify-center')}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm shadow-primary/10">
            <Network className="h-4 w-4" />
          </div>
          {!compact && <p className="truncate text-sm font-bold tracking-[0.18em]">OXSIG</p>}
        </Link>
        {!compact && onToggle && !mobile && (
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onToggle} aria-label="Collapse navigation" title="Collapse navigation">
            <PanelLeftClose className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="oxsig-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {compact && onToggle && (
          <Button size="icon" variant="ghost" className="mb-2 h-9 w-full" onClick={onToggle} aria-label="Expand navigation" title="Expand navigation">
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
        )}

        <nav className="space-y-4">
          {groups.map((group) => (
            <div key={group.label}>
              {!compact && <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{group.label}</p>}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isItemActive(pathname, item.href);
                  const Icon = item.icon;
                  const destination = isAuthenticated ? item.href : guestHref(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={destination}
                      onClick={onNavigate}
                      title={compact ? item.label : undefined}
                      aria-current={active ? 'page' : undefined}
                      data-workspace-color={workspaceColor(item.href)}
                      className={cn(
                        'oxsig-nav-item group relative flex min-h-9 items-center text-[13px] font-medium transition-colors duration-150',
                        compact ? 'justify-center px-1' : 'gap-2 px-2',
                        active ? 'bg-primary/[0.07] text-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground'
                      )}
                    >
                      {active && !compact && <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-primary" />}
                      <span className="oxsig-workspace-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      {!compact && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="border-t border-sidebar-border/70 p-2">
        <Link
          href={isAuthenticated ? '/account' : '/sign-up'}
          onClick={onNavigate}
          title={compact ? (isAuthenticated ? 'Account' : 'Create account') : undefined}
          className={cn('flex min-h-9 items-center rounded-md transition hover:bg-sidebar-accent/70', compact ? 'justify-center px-1' : 'gap-2 px-2')}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary/10 text-[10px] font-bold text-primary">
            {user?.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(user?.displayName || user?.email)}
          </div>
          {!compact && <span className="min-w-0 flex-1 truncate text-xs font-medium">{isAuthenticated ? (user?.displayName || 'Account') : 'Create account'}</span>}
        </Link>

        <div className={cn('mt-1 flex items-center gap-0.5', compact ? 'flex-col' : 'justify-between')}>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            <Sun className="h-3.5 w-3.5 dark:hidden" />
            <Moon className="hidden h-3.5 w-3.5 dark:block" />
          </Button>
          {isAuthenticated ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => void logout()}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button asChild size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground">
              <Link href="/sign-in" onClick={onNavigate} aria-label="Log in" title="Log in"><LogIn className="h-3.5 w-3.5" /></Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AppSidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  return (
    <>
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 border-r border-sidebar-border/70 bg-sidebar/92 text-sidebar-foreground backdrop-blur-xl transition-[width] duration-200 ease-out md:flex',
          collapsed ? 'w-[64px]' : 'w-[220px]'
        )}
      >
        <SidebarContent collapsed={collapsed} onToggle={onToggle} />
      </aside>

      <div className={cn('fixed inset-0 z-50 md:hidden', mobileOpen ? 'pointer-events-auto' : 'pointer-events-none')} aria-hidden={!mobileOpen}>
        <button
          type="button"
          className={cn('absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200', mobileOpen ? 'opacity-100' : 'opacity-0')}
          onClick={onMobileClose}
          aria-label="Close navigation"
        />
        <aside className={cn('absolute inset-y-0 left-0 w-[252px] max-w-[calc(100vw-20px)] border-r bg-sidebar text-sidebar-foreground shadow-2xl transition-transform duration-200 ease-out', mobileOpen ? 'translate-x-0' : '-translate-x-full')}>
          <Button size="icon" variant="ghost" className="absolute right-2 top-2.5 z-10 h-8 w-8" onClick={onMobileClose} aria-label="Close navigation">
            <X className="h-4 w-4" />
          </Button>
          <SidebarContent collapsed={false} mobile onNavigate={onMobileClose} />
        </aside>
      </div>
    </>
  );
}
