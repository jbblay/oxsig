import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AcademyLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-3">
      <nav className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-1 rounded-lg border bg-card/70 p-1" aria-label="Academy navigation">
        <Link href="/academy/paths" className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">Learning paths</Link>
        <Link href="/academy" className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">Current lesson</Link>
        <Link href="/academy/prove" className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">Prove capability</Link>
        <Link href="/academy/transcript" className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">Proved skills</Link>
        <Link href="/academy/explore" className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">Explore</Link>
      </nav>
      {children}
    </div>
  );
}
