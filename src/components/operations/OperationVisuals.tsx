import type { ComponentType } from 'react';
import {
  ArrowRight,
  CloudCog,
  Globe2,
  HardDrive,
  Monitor,
  Network,
  Route,
  Server,
  Terminal,
} from 'lucide-react';
import type { OperationIconKey, OperationTopologyKind, OperationTopologyNode } from '@/lib/operations/catalog';

const OPERATION_ICONS: Record<OperationIconKey, ComponentType<{ className?: string }>> = {
  directory: Network,
  shell: Terminal,
  pivot: Route,
  web: Globe2,
  forensics: HardDrive,
  cloud: CloudCog,
};

const TOPOLOGY_ICONS: Record<OperationTopologyKind, ComponentType<{ className?: string }>> = {
  operator: Terminal,
  workstation: Monitor,
  server: Server,
  service: Globe2,
  evidence: HardDrive,
  cloud: CloudCog,
};

export function OperationIcon({ icon, className }: { icon: OperationIconKey; className?: string }) {
  const Icon = OPERATION_ICONS[icon];
  return <Icon className={className} />;
}

export function TopologyNodeIcon({ kind, className }: { kind: OperationTopologyKind; className?: string }) {
  const Icon = TOPOLOGY_ICONS[kind];
  return <Icon className={className} />;
}

export function OperationTopologyPreview({
  nodes,
  compact = false,
}: {
  nodes: OperationTopologyNode[];
  compact?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Operation topology">
      {nodes.map((node, index) => (
        <div key={`${node.label}:${index}`} className="contents">
          <div className={`flex min-w-0 items-center gap-2 rounded-lg border bg-background/70 ${compact ? 'px-2 py-1.5' : 'px-2.5 py-2'}`}>
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <TopologyNodeIcon kind={node.kind} className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className={`${compact ? 'text-[10px]' : 'text-[11px]'} truncate font-medium`}>{node.label}</p>
              {node.platform ? <p className="truncate text-[9px] text-muted-foreground">{node.platform}</p> : null}
            </div>
          </div>
          {index < nodes.length - 1 ? <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
        </div>
      ))}
    </div>
  );
}
