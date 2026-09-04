'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  Box,
  Home,
  LibraryBig,
  LogOut,
  MessageCircle,
  Moon,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
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
      { href: '/home', label: 'Home', icon: Home },
      { href: '/collab', label: 'Collaborate', icon: MessageCircle },
      { href: '/collab/storyboards', label: 'Boards', icon: BookOpen },
    ],
  },
  {
    label: 'Build & practice',
    items: [
      { href: '/vault', label: 'Vault', icon: LibraryBig },
      { href: '/labs', label: 'Cyber Lab', icon: Box },
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
  const { user, logout } = useAuth();
  const compact = collapsed && !mobile;

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className={cn('flex h-16 items-center border-b border-sidebar-border/70', compact ? 'justify-center px-2' : 'justify-between px-4')}>
        <Link href="/home" onClick={onNavigate} className={cn('flex min-w-0 items-center gap-3', compact && 'justify-center')}>
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/10">
            <Network className="h-5 w-5" />
          </div>
          {!compact && (
            <div className="min-w-0">
              <p className="oxsig-gradient-text truncate text-lg font-bold">Oxsig</p>
              <p className="truncate text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Learning workspace</p>
            </div>
          )}
        </Link>
        {!compact && onToggle && !mobile && (
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onToggle} aria-label="Collapse navigation" title="Collapse navigation">
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="oxsig-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-4">
        {compact && onToggle && (
          <Button size="icon" variant="ghost" className="mb-3 h-10 w-full" onClick={onToggle} aria-label="Expand navigation" title="Expand navigation">
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
        )}

        <nav className="space-y-5">
          {groups.map((group) => (
            <div key={group.label}>
              {!compact && <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{group.label}</p>}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = isItemActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      title={compact ? item.label : undefined}
                      className={cn(
                        'group relative flex items-center rounded-xl text-sm font-medium transition-all duration-200',
                        compact ? 'h-11 justify-center px-2' : 'gap-3 px-3 py-2.5',
                        active
                          ? 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
                      )}
                    >
                      {active && !compact && <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-gradient-to-b from-blue-500 to-purple-600" />}
                      <span className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200',
                        active
                          ? 'bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-md shadow-blue-500/10'
                          : 'bg-sidebar-accent/70 text-muted-foreground group-hover:bg-sidebar-accent group-hover:text-foreground'
                      )}>
                        <Icon className="h-4 w-4" />
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
          href="/account"
          onClick={onNavigate}
          title={compact ? 'Account' : undefined}
          className={cn('flex items-center rounded-xl transition hover:bg-sidebar-accent', compact ? 'justify-center p-2' : 'gap-3 p-2')}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/15 to-purple-500/15 text-xs font-bold">
            {initials(user?.displayName || user?.email)}
          </div>
          {!compact && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{user?.displayName || 'Oxsig user'}</p>
              <p className="truncate text-[10px] text-muted-foreground">{user?.email || 'Account'}</p>
            </div>
          )}
        </Link>

        <div className={cn('mt-1 flex items-center gap-1', compact ? 'flex-col' : 'justify-between')}>
          <Button
            size={compact ? 'icon' : 'sm'}
            variant="ghost"
            className={cn(compact ? 'h-9 w-9' : 'h-9 px-2.5')}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title="Toggle theme"
          >
            <Sun className="h-4 w-4 dark:hidden" />
            <Moon className="hidden h-4 w-4 dark:block" />
            {!compact && <span className="ml-2 text-xs">Theme</span>}
          </Button>
          <Button
            size={compact ? 'icon' : 'sm'}
            variant="ghost"
            className={cn(compact ? 'h-9 w-9' : 'h-9 px-2.5 text-muted-foreground')}
            onClick={() => void logout()}
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
            {!compact && <span className="ml-2 text-xs">Sign out</span>}
          </Button>
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
          'hidden min-h-screen shrink-0 border-r border-sidebar-border/70 bg-sidebar/90 text-sidebar-foreground backdrop-blur-xl transition-[width] duration-300 ease-in-out md:flex',
          collapsed ? 'w-[76px]' : 'w-[268px]'
        )}
      >
        <SidebarContent collapsed={collapsed} onToggle={onToggle} />
      </aside>

      <div className={cn('fixed inset-0 z-50 md:hidden', mobileOpen ? 'pointer-events-auto' : 'pointer-events-none')} aria-hidden={!mobileOpen}>
        <button
          type="button"
          className={cn('absolute inset-0 bg-black/45 backdrop-blur-sm transition-opacity duration-300', mobileOpen ? 'opacity-100' : 'opacity-0')}
          onClick={onMobileClose}
          aria-label="Close navigation"
        />
        <aside className={cn('absolute inset-y-0 left-0 w-[286px] border-r bg-sidebar text-sidebar-foreground shadow-2xl transition-transform duration-300 ease-in-out', mobileOpen ? 'translate-x-0' : '-translate-x-full')}>
          <Button size="icon" variant="ghost" className="absolute right-2 top-3 z-10 h-9 w-9" onClick={onMobileClose} aria-label="Close navigation">
            <X className="h-4 w-4" />
          </Button>
          <SidebarContent collapsed={false} mobile onNavigate={onMobileClose} />
        </aside>
      </div>
    </>
  );
}
