'use client';

import { Menu, Sparkles } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function pageMeta(pathname: string) {
  if (pathname === '/home') return { title: 'Home', description: 'Your Oxsig workspace' };
  if (pathname === '/collab') return { title: 'Collaboration', description: 'Conversation, resources and practice' };
  if (pathname.startsWith('/collab/storyboards')) return { title: 'Boards', description: 'Visual explanation and recording' };
  if (pathname.startsWith('/vault')) return { title: 'Vault', description: 'Capture, connect and reuse technical knowledge' };
  if (pathname.startsWith('/storage')) return { title: 'Vault', description: 'Opening your technical knowledge workspace' };
  if (pathname.startsWith('/labs')) return { title: 'Cyber Lab', description: 'Design, launch and operate cloud labs' };
  if (pathname.startsWith('/account')) return { title: 'Account', description: 'Profile and workspace settings' };
  return { title: 'Oxsig', description: 'Learn, collaborate and practice' };
}

export default function AppHeader({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const pathname = usePathname();
  const meta = pageMeta(pathname);

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
        <Badge variant="outline" className="hidden h-7 gap-1.5 border-primary/20 bg-background/70 text-[10px] font-medium sm:flex">
          <Sparkles className="h-3 w-3 text-primary" />Unified workspace
        </Badge>
      </div>
    </header>
  );
}
