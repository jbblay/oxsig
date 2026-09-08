'use client';

import * as React from 'react';
import Link from 'next/link';
import { Menu, Search, Sparkles } from 'lucide-react';
import { usePathname } from 'next/navigation';
import AppCommandPalette from './AppCommandPalette';
import WorkspaceWalkthrough from './WorkspaceWalkthrough';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/use-auth';

function pageTitle(pathname: string) {
  if (pathname === '/home') return 'Dashboard';
  if (pathname === '/collab') return 'Collaboration';
  if (pathname.startsWith('/collab/storyboards')) return 'Boards';
  if (pathname.startsWith('/live')) return 'Live Workspace';
  if (pathname.startsWith('/vault') || pathname.startsWith('/storage')) return 'Vault';
  if (pathname.startsWith('/labs')) return 'Cyber Lab';
  if (pathname.startsWith('/manage')) return 'Resources';
  if (pathname.startsWith('/account')) return 'Account';
  return 'OXSIG';
}

function initials(value?: string | null) {
  const text = value?.trim() || 'O';
  return text.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'O';
}

export default function AppHeader({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [commandOpen, setCommandOpen] = React.useState(false);
  const cyberLab = pathname.startsWith('/labs');

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
    window.dispatchEvent(new CustomEvent(cyberLab ? 'oxsig:ai-practitioner:open' : 'oxsig:ai-helper:open'));
  }

  return (
    <>
      <header className="oxsig-app-header sticky top-0 z-30 border-b bg-background/80 backdrop-blur-xl">
        <div className="flex h-14 items-center gap-2 px-2 sm:px-4 md:h-16 md:px-5 lg:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 md:hidden" onClick={onOpenMobileNav} aria-label="Open navigation">
              <Menu className="h-5 w-5" />
            </Button>
            <p className="truncate text-sm font-semibold">{pageTitle(pathname)}</p>
          </div>

          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="ml-auto hidden h-9 min-w-48 max-w-md flex-1 items-center gap-2 rounded-lg border bg-muted/30 px-3 text-left text-sm text-muted-foreground transition hover:bg-muted/60 lg:flex"
            aria-label="Search and jump to a workspace"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="truncate">Search or jump</span>
            <kbd className="ml-auto rounded border bg-background px-1.5 py-0.5 font-mono text-xs">⌘K</kbd>
          </button>

          <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-2">
            <WorkspaceWalkthrough />
            <Button size="icon" variant="ghost" className="h-9 w-9 lg:hidden" onClick={() => setCommandOpen(true)} aria-label="Search and jump">
              <Search className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9"
              onClick={openAi}
              aria-label={cyberLab ? 'Open AI Practitioner' : 'Open AI Helper'}
              title={cyberLab ? 'AI Practitioner' : 'AI Helper'}
            >
              <Sparkles className="h-4 w-4" />
            </Button>
            <Link
              href="/account"
              className="group flex min-w-0 items-center gap-2 rounded-lg border border-transparent p-1 transition hover:border-border hover:bg-muted/40"
              aria-label="Open account"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/15 to-purple-500/15 text-xs font-bold">
                {initials(user?.displayName || user?.email)}
              </span>
              <span className="hidden max-w-32 truncate text-sm font-medium sm:block">
                {user?.displayName || 'Account'}
              </span>
            </Link>
          </div>
        </div>
      </header>
      <AppCommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </>
  );
}

