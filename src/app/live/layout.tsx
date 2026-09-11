import { auth } from '@clerk/nextjs/server';
import type { ReactNode } from 'react';
import { Activity, Link2, RadioTower, UsersRound } from 'lucide-react';
import GuestProductSurface from '@/components/auth/GuestProductSurface';

export const dynamic = 'force-dynamic';

export default async function LiveWorkspaceLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return <GuestProductSurface surface="live" />;

  return (
    <div className="oxsig-surface oxsig-surface-live mx-auto max-w-7xl space-y-4">
      <header className="oxsig-surface-head">
        <span className="oxsig-surface-mark"><RadioTower className="h-5 w-5" /></span>
        <div className="oxsig-surface-copy">
          <p className="oxsig-surface-kicker">Active channel // Shared control</p>
          <h1 className="oxsig-surface-title">Live Workspace</h1>
          <p className="oxsig-surface-description">Bring operators and owned resources into one live session, assign roles, contribute labs, and coordinate control without transferring ownership.</p>
        </div>
        <div className="oxsig-surface-signals" aria-label="Live Workspace capabilities">
          <span className="oxsig-surface-signal"><span className="oxsig-surface-live-dot" /> <strong>Live</strong></span>
          <span className="oxsig-surface-signal"><UsersRound className="h-3 w-3" /> Presence</span>
          <span className="oxsig-surface-signal"><Link2 className="h-3 w-3" /> Resource links</span>
          <span className="oxsig-surface-signal"><Activity className="h-3 w-3" /> Control state</span>
        </div>
      </header>
      <div className="oxsig-surface-content">{children}</div>
    </div>
  );
}
