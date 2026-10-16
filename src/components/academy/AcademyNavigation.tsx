'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AcademyNavigation() {
  const pathname = usePathname();
  if (pathname.startsWith('/academy/learn/docker')) {
    return (
      <nav aria-label="Academy navigation" className="flex flex-wrap items-center gap-2 rounded-lg border bg-card/70 px-3 py-2 text-xs">
        <Link href="/academy" className="font-medium text-muted-foreground hover:text-foreground">Academy</Link>
        <span aria-hidden="true" className="text-muted-foreground">/</span>
        <Link href="/academy/learn/devops" className="font-medium text-muted-foreground hover:text-foreground">DevOps &amp; Cloud</Link>
        <span aria-hidden="true" className="text-muted-foreground">/</span>
        <span className="font-semibold text-foreground">Docker workspace</span>
      </nav>
    );
  }
  return (
<nav className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-1 rounded-lg border bg-card/70 p-1" aria-label="Academy navigation">
          <Link href="/academy" className="rounded-md px-3 py-1.5 text-xs font-semibold text-primary hover:bg-muted">Academy home</Link>
          <Link href="/academy/learn" className="rounded-md px-3 py-1.5 text-xs font-medium hover:bg-muted">Explore skills</Link>
          <Link href="/academy/learn/docker" className="rounded-md px-3 py-1.5 text-xs font-medium hover:bg-muted">Docker workshop</Link>
          <Link href="/academy/engineering-world" className="rounded-md px-3 py-1.5 text-xs font-medium hover:bg-muted">Engineering World</Link>
          <Link href="/academy/missions" className="rounded-md px-3 py-1.5 text-xs font-medium hover:bg-muted">Mission Control</Link>
          <Link href="/academy/mentor-forge" className="rounded-md px-3 py-1.5 text-xs font-medium hover:bg-muted">Skills Passport & Mentor Forge</Link>
          <span className="mx-1 hidden h-4 w-px bg-border sm:inline-block" aria-hidden="true" />
          <Link href="/academy/mentors" className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">Find a mentor</Link>
          <Link href="/academy/sessions" className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">My sessions</Link>
          <Link href="/academy/sandbox-commerce" className="rounded-md px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted">Commerce Sandbox</Link>
          <Link href="/academy/mentor-center" className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">Mentor center</Link>
  );
}
