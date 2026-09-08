'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
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

  return (
    <header className="sticky top-0 z-30 border-b bg-background/75 backdrop-blur-xl">
      <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-4 md:h-16 md:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 md:hidden" onClick={onOpenMobileNav} aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </Button>
          <p className="truncate text-sm font-semibold">{pageTitle(pathname)}</p>
        </div>

        <Link
          href="/account"
          className="group flex min-w-0 items-center gap-2 rounded-lg border border-transparent p-1 transition hover:border-border hover:bg-muted/40"
          aria-label="Open account"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/15 to-purple-500/15 text-[10px] font-bold">
            {initials(user?.displayName || user?.email)}
          </span>
          <span className="hidden max-w-32 truncate text-[11px] font-medium sm:block">
            {user?.displayName || 'Account'}
          </span>
        </Link>
      </div>
    </header>
  );
}
