'use client';

import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Boxes,
  LibraryBig,
  MessageCircle,
  RadioTower,
  SquareTerminal,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import TerminalActivityStrip from './TerminalActivityStrip';

export type WorkspaceKind = 'labs' | 'collab' | 'boards' | 'live' | 'vault';

export default function WorkspaceEnhancements({ kind }: { kind: WorkspaceKind }) {
  const router = useRouter();

  if (kind === 'labs') {
    return <div className="mb-2"><TerminalActivityStrip label="Lab terminal" /></div>;
  }

  // Boards and Vault already own their complete command surfaces. Rendering a
  // second rail above them duplicates controls and, for Vault, used to issue a
  // second list request.
  if (kind === 'boards' || kind === 'vault') return null;

  if (kind === 'live') {
    return (
      <div className="oxsig-workspace-rail mb-2" data-workspace="live">
        <div className="oxsig-rail-title"><RadioTower className="h-4 w-4" /><span>Live Workspace</span></div>
        <div className="oxsig-rail-badges">
          <span><RadioTower className="h-3 w-3" /> Workspaces</span>
          <span><Users className="h-3 w-3" /> Participants</span>
          <span><Boxes className="h-3 w-3" /> Resources</span>
        </div>
      </div>
    );
  }

  return (
    <div className="oxsig-workspace-rail mb-2" data-workspace="collab">
      <div className="oxsig-rail-title"><MessageCircle className="h-4 w-4" /><span>Team channel</span></div>
      <div className="oxsig-rail-badges">
        <span><MessageCircle className="h-3 w-3" /> Sessions</span>
        <span><Users className="h-3 w-3" /> Members</span>
      </div>
      <div className="oxsig-rail-actions">
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2 text-xs" onClick={() => router.push('/collab/storyboards')}><BookOpen className="h-3.5 w-3.5" /> Board</Button>
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2 text-xs" onClick={() => router.push('/vault')}><LibraryBig className="h-3.5 w-3.5" /> Vault</Button>
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2 text-xs" onClick={() => router.push('/labs')}><SquareTerminal className="h-3.5 w-3.5" /> Lab</Button>
      </div>
    </div>
  );
}
