'use client';

import * as React from 'react';
import styles from './warroom.module.css';
import dynamic from 'next/dynamic';
import { Crosshair, Monitor, Network, Terminal, X } from 'lucide-react';
import { ControlLeasePanel } from '@/components/live-workspace/ControlLeasePanel';
import type { OperationAiNodeContext } from '@/lib/operations/ai-context';
import { Button } from '@/components/ui/button';

const OperationNodeTerminal = dynamic(() => import('@/components/operations/OperationNodeTerminal'), { ssr: false });
const InteractiveSsmDesktop = dynamic(() => import('@/components/labs/InteractiveSsmDesktop'), { ssr: false });
type ControlProps = React.ComponentProps<typeof ControlLeasePanel>;
type Node = OperationAiNodeContext & { computeStatus?: string };
type Props = ControlProps & {
  runId: string;
  nodes: Node[];
  status: string;
  paused: boolean;
  isOwner: boolean;
  selectedResourceId: string | null;
  selectionRevision?: number;
  onNodeChange: (node: Node | null) => void;
};

export function WarRoomConsole({ runId, nodes, status, paused, isOwner, selectedResourceId, selectionRevision = 0, onNodeChange, ...controlProps }: Props) {
  const [selected, setSelected] = React.useState<string | null>(null);
  const [surface, setSurface] = React.useState<'terminal' | 'desktop'>('terminal');
  const tabs = [
    ...nodes.map((node) => ({ id: `node:${node.id}`, label: node.label, node, resource: controlProps.resources.find((resource) => resource.resourceId === node.labInstanceId) })),
    ...controlProps.resources.filter((resource) => !nodes.some((node) => node.labInstanceId === resource.resourceId)).map((resource) => ({ id: `resource:${resource.id}`, label: resource.label, node: undefined, resource })),
  ];
  const active = tabs.find((tab) => tab.id === selected);
  const node = active?.node;
  const resource = active?.resource;
  const canOpen = !paused && !['failed', 'destroying', 'destroyed'].includes(status) && (!node || !['failed', 'destroying', 'destroyed'].includes(node.status) && (node.status === 'running' || node.computeStatus === 'running'));

  React.useEffect(() => {
    if (!selectedResourceId) return;
    const resource = controlProps.resources.find((item) => item.id === selectedResourceId);
    const node = nodes.find((item) => item.labInstanceId === resource?.resourceId);
    setSelected(node ? `node:${node.id}` : `resource:${selectedResourceId}`);
    setSurface('terminal');
    // Team-station selection is an explicit navigation action, not a polling refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedResourceId, selectionRevision]);

  React.useEffect(() => { onNodeChange(node || null); }, [node, onNodeChange]);

  function selectTab(id: string) { setSurface('terminal'); setSelected(id); }
  return (
    <section className={`${styles.console} min-w-0 overflow-hidden rounded-xl border border-primary/30 bg-card shadow-sm`} aria-label="Live machine console">
      <div className="flex flex-wrap items-center gap-2 border-b bg-slate-950 px-4 py-3 text-slate-100">
        <Crosshair className="h-5 w-5 text-cyan-400" /><span className="font-mono text-xs font-semibold uppercase tracking-widest">Mission console</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-400"><Network className="h-3.5 w-3.5" />{nodes.length} machines</span>
        <Button size="icon" variant="ghost" className="h-8 w-8" disabled={!active} aria-label="Close current machine view" onClick={() => setSelected(null)}><X className="h-4 w-4" /></Button>
      </div>
      <div role="tablist" aria-label="Machines" className="flex overflow-x-auto border-b bg-muted/20 p-1">
        {tabs.map((tab) => <button key={tab.id} id={`tab-${tab.id}`} type="button" role="tab" aria-selected={selected === tab.id} aria-controls="warroom-machine-panel" tabIndex={selected === tab.id || !active && tab === tabs[0] ? 0 : -1}
          onClick={() => selectTab(tab.id)} onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const index = tabs.indexOf(tab);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
            selectTab(tabs[next].id);
            document.getElementById(`tab-${tabs[next].id}`)?.focus();
          }}
          className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-3 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${selected === tab.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}>
          {tab.node?.osFamily.toLowerCase().includes('windows') || tab.resource?.accessMode === 'desktop' ? <Monitor className="h-4 w-4" /> : <Terminal className="h-4 w-4" />}{tab.label}
        </button>)}
      </div>
      <div id="warroom-machine-panel" role="tabpanel" aria-labelledby={active ? `tab-${active.id}` : undefined} aria-label={!active ? 'Choose a machine' : undefined} className="min-h-[420px] min-w-0 p-3 sm:p-4">
        {!active ? <div className="flex min-h-96 flex-col items-center justify-center gap-3 text-center"><Crosshair className="h-12 w-12 text-primary/50" /><p className="font-mono text-sm">Choose your station</p><p className="max-w-sm text-xs text-muted-foreground">Select a machine tab to open its available terminal or desktop.</p></div>
          : !canOpen ? <div role="status" className="flex min-h-96 flex-col items-center justify-center gap-3"><Network className="h-10 w-10 text-primary" /><p className="text-sm">{paused ? 'Resume the environment to connect.' : `Machine unavailable · ${node?.status || status}`}</p></div>
          : resource ? <ControlLeasePanel key={`${runId}:${resource.id}`} {...controlProps} compact resources={[resource]} control={{ ...controlProps.control, requests: controlProps.control.requests.filter((item) => item.bindingId === resource.id), leases: controlProps.control.leases.filter((item) => item.bindingId === resource.id) }} />
          : node && isOwner ? <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2"><span className="mr-auto font-mono text-xs text-muted-foreground">{node.privateIp || 'Private IP pending'}</span>
              <Button size="sm" variant={surface === 'terminal' ? 'default' : 'outline'} aria-pressed={surface === 'terminal'} onClick={() => setSurface('terminal')}><Terminal className="mr-1 h-4 w-4" />Terminal</Button>
              {node.osFamily.toLowerCase().includes('windows') && <Button size="sm" variant={surface === 'desktop' ? 'default' : 'outline'} aria-pressed={surface === 'desktop'} onClick={() => setSurface('desktop')}><Monitor className="mr-1 h-4 w-4" />Desktop</Button>}
            </div>
            {surface === 'desktop' ? <InteractiveSsmDesktop key={`${runId}:${node.id}:desktop`} labInstanceId={node.id} machineLabel={node.label} sessionEndpoint={`/api/operations/runs/${encodeURIComponent(runId)}/nodes/${encodeURIComponent(node.id)}/desktop/session`} />
              : <OperationNodeTerminal key={`${runId}:${node.id}:terminal`} runId={runId} nodeId={node.id} machineLabel={node.label} />}
          </div> : <div className="flex min-h-96 items-center justify-center text-center text-sm text-muted-foreground">This machine is available to the Operation host. Select a contributed team terminal to collaborate.</div>}
      </div>
      <div className="border-t px-4 py-2 font-mono text-[10px] text-muted-foreground">One active view · switching machines disconnects the previous view</div>
    </section>
  );
}
