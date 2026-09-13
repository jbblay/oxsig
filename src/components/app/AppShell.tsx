'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import AiPractitionerDock from '@/components/labs/AiPractitionerDock';
import { useAuth } from '@/lib/auth/use-auth';
import { invalidateLabsSnapshot } from '@/lib/labs/client';
import { recordWorkspaceVisit } from '@/lib/persistence/workspace-activity';
import AiHelperDock from './AiHelperDock';
import AppHeader from './AppHeader';
import AppSidebar from './AppSidebar';
import WorkspaceActivitySync from './WorkspaceActivitySync';
import WorkspaceEnhancements, { type WorkspaceKind } from './WorkspaceEnhancements';

const SIDEBAR_KEY = 'oxsig:app-sidebar:v1';

type ContentMode = 'standard' | 'wide' | 'immersive';

function workspaceKindFor(pathname: string): WorkspaceKind | null {
  if (pathname.startsWith('/labs')) return 'labs';
  if (pathname.startsWith('/collab/storyboards')) return 'boards';
  if (pathname.startsWith('/collab')) return 'collab';
  if (pathname.startsWith('/live')) return 'live';
  if (pathname.startsWith('/vault') || pathname.startsWith('/storage')) return 'vault';
  return null;
}

function contentModeFor(workspaceKind: WorkspaceKind | null): ContentMode {
  if (workspaceKind === 'labs') return 'immersive';
  if (workspaceKind === 'boards') return 'wide';
  return 'standard';
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, sessionIdentityId } = useAuth();
  const bare = pathname === '/' || pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up') || pathname.startsWith('/explore');
  const workspaceKind = workspaceKindFor(pathname);
  const contentMode = contentModeFor(workspaceKind);
  const immersiveWorkspace = contentMode === 'immersive';
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [immersiveExpanded, setImmersiveExpanded] = React.useState(false);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [layoutReady, setLayoutReady] = React.useState(false);
  const lastRecordedPathRef = React.useRef<string | null>(null);
  const labCacheIdentityRef = React.useRef<string | null>(null);
  const closeMobileNav = React.useCallback(() => setMobileNavOpen(false), []);

  React.useLayoutEffect(() => {
    const scope = isAuthenticated ? sessionIdentityId || 'authenticated-pending' : 'guest';
    if (labCacheIdentityRef.current === scope) return;
    labCacheIdentityRef.current = scope;
    invalidateLabsSnapshot();
  }, [isAuthenticated, sessionIdentityId]);

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
    if (!bare && lastRecordedPathRef.current !== pathname) {
      lastRecordedPathRef.current = pathname;
      recordWorkspaceVisit(pathname);
    }
  }, [bare, pathname]);

  if (bare) return <>{children}</>;

  const effectiveSidebarCollapsed = immersiveWorkspace ? !immersiveExpanded : sidebarCollapsed;
  const workspaceMain = workspaceKind !== null;
  const standardCanvas = contentMode === 'standard';
  const boundedWorkspace = isAuthenticated && (workspaceKind === 'collab' || workspaceKind === 'boards');
  const toggleSidebar = () => {
    if (immersiveWorkspace) setImmersiveExpanded((value) => !value);
    else setSidebarCollapsed((value) => !value);
  };

  return (
    <div className={workspaceMain ? 'oxsig-app-background flex h-dvh flex-col overflow-hidden' : 'oxsig-app-background flex min-h-screen flex-col'}>
      <WorkspaceActivitySync />
      <AppHeader
        onOpenMobileNav={() => setMobileNavOpen(true)}
        sidebarCollapsed={effectiveSidebarCollapsed}
        onToggleSidebar={toggleSidebar}
      />
      <div className={workspaceMain ? 'flex min-h-0 w-full flex-1' : 'flex min-h-0 w-full flex-1'}>
        <AppSidebar
          collapsed={effectiveSidebarCollapsed}
          onToggle={toggleSidebar}
          mobileOpen={mobileNavOpen}
          onMobileClose={closeMobileNav}
        />
        <div className={workspaceMain ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden' : 'min-w-0 flex-1'}>
          <main
            data-oxsig-workspace={workspaceKind || undefined}
            data-oxsig-content-mode={contentMode}
            className={workspaceMain
              ? `min-h-0 w-full min-w-0 flex-1 px-2 py-2 sm:px-3 sm:py-3 ${standardCanvas ? 'mx-auto max-w-7xl' : 'max-w-none'} ${boundedWorkspace ? 'overflow-hidden' : 'overflow-y-auto'}`
              : 'mx-auto w-full max-w-7xl px-3 py-4 sm:px-4 md:px-6 md:py-6 lg:px-8'}
          >
            {isAuthenticated && workspaceKind ? <WorkspaceEnhancements kind={workspaceKind} /> : null}
            {children}
          </main>
        </div>
      </div>
      {isAuthenticated ? (immersiveWorkspace ? <AiPractitionerDock /> : <AiHelperDock />) : null}
    </div>
  );
}
