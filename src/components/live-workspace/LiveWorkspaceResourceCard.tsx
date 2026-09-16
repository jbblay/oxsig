'use client';

import Link from 'next/link';
import { BookOpen, Boxes, ExternalLink, GraduationCap, LibraryBig, Monitor, Network, TerminalSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export type LiveWorkspaceResourceType = 'lab-instance' | 'academy-course' | 'infrastructure-design' | 'storyboard' | 'vault-item';

export type LiveWorkspaceResourceView = {
  id: string;
  type: LiveWorkspaceResourceType;
  resourceId: string;
  resourceOwnerId: string;
  resourceOwnerName: string;
  label: string;
  accessMode: 'terminal' | 'desktop' | null;
  ownershipTransferred: false;
};

const RESOURCE_LABELS: Record<LiveWorkspaceResourceType, string> = {
  'lab-instance': 'Cyber Lab',
  'academy-course': 'Academy course',
  'infrastructure-design': 'Infrastructure design',
  storyboard: 'Board',
  'vault-item': 'Vault item',
};

export function liveWorkspaceResourceHref(resource: Pick<LiveWorkspaceResourceView, 'type'>) {
  if (resource.type === 'lab-instance') return '/labs';
  if (resource.type === 'academy-course') return '/academy';
  if (resource.type === 'storyboard') return '/collab/storyboards';
  if (resource.type === 'vault-item') return '/vault';
  return '/manage';
}

function ResourceIcon({ type, accessMode }: Pick<LiveWorkspaceResourceView, 'type' | 'accessMode'>) {
  if (type === 'lab-instance') return accessMode === 'desktop' ? <Monitor className="h-4 w-4" /> : <TerminalSquare className="h-4 w-4" />;
  if (type === 'academy-course') return <GraduationCap className="h-4 w-4" />;
  if (type === 'storyboard') return <BookOpen className="h-4 w-4" />;
  if (type === 'vault-item') return <LibraryBig className="h-4 w-4" />;
  if (type === 'infrastructure-design') return <Network className="h-4 w-4" />;
  return <Boxes className="h-4 w-4" />;
}

export default function LiveWorkspaceResourceCard({
  resource,
  canDetach,
  busy,
  onDetach,
}: {
  resource: LiveWorkspaceResourceView;
  canDetach: boolean;
  busy: boolean;
  onDetach: () => void;
}) {
  const href = liveWorkspaceResourceHref(resource);
  return (
    <div className="group rounded-xl border bg-card/70 p-3 transition-colors hover:bg-muted/20">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ResourceIcon type={resource.type} accessMode={resource.accessMode} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{resource.label}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>{RESOURCE_LABELS[resource.type]}</span>
            {resource.accessMode && <><span>·</span><span>{resource.accessMode === 'terminal' ? 'Terminal' : 'Desktop'}</span></>}
            <span>·</span>
            <span className="truncate">{resource.resourceOwnerName}</span>
          </div>
        </div>
        <Badge variant="outline" className="hidden shrink-0 text-[9px] sm:inline-flex">Owner retained</Badge>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2 border-t pt-2.5">
        <Button asChild size="sm" variant="outline" className="h-8">
          <Link href={href}>
            Open <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </Button>
        {canDetach && (
          <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={onDetach}>
            Detach
          </Button>
        )}
      </div>
    </div>
  );
}
