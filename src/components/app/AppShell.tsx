'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import AiPractitionerDock from '@/components/labs/AiPractitionerDock';
import AiHelperDock from './AiHelperDock';
import AppHeader from './AppHeader';
import AppSidebar from './AppSidebar';
import WorkspaceEnhancements, { type WorkspaceKind } from './WorkspaceEnhancements';

const SIDEBAR_KEY = 'oxsig:app-sidebar:v1';

function workspaceKindFor(pathname: string): WorkspaceKind | null {
  if (pathname.startsWith('/labs')) return 'labs';
  if (pathname.startsWith('/collab/storyboards')) return 'boards';
  if (pathname.startsWith('/collab')) return 'collab';
  if (pathname.startsWith('/live')) return 'live';
  if (pathname.startsWith('/vault') || pathname.startsWith('/storage')) return 'vault';
  return null;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = pathname === '/' || pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up');
  const workspaceKind = workspaceKindFor(pathname);
  const immersiveWorkspace = workspaceKind === 'labs';
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
  const workspaceMain = workspaceKind !== null;

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
          <main
            data-oxsig-workspace={workspaceKind || undefined}
            className={workspaceMain
              ? 'w-full min-w-0 px-2 py-2 sm:px-3 sm:py-3'
              : 'mx-auto w-full max-w-[1800px] px-3 py-4 sm:px-4 md:px-6 md:py-6 lg:px-8'}
          >
            {workspaceKind && <WorkspaceEnhancements kind={workspaceKind} />}
            {children}
          </main>
        </div>
      </div>
      {immersiveWorkspace ? <AiPractitionerDock /> : <AiHelperDock />}
    </div>
  );
}
