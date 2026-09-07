'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import AppHeader from './AppHeader';
import AppSidebar from './AppSidebar';

const SIDEBAR_KEY = 'oxsig:app-sidebar:v1';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = pathname === '/' || pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up');
  const immersiveWorkspace = pathname.startsWith('/labs');
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [immersiveExpanded, setImmersiveExpanded] = React.useState(false);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [layoutReady, setLayoutReady] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(SIDEBAR_KEY) || 'null') as { collapsed?: boolean } | null;
      if (typeof saved?.collapsed === 'boolean') setSidebarCollapsed(saved.collapsed);
    } catch {
      window.localStorage.removeItem(SIDEBAR_KEY);
    }
    setLayoutReady(true);
  }, []);

  React.useEffect(() => {
    if (!layoutReady || typeof window === 'undefined') return;
    window.localStorage.setItem(SIDEBAR_KEY, JSON.stringify({ collapsed: sidebarCollapsed }));
  }, [layoutReady, sidebarCollapsed]);

  React.useEffect(() => {
    setMobileNavOpen(false);
    setImmersiveExpanded(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!mobileNavOpen || typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobileNavOpen]);

  if (bare) return <>{children}</>;

  const effectiveSidebarCollapsed = immersiveWorkspace ? !immersiveExpanded : sidebarCollapsed;

  return (
    <div className="oxsig-app-background min-h-screen">
      <div className="flex min-h-screen w-full">
        <AppSidebar
          collapsed={effectiveSidebarCollapsed}
          onToggle={() => {
            if (immersiveWorkspace) setImmersiveExpanded((value) => !value);
            else setSidebarCollapsed((value) => !value);
          }}
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />
        <div className="min-w-0 flex-1">
          <AppHeader onOpenMobileNav={() => setMobileNavOpen(true)} />
          <main className="mx-auto w-full max-w-[1800px] px-4 py-5 md:px-6 md:py-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
