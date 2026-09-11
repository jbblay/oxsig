import { auth } from '@clerk/nextjs/server';
import type { ReactNode } from 'react';
import { Archive, LibraryBig, Search, ShieldCheck } from 'lucide-react';
import GuestProductSurface from '@/components/auth/GuestProductSurface';

export const dynamic = 'force-dynamic';

export default async function VaultLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return <GuestProductSurface surface="vault" />;

  return (
    <div className="oxsig-surface oxsig-surface-vault mx-auto max-w-7xl space-y-4">
      <header className="oxsig-surface-head">
        <span className="oxsig-surface-mark"><LibraryBig className="h-5 w-5" /></span>
        <div className="oxsig-surface-copy">
          <p className="oxsig-surface-kicker">Secure archive // Operator memory</p>
          <h1 className="oxsig-surface-title">Vault</h1>
          <p className="oxsig-surface-description">Store commands, procedures, scripts, concepts, and playbooks as reusable technical memory, then hand them back into active work.</p>
        </div>
        <div className="oxsig-surface-signals" aria-label="Vault capabilities">
          <span className="oxsig-surface-signal"><ShieldCheck className="h-3 w-3" /> <strong>Private</strong></span>
          <span className="oxsig-surface-signal"><Search className="h-3 w-3" /> Searchable</span>
          <span className="oxsig-surface-signal"><Archive className="h-3 w-3" /> Reusable records</span>
        </div>
      </header>
      <div className="oxsig-surface-content">{children}</div>
    </div>
  );
}
