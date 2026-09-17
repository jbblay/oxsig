'use client';

import * as React from 'react';
import Link from 'next/link';
import { Menu, Search, Sparkles } from 'lucide-react';
import { usePathname } from 'next/navigation';
import ActivityCenter from './ActivityCenter';
import AppCommandPalette from './AppCommandPalette';
import WorkspaceWalkthrough from './WorkspaceWalkthrough';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/use-auth';
import {
  contextualAiOpenEvent,
  contextualAiSurfaceForPathname,
} from '@/lib/ai/context-surface';
import {
  productNavigationLabelForPath,
  resolveProductNavigationHref,
} from '@/lib/navigation/product-navigation';

function pageTitle(pathname: string) {
  if (pathname.startsWith('/storage')) return 'Vault';
  if (pathname.startsWith('/ai')) return 'AI Operator';
  return productNavigationLabelForPath(pathname) ?? 'OXSIG';
}

function initials(value?: string | null) {
  const text = value?.trim() || 'O';
  return text.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'O';
}

export default function AppHeader({
  onOpenMobileNav,
  sidebarCollapsed,
  onToggleSidebar,
}: {
  onOpenMobileNav: () => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}) {
  const pathname = usePathname();
  const { user, isAuthenticated } = useAuth();
  const [commandOpen, setCommandOpen] = React.useState(false);
  const practitionerSurface = contextualAiSurfaceForPathname(pathname) === 'practitioner';
  const accountHref = resolveProductNavigationHref('account', isAuthenticated) ?? '/sign-up';

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function openAi() {
    window.dispatchEvent(new CustomEvent(contextualAiOpenEvent(pathname)));
  }

  return (
    <>
      <header className="oxsig-app-header sticky top-0 z-40 shrink-0 border-b bg-background/86 backdrop-blur-xl">
        <div className="flex h-16 w-full items-center gap-1.5 px-3 sm:px-4 lg:px-5">
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 md:hidden" onClick={onOpenMobileNav} aria-label="Open navigation" title="Open navigation">
            <Menu className="h-4 w-4" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className="hidden h-8 w-8 shrink-0 md:inline-flex"
            onClick={onToggleSidebar}
            aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            <Menu className="h-4 w-4" />
          </Button>

          <Link href="/home" className="flex shrink-0 items-center px-1.5" aria-label="OXSIG home">
            <span className="text-xs font-bold tracking-[0.18em] text-foreground">OXSIG</span>
          </Link>

          <span className="mx-1 hidden h-5 w-px bg-border/70 sm:block" aria-hidden="true" />
          <p className="hidden min-w-0 truncate text-[13px] font-semibold sm:block">{pageTitle(pathname)}</p>

          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="ml-auto hidden h-8 min-w-44 max-w-sm flex-1 items-center gap-2 rounded-md border bg-muted/20 px-2.5 text-left text-xs text-muted-foreground transition hover:bg-muted/50 lg:flex"
            aria-label="Search commands and workspaces"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="truncate">Search or run command</span>
            <kbd className="ml-auto rounded border bg-background px-1 py-0.5 font-mono text-[10px]">⌘K</kbd>
          </button>

          <div className="ml-auto flex shrink-0 items-center gap-0.5 lg:ml-1.5">
            {isAuthenticated ? <ActivityCenter /> : null}
            {isAuthenticated ? <div className="hidden sm:contents"><WorkspaceWalkthrough /></div> : null}
            <Button size="icon" variant="ghost" className="h-8 w-8 lg:hidden" onClick={() => setCommandOpen(true)} aria-label="Search commands and workspaces">
              <Search className="h-3.5 w-3.5" />
            </Button>
            {isAuthenticated ? (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={openAi}
                aria-label={practitionerSurface ? 'Open AI Practitioner' : 'Open AI Helper'}
                title={practitionerSurface ? 'AI Practitioner' : 'AI Helper'}
              >
                <Sparkles className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button asChild size="icon" variant="ghost" className="h-8 w-8">
                <Link href="/ai" aria-label="Preview AI Operator" title="Preview AI Operator"><Sparkles className="h-3.5 w-3.5" /></Link>
              </Button>
            )}
            <Link
              href={accountHref}
              className="group flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent transition hover:border-border hover:bg-muted/40"
              aria-label={isAuthenticated ? 'Open account' : 'Preview account benefits'}
              title={isAuthenticated ? (user?.displayName || user?.email || 'Account') : 'Preview account benefits'}
            >
              <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-md bg-primary/10 text-[10px] font-bold text-primary">
                {user?.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(user?.displayName || user?.email)}
              </span>
            </Link>
          </div>
        </div>
      </header>
      <AppCommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </>
  );
}
