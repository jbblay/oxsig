'use client';

import * as React from 'react';
import styles from './warroom.module.css';
import dynamic from 'next/dynamic';
import { Crosshair, Monitor, Network, Terminal } from 'lucide-react';
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

type Surface = 'terminal' | 'desktop';

type MachineTab = {
  id: string;
  label: string;
  node?: Node;
  resource?: ControlProps['resources'][number];
};

export function WarRoomConsole({ runId, nodes, status, paused, isOwner, selectedResourceId, selectionRevision = 0, onNodeChange, ...controlProps }: Props) {
  const [selected, setSelected] = React.useState<string | null>(null);
  const [mountedTabs, setMountedTabs] = React.useState<string[]>([]);
  const [surfaceByTab, setSurfaceByTab] = React.useState<Record<string, Surface>>({});
  const [mountedSurfacesByTab, setMountedSurfacesByTab] = React.useState<Record<string, Surface[]>>({});

  const tabs = React.useMemo<MachineTab[]>(() => [
    ...nodes.map((node) => ({
      id: `node:${node.id}`,
      label: node.label,
      node,
      resource: controlProps.resources.find((resource) => resource.resourceId === node.labInstanceId),
    })),
    ...controlProps.resources
      .filter((resource) => !nodes.some((node) => node.labInstanceId === resource.resourceId))
      .map((resource) => ({ id: `resource:${resource.id}`, label: resource.label, node: undefined, resource })),
  ], [controlProps.resources, nodes]);

  const active = tabs.find((tab) => tab.id === selected);
  const activeNode = active?.node;

  const rememberSurface = React.useCallback((tabId: string, surface: Surface) => {
    setMountedSurfacesByTab((current) => {
      const mounted = current[tabId] || [];
      return mounted.includes(surface) ? current : { ...current, [tabId]: [...mounted, surface] };
    });
  }, []);

  const rememberTab = React.useCallback((id: string) => {
    setMountedTabs((current) => current.includes(id) ? current : [...current, id]);
    rememberSurface(id, 'terminal');
  }, [rememberSurface]);

  React.useEffect(() => {
    if (tabs.length === 0) {
      if (selected !== null) setSelected(null);
      return;
    }

    if (!selected || !tabs.some((tab) => tab.id === selected)) {
      const firstId = tabs[0].id;
      setSelected(firstId);
      rememberTab(firstId);
    }
  }, [rememberTab, selected, tabs]);

  React.useEffect(() => {
    if (!selectedResourceId) return;
    const resource = controlProps.resources.find((item) => item.id === selectedResourceId);
    const node = nodes.find((item) => item.labInstanceId === resource?.resourceId);
    const nextId = node ? `node:${node.id}` : `resource:${selectedResourceId}`;
    if (!tabs.some((tab) => tab.id === nextId)) return;
    setSelected(nextId);
    rememberTab(nextId);
    // Team-station selection is an explicit navigation action, not a polling refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedResourceId, selectionRevision]);

  React.useEffect(() => {
    onNodeChange(activeNode || null);
  }, [activeNode, onNodeChange]);

  function selectTab(id: string) {
    rememberTab(id);
    setSelected(id);
  }

  function selectSurface(tabId: string, surface: Surface) {
    rememberSurface(tabId, surface);
    setSurfaceByTab((current) => ({ ...current, [tabId]: surface }));
  }

  function canOpenTab(tab: MachineTab) {
    if (paused || ['failed', 'destroying', 'destroyed'].includes(status)) return false;
    if (!tab.node) return true;
    return !['failed', 'destroying', 'destroyed'].includes(tab.node.status)
      && (tab.node.status === 'running' || tab.node.computeStatus === 'running');
  }

  function renderMachine(tab: MachineTab) {
    const node = tab.node;
    const resource = tab.resource;
    const canOpen = canOpenTab(tab);
    const surface = surfaceByTab[tab.id] || 'terminal';
    const mountedSurfaces = mountedSurfacesByTab[tab.id] || ['terminal'];

    if (!canOpen) {
      return (
        <div role="status" className="flex min-h-96 flex-col items-center justify-center gap-3">
          <Network className="h-10 w-10 text-red-300" />
          <p className="font-mono text-xs text-slate-300">{paused ? 'Resume the environment to connect.' : `Machine unavailable · ${node?.status || status}`}</p>
        </div>
      );
    }

    if (resource) {
      return (
        <ControlLeasePanel
          key={`${runId}:${resource.id}`}
          {...controlProps}
          compact
          resources={[resource]}
          control={{
            ...controlProps.control,
            requests: controlProps.control.requests.filter((item) => item.bindingId === resource.id),
            leases: controlProps.control.leases.filter((item) => item.bindingId === resource.id),
          }}
        />
      );
    }

    if (node && isOwner) {
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-2">
            <span className="mr-auto font-mono text-[10px] text-slate-400">NODE // {node.privateIp || 'PRIVATE IP PENDING'}</span>
            <Button
              size="sm"
              variant={surface === 'terminal' ? 'default' : 'outline'}
              aria-pressed={surface === 'terminal'}
              className={surface === 'terminal' ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white'}
              onClick={() => selectSurface(tab.id, 'terminal')}
            >
              <Terminal className="mr-1 h-4 w-4" />Terminal
            </Button>
            {node.osFamily.toLowerCase().includes('windows') && (
              <Button
                size="sm"
                variant={surface === 'desktop' ? 'default' : 'outline'}
                aria-pressed={surface === 'desktop'}
                className={surface === 'desktop' ? 'bg-sky-600 text-white hover:bg-sky-500' : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white'}
                onClick={() => selectSurface(tab.id, 'desktop')}
              >
                <Monitor className="mr-1 h-4 w-4" />Desktop
              </Button>
            )}
          </div>

          {mountedSurfaces.includes('desktop') && node.osFamily.toLowerCase().includes('windows') ? (
            <div hidden={surface !== 'desktop'} aria-hidden={surface !== 'desktop'}>
              <InteractiveSsmDesktop
                key={`${runId}:${node.id}:desktop`}
                labInstanceId={node.id}
                machineLabel={node.label}
                sessionEndpoint={`/api/operations/runs/${encodeURIComponent(runId)}/nodes/${encodeURIComponent(node.id)}/desktop/session`}
              />
            </div>
          ) : null}

          {mountedSurfaces.includes('terminal') ? (
            <div hidden={surface !== 'terminal'} aria-hidden={surface !== 'terminal'}>
              <OperationNodeTerminal
                key={`${runId}:${node.id}:terminal`}
                runId={runId}
                nodeId={node.id}
                machineLabel={node.label}
              />
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div className="flex min-h-96 items-center justify-center text-center text-sm text-slate-400">
        This machine is available to the Operation host. Select a contributed team terminal to collaborate.
      </div>
    );
  }

  const visitedTabs = tabs.filter((tab) => mountedTabs.includes(tab.id));

  return (
    <section className={`${styles.console} relative min-w-0 overflow-hidden rounded-xl border border-red-500/25 bg-slate-950 text-slate-100 shadow-sm`} aria-label="Live machine console">
      <div className="relative z-10 flex flex-wrap items-center gap-2 border-b border-white/10 bg-black/40 px-4 py-3">
        <span className={styles.liveDot} aria-hidden="true" />
        <Crosshair className="h-5 w-5 text-red-300" />
        <span className="font-mono text-sm font-semibold uppercase tracking-[0.14em] text-white">Mission console</span>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-red-300">live</span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] font-medium text-slate-300">
          <Network className="h-3.5 w-3.5 text-emerald-400" />{nodes.length} machines
        </span>
      </div>

      <div role="tablist" aria-label="Machines" className="relative z-10 flex overflow-x-auto border-b border-white/10 bg-black/30 p-1.5">
        {tabs.map((tab) => {
          const desktop = tab.node?.osFamily.toLowerCase().includes('windows') || tab.resource?.accessMode === 'desktop';
          const isActive = selected === tab.id;
          const isMounted = mountedTabs.includes(tab.id);
          const panelId = `warroom-machine-panel-${tab.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={panelId}
              tabIndex={isActive ? 0 : -1}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const index = tabs.indexOf(tab);
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
                selectTab(tabs[next].id);
                document.getElementById(`tab-${tabs[next].id}`)?.focus();
              }}
              className={`flex shrink-0 items-center gap-2 rounded px-3.5 py-3 font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400 ${isActive ? 'bg-red-500/15 text-white ring-1 ring-inset ring-red-400/30' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'}`}
            >
              {desktop ? <Monitor className={`h-4 w-4 ${isActive ? 'text-sky-300' : ''}`} /> : <Terminal className={`h-4 w-4 ${isActive ? 'text-emerald-300' : ''}`} />}
              <span className="max-w-44 truncate">{tab.label}</span>
              <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-red-400' : isMounted ? 'bg-emerald-400' : 'bg-slate-700'}`} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <div className="relative z-10 min-h-[420px] min-w-0 p-3 sm:p-4">
        {tabs.length === 0 ? (
          <div className="flex min-h-96 flex-col items-center justify-center gap-3 text-center">
            <Crosshair className="h-12 w-12 text-red-400/40" />
            <p className="font-mono text-sm uppercase tracking-wider text-slate-200">Waiting for mission machines</p>
            <p className="max-w-sm text-sm leading-6 text-slate-400">The console will bring each provisioned machine into this workspace automatically.</p>
          </div>
        ) : null}

        {visitedTabs.map((tab) => {
          const isActive = selected === tab.id;
          const panelId = `warroom-machine-panel-${tab.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
          return (
            <div
              key={tab.id}
              id={panelId}
              role="tabpanel"
              aria-labelledby={`tab-${tab.id}`}
              hidden={!isActive}
              aria-hidden={!isActive}
              className="min-w-0"
            >
              {renderMachine(tab)}
            </div>
          );
        })}
      </div>

      <div className="relative z-10 flex flex-wrap items-center gap-2 border-t border-white/10 bg-black/30 px-4 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-slate-400">
        <span className="text-emerald-300">Persistent sessions</span>
        <span>·</span>
        <span>visited machine views stay mounted</span>
        <span>·</span>
        <span>switch without losing terminal or desktop state</span>
      </div>
    </section>
  );
}
