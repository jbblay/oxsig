'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  BookOpen,
  Boxes,
  Circle,
  Eraser,
  Grid3X3,
  LibraryBig,
  Magnet,
  MessageCircle,
  Minus,
  Pencil,
  RadioTower,
  RotateCcw,
  Square,
  SquareTerminal,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import TerminalActivityStrip from './TerminalActivityStrip';

export type WorkspaceKind = 'labs' | 'collab' | 'boards' | 'live' | 'vault';

function BoardAction({ shortcut, label, icon: Icon }: { shortcut: string; label: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-8 gap-1.5 px-2 text-xs"
      onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: shortcut, bubbles: true }))}
      title={`${label} (${shortcut.toUpperCase()})`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </Button>
  );
}

export default function WorkspaceEnhancements({ kind }: { kind: WorkspaceKind }) {
  const router = useRouter();

  if (kind === 'labs') {
    return <div className="mb-2"><TerminalActivityStrip label="Lab terminal" /></div>;
  }

  if (kind === 'boards') {
    return (
      <div className="oxsig-workspace-rail mb-2" data-workspace="boards">
        <div className="oxsig-rail-title"><BookOpen className="h-4 w-4" /><span>Board controls</span></div>
        <div className="oxsig-rail-actions">
          <BoardAction shortcut="p" label="Pen" icon={Pencil} />
          <BoardAction shortcut="e" label="Eraser" icon={Eraser} />
          <BoardAction shortcut="l" label="Line" icon={Minus} />
          <BoardAction shortcut="a" label="Arrow" icon={ArrowUpRight} />
          <BoardAction shortcut="r" label="Rectangle" icon={Square} />
          <BoardAction shortcut="o" label="Ellipse" icon={Circle} />
          <BoardAction shortcut="g" label="Grid" icon={Grid3X3} />
          <BoardAction shortcut="s" label="Snap" icon={Magnet} />
          <BoardAction shortcut="0" label="Fit" icon={RotateCcw} />
        </div>
      </div>
    );
  }

  // Vault already owns its compact command bar and item handoff actions. A
  // second rail duplicated both the UI and the initial /api/vault request.
  if (kind === 'vault') return null;

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
