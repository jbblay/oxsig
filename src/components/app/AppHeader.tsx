'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/use-auth';

function pageMeta(pathname: string) {
  if (pathname === '/home') return { title: 'Dashboard', description: 'Continue your path, practice, and next demonstrated capability' };
  if (pathname.startsWith('/academy')) return { title: 'AI Academy', description: 'Build capability through teaching, practice, evidence, and feedback' };
  if (pathname === '/collab') return { title: 'Collaboration', description: 'Talk, share and work through a task together' };
  if (pathname.startsWith('/collab/storyboards')) return { title: 'Boards', description: 'Explain ideas visually and record walkthroughs' };
  if (pathname.startsWith('/live')) return { title: 'Live Workspace', description: 'Work together around shared learning resources and practice' };
  if (pathname.startsWith('/vault')) return { title: 'Vault', description: 'Save useful commands, concepts and playbooks' };
  if (pathname.startsWith('/storage')) return { title: 'Vault', description: 'Opening your saved knowledge' };
  if (pathname.startsWith('/labs')) return { title: 'Cyber Lab', description: 'Open a real temporary practice environment' };
  if (pathname.startsWith('/account')) return { title: 'My Progress', description: 'Your demonstrated capabilities, activity, achievements and account settings' };
  return { title: 'OXSIG', description: 'Learn, collaborate and practice' };
}

function initials(value?: string | null) {
  const text = value?.trim() || 'O';
  return text.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'O';
}

export default function AppHeader({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const pathname = usePathname();
  const meta = pageMeta(pathname);
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b bg-background/75 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between gap-4 px-4 md:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 md:hidden" onClick={onOpenMobileNav} aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{meta.title}</p>
            <p className="truncate text-[11px] text-muted-foreground">{meta.description}</p>
          </div>
        </div>

        <Link
          href="/account"
          className="group flex min-w-0 items-center gap-2 rounded-xl border border-transparent px-1.5 py-1 transition hover:border-border hover:bg-muted/40"
          aria-label="Open profile and progress"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/15 to-purple-500/15 text-[10px] font-bold">
            {initials(user?.displayName || user?.email)}
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="block truncate text-[11px] font-semibold group-hover:text-primary">My progress</span>
            <span className="block max-w-32 truncate text-[9px] text-muted-foreground">{user?.displayName || 'Profile'}</span>
          </span>
        </Link>
      </div>
    </header>
  );
}
