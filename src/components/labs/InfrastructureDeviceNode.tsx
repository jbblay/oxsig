'use client';

import { Monitor, Network, Router, Server, ShieldCheck } from 'lucide-react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { InfrastructureKind } from '@/lib/infrastructure/designer-schema';
import { getRuntimeProfile, type RuntimeProfileSelection } from '@/lib/infrastructure/runtime-profile';

export type InfrastructureDeviceNodeData = {
  kind: InfrastructureKind;
  label: string;
  hostname?: string;
  ipv4?: string;
  cidr?: string;
  gateway?: string;
  role?: string;
  runtimeProfile?: RuntimeProfileSelection;
};

export type InfrastructureDeviceFlowNode = Node<InfrastructureDeviceNodeData, 'infrastructure'>;

export const INFRASTRUCTURE_KIND_META: Record<InfrastructureKind, { label: string; description: string }> = {
  client: { label: 'Client', description: 'User workstation or member endpoint' },
  server: { label: 'Server', description: 'Application, directory, file, or service host' },
  router: { label: 'Router', description: 'Routes traffic between networks' },
  switch: { label: 'Switch', description: 'Connects devices on a local network' },
  firewall: { label: 'Firewall', description: 'Filters and controls network traffic' },
};

export function InfrastructureKindIcon({ kind, className = 'h-5 w-5' }: { kind: InfrastructureKind; className?: string }) {
  if (kind === 'client') return <Monitor className={className} />;
  if (kind === 'server') return <Server className={className} />;
  if (kind === 'router') return <Router className={className} />;
  if (kind === 'firewall') return <ShieldCheck className={className} />;
  return <Network className={className} />;
}

export default function InfrastructureDeviceNode({ data, selected }: NodeProps<InfrastructureDeviceFlowNode>) {
  const meta = INFRASTRUCTURE_KIND_META[data.kind];
  const identity = data.hostname?.trim() || meta.label;
  const address = data.ipv4?.trim() || 'Address not set';
  const runtimeProfile = getRuntimeProfile(data.runtimeProfile?.profileId);

  return (
    <div className={`min-w-[210px] rounded-2xl border bg-background/95 shadow-lg backdrop-blur transition ${selected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/40'}`}>
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-background !bg-primary" />
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted ring-1 ring-border">
          <InfrastructureKindIcon kind={data.kind} className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold">{data.label}</p>
            {selected ? <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">Selected</span> : null}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{identity}</p>
          <p className="mt-2 truncate font-mono text-[10px] text-muted-foreground">{address}{data.cidr ? ` · ${data.cidr}` : ''}</p>
          {(data.kind === 'client' || data.kind === 'server') && (
            <p className="mt-1 truncate text-[10px] text-muted-foreground">{runtimeProfile?.label || 'Runtime profile not selected'}{data.runtimeProfile ? ` · ${data.runtimeProfile.accessMode}` : ''}</p>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between border-t px-4 py-2 text-[10px] text-muted-foreground">
        <span className="capitalize">{meta.label}</span>
        <span className="max-w-[125px] truncate">{data.role?.trim() || 'Design node'}</span>
      </div>
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-background !bg-primary" />
    </div>
  );
}
