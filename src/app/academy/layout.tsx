import Link from 'next/link';
import type { ReactNode } from 'react';
import { getServerAuthState } from '@/lib/auth/server-auth';
import AcademyDurableStateProvider from '@/components/academy/AcademyDurableStateProvider';
import GuestProductSurface from '@/components/auth/GuestProductSurface';
import { getAcademyState } from '@/lib/academy/persistence';
import { getClerkAuthenticatedUser } from '@/lib/auth/clerk-user';

export const dynamic = 'force-dynamic';

export default async function AcademyLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated } = await getServerAuthState();
  if (!isAuthenticated) return <GuestProductSurface surface="academy" />;

  let initialState = null;
  try {
    const user = await getClerkAuthenticatedUser();
    if (user) initialState = await getAcademyState(user.id);
  } catch (error) {
    console.warn('Academy durable state preload failed:', error);
  }

  return (
    <AcademyDurableStateProvider initialState={initialState}>
      <div className="space-y-3">
        <nav className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-1 rounded-lg border bg-card/70 p-1" aria-label="Academy navigation">
          <Link href="/academy/missions" className="rounded-md px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-muted">Mission Control</Link>
          <Link href="/academy/paths" className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">Learning paths</Link>
          <Link href="/academy" className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">Current lesson</Link>
          <Link href="/academy/prove" className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">Prove capability</Link>
          <Link href="/academy/transcript" className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">Proved skills</Link>
          <Link href="/academy/explore" className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">Explore</Link>
        </nav>
        {children}
      </div>
    </AcademyDurableStateProvider>
  );
}
