import { auth } from '@clerk/nextjs/server';
import GuestProductSurface from '@/components/auth/GuestProductSurface';
import CollaborationWorkspace from '@/components/collab/CollaborationWorkspace';

export const dynamic = 'force-dynamic';

export default async function CollaborationPage() {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return <GuestProductSurface surface="collaboration" />;

  return (
    <div className="oxsig-surface oxsig-surface-collab mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col">
      <div className="oxsig-surface-content min-h-0 flex-1 overflow-hidden">
        <CollaborationWorkspace />
      </div>
    </div>
  );
}
