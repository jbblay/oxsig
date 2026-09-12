import { auth } from '@clerk/nextjs/server';
import { MessageCircle, Radio, UsersRound } from 'lucide-react';
import GuestProductSurface from '@/components/auth/GuestProductSurface';
import CollaborationWorkspace from '@/components/collab/CollaborationWorkspace';

export const dynamic = 'force-dynamic';

export default async function CollaborationPage() {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return <GuestProductSurface surface="collaboration" />;

  return (
    <div className="oxsig-surface oxsig-surface-collab mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-3 sm:gap-4">
      <header className="oxsig-surface-head shrink-0">
        <span className="oxsig-surface-mark"><MessageCircle className="h-5 w-5" /></span>
        <div className="oxsig-surface-copy">
          <p className="oxsig-surface-kicker">Signal exchange // Coordination</p>
          <h1 className="oxsig-surface-title">Collaborate</h1>
          <p className="oxsig-surface-description">Persistent technical conversations for planning, explaining, sharing evidence, and moving work into labs or boards.</p>
        </div>
        <div className="oxsig-surface-signals" aria-label="Collaboration capabilities">
          <span className="oxsig-surface-signal"><span className="oxsig-surface-live-dot" /> <strong>Realtime</strong></span>
          <span className="oxsig-surface-signal"><UsersRound className="h-3 w-3" /> Team channels</span>
          <span className="oxsig-surface-signal"><Radio className="h-3 w-3" /> Shared context</span>
        </div>
      </header>
      <div className="oxsig-surface-content min-h-0 flex-1 overflow-hidden">
        <CollaborationWorkspace />
      </div>
    </div>
  );
}
