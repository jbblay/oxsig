import { auth } from '@clerk/nextjs/server';
import type { ReactNode } from 'react';
import { Boxes, Database, Network, Settings2 } from 'lucide-react';
import GuestProductSurface from '@/components/auth/GuestProductSurface';

export const dynamic = 'force-dynamic';

export default async function ResourceControlLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return <GuestProductSurface surface="resources" />;

  return (
    <div className="oxsig-surface oxsig-surface-manage mx-auto max-w-7xl space-y-4">
      <header className="oxsig-surface-head">
        <span className="oxsig-surface-mark"><Settings2 className="h-5 w-5" /></span>
        <div className="oxsig-surface-copy">
          <p className="oxsig-surface-kicker">Control plane // Owned resources</p>
          <h1 className="oxsig-surface-title">Resources</h1>
          <p className="oxsig-surface-description">Inventory and lifecycle control for collaboration sessions, Live Workspaces, invitations, and saved infrastructure state.</p>
        </div>
        <div className="oxsig-surface-signals" aria-label="Resource control capabilities">
          <span className="oxsig-surface-signal"><Boxes className="h-3 w-3" /> Inventory</span>
          <span className="oxsig-surface-signal"><Network className="h-3 w-3" /> Infrastructure</span>
          <span className="oxsig-surface-signal"><Database className="h-3 w-3" /> <strong>Owner scoped</strong></span>
        </div>
      </header>
      <div className="oxsig-surface-content">{children}</div>
    </div>
  );
}
