'use client';

import * as React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  GripVertical,
  Loader2,
  Network,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type ReactFlowInstance,
} from '@xyflow/react';
import { toast } from 'sonner';
import InfrastructureDeviceNode, {
  INFRASTRUCTURE_KIND_META,
  InfrastructureKindIcon,
  type InfrastructureDeviceFlowNode,
  type InfrastructureDeviceNodeData,
} from '@/components/labs/InfrastructureDeviceNode';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  EMPTY_INFRASTRUCTURE_DESIGN,
  INFRASTRUCTURE_KINDS,
  type InfrastructureDesign,
  type InfrastructureKind,
} from '@/lib/infrastructure/designer-schema';
import { validateInfrastructureDesign } from '@/lib/infrastructure/designer-validation';
import {
  RUNTIME_PROFILE_CATALOG,
  RUNTIME_RESOURCE_CLASSES,
  defaultRuntimeProfileSelection,
  getRuntimeProfile,
  getRuntimeProfileAvailability,
  type RuntimeProfileSelection,
} from '@/lib/infrastructure/runtime-profile';
import { getCsrfToken } from '@/lib/security/csrf-client';

const NODE_TYPES = { infrastructure: InfrastructureDeviceNode };
const SAVE_DELAY_MS = 650;

type SaveState = 'loading' | 'saved' | 'saving' | 'error';
type EditableTextField = Exclude<keyof InfrastructureDeviceNodeData, 'kind' | 'runtimeProfile'>;

function uniqueNodeId(kind: InfrastructureKind) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${kind}-${crypto.randomUUID()}`;
  return `${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function persistedNodeData(data: InfrastructureDeviceNodeData): InfrastructureDeviceNodeData {
  return {
    kind: data.kind,
    label: data.label,
    ...(data.hostname?.trim() ? { hostname: data.hostname.trim() } : {}),
    ...(data.ipv4?.trim() ? { ipv4: data.ipv4.trim() } : {}),
    ...(data.cidr?.trim() ? { cidr: data.cidr.trim() } : {}),
    ...(data.gateway?.trim() ? { gateway: data.gateway.trim() } : {}),
    ...(data.role?.trim() ? { role: data.role.trim() } : {}),
    ...(data.runtimeProfile ? { runtimeProfile: data.runtimeProfile } : {}),
  };
}

function serializeDesign(nodes: InfrastructureDeviceFlowNode[], edges: Edge[]): InfrastructureDesign {
  return {
    version: 1,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: 'infrastructure' as const,
      position: { x: node.position.x, y: node.position.y },
      data: persistedNodeData(node.data),
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
      ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
      ...(edge.type ? { type: edge.type } : {}),
      ...(typeof edge.animated === 'boolean' ? { animated: edge.animated } : {}),
      ...(typeof edge.label === 'string' ? { label: edge.label } : {}),
    })),
  };
}

function nextLabel(kind: InfrastructureKind, nodes: InfrastructureDeviceFlowNode[]) {
  const count = nodes.filter((node) => node.data.kind === kind).length + 1;
  const base = INFRASTRUCTURE_KIND_META[kind].label;
  return `${base}-${String(count).padStart(2, '0')}`;
}

export default function InfrastructureDesigner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<InfrastructureDeviceFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [flow, setFlow] = React.useState<ReactFlowInstance<InfrastructureDeviceFlowNode, Edge> | null>(null);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);
  const [saveState, setSaveState] = React.useState<SaveState>('loading');
  const lastSavedRef = React.useRef<string>(JSON.stringify(EMPTY_INFRASTRUCTURE_DESIGN));
  const latestSerializedRef = React.useRef(lastSavedRef.current);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;
  const design = React.useMemo(() => serializeDesign(nodes, edges), [edges, nodes]);
  const serialized = React.useMemo(() => JSON.stringify(design), [design]);
  const validation = React.useMemo(() => validateInfrastructureDesign(design), [design]);
  const selectedRuntimeProfile = getRuntimeProfile(selectedNode?.data.runtimeProfile?.profileId);
  const selectedRuntimeAvailability = getRuntimeProfileAvailability(selectedNode?.data.runtimeProfile?.profileId);
  const selectedIsCompute = selectedNode?.data.kind === 'client' || selectedNode?.data.kind === 'server';
  const compatibleProfiles = selectedIsCompute
    ? RUNTIME_PROFILE_CATALOG.filter((profile) => profile.allowedKinds.includes(selectedNode.data.kind as 'client' | 'server'))
    : [];

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch('/api/labs/infrastructure-design', { cache: 'no-store' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Could not load the infrastructure design');
        const restored = (body.design || EMPTY_INFRASTRUCTURE_DESIGN) as InfrastructureDesign;
        if (cancelled) return;
        setNodes(restored.nodes as InfrastructureDeviceFlowNode[]);
        setEdges(restored.edges as Edge[]);
        const raw = JSON.stringify(restored);
        lastSavedRef.current = raw;
        latestSerializedRef.current = raw;
        setSaveState('saved');
      } catch (error) {
        if (!cancelled) {
          setSaveState('error');
          toast.error(error instanceof Error ? error.message : 'Could not load the infrastructure design');
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [setEdges, setNodes]);

  React.useEffect(() => {
    if (!ready) return;
    latestSerializedRef.current = serialized;
    if (serialized === lastSavedRef.current) {
      setSaveState('saved');
      return;
    }

    setSaveState('saving');
    const timer = window.setTimeout(() => {
      const payload = serialized;
      void (async () => {
        try {
          const csrf = await getCsrfToken();
          const response = await fetch('/api/labs/infrastructure-design', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
            body: payload,
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error || 'Could not save the infrastructure design');
          lastSavedRef.current = payload;
          if (latestSerializedRef.current === payload) setSaveState('saved');
        } catch (error) {
          if (latestSerializedRef.current === payload) setSaveState('error');
          toast.error(error instanceof Error ? error.message : 'Could not save the infrastructure design');
        }
      })();
    }, SAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [ready, serialized]);

  const addDevice = React.useCallback((kind: InfrastructureKind, position?: { x: number; y: number }) => {
    const id = uniqueNodeId(kind);
    const fallback = { x: 100 + (nodes.length % 3) * 280, y: 100 + Math.floor(nodes.length / 3) * 190 };
    const label = nextLabel(kind, nodes);
    const node: InfrastructureDeviceFlowNode = {
      id,
      type: 'infrastructure',
      position: position || fallback,
      data: { kind, label },
    };
    setNodes((current) => [...current, node]);
    setSelectedNodeId(id);
  }, [nodes, setNodes]);

  const onConnect = React.useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) {
      toast.error('Connect two different devices.');
      return;
    }
    setEdges((current) => {
      const exists = current.some((edge) => {
        const sameDirection = edge.source === connection.source && edge.target === connection.target;
        const reverseDirection = edge.source === connection.target && edge.target === connection.source;
        return sameDirection || reverseDirection;
      });
      if (exists) {
        toast.error('Those devices are already connected.');
        return current;
      }
      return addEdge({ ...connection, type: 'smoothstep', animated: true }, current);
    });
  }, [setEdges]);

  const updateSelected = React.useCallback((field: EditableTextField, value: string) => {
    if (!selectedNodeId) return;
    setNodes((current) => current.map((node) => {
      if (node.id !== selectedNodeId) return node;
      return { ...node, data: { ...node.data, [field]: value } };
    }));
  }, [selectedNodeId, setNodes]);

  const setRuntimeProfile = React.useCallback((selection?: RuntimeProfileSelection) => {
    if (!selectedNodeId) return;
    setNodes((current) => current.map((node) => {
      if (node.id !== selectedNodeId) return node;
      return { ...node, data: { ...node.data, runtimeProfile: selection } };
    }));
  }, [selectedNodeId, setNodes]);

  const patchRuntimeProfile = React.useCallback((patch: Partial<RuntimeProfileSelection>) => {
    if (!selectedNodeId) return;
    setNodes((current) => current.map((node) => {
      if (node.id !== selectedNodeId || !node.data.runtimeProfile) return node;
      return { ...node, data: { ...node.data, runtimeProfile: { ...node.data.runtimeProfile, ...patch } } };
    }));
  }, [selectedNodeId, setNodes]);

  const removeSelected = React.useCallback(() => {
    if (!selectedNodeId) return;
    setNodes((current) => current.filter((node) => node.id !== selectedNodeId));
    setEdges((current) => current.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
    setSelectedNodeId(null);
  }, [selectedNodeId, setEdges, setNodes]);

  if (!ready) {
    return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  }

  return (
    <div className="space-y-2 pb-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Badge variant="outline"><Network className="mr-1 h-3.5 w-3.5" />{nodes.length} devices · {edges.length} links</Badge>
        <Badge variant={validation.valid ? 'default' : 'destructive'}>
{validation.valid ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <AlertTriangle className="mr-1 h-3.5 w-3.5" />}
{validation.errors.length} errors · {validation.warnings.length} warnings
        </Badge>
        <Badge variant="outline">
{saveState === 'saving' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
{saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving' : 'Save issue'}
        </Badge>
      </div>

      <div className="grid min-h-[calc(100dvh-7rem)] gap-3 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_320px]">
        <aside className="order-2 overflow-hidden rounded-xl border bg-card lg:order-1">
          <div className="border-b p-3"><p className="text-sm font-semibold">Devices</p></div>
          <div className="max-h-[620px] space-y-2 overflow-auto p-3">
            {INFRASTRUCTURE_KINDS.map((kind) => {
              const meta = INFRASTRUCTURE_KIND_META[kind];
              return (
                <div key={kind} draggable onDragStart={(event) => { event.dataTransfer.setData('application/x-oxsig-infrastructure-kind', kind); event.dataTransfer.effectAllowed = 'move'; }} className="rounded-xl border bg-background p-3 transition hover:border-primary/40 hover:shadow-sm">
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted ring-1 ring-border"><InfrastructureKindIcon kind={kind} className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1"><p className="text-sm font-medium">{meta.label}</p></div>
                    <GripVertical className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/60" />
                  </div>
                  <Button size="sm" variant="ghost" className="mt-2 h-8 w-full" onClick={() => addDevice(kind)}><Plus className="mr-1.5 h-3.5 w-3.5" />Add {meta.label}</Button>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="order-1 relative min-h-[520px] overflow-hidden rounded-xl border bg-muted/10 sm:min-h-[620px] lg:order-2 lg:min-h-[calc(100dvh-8rem)]">
          <ReactFlow<InfrastructureDeviceFlowNode, Edge>
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setFlow}
            onNodeClick={(_event, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
            onDrop={(event) => {
              event.preventDefault();
              const kind = event.dataTransfer.getData('application/x-oxsig-infrastructure-kind') as InfrastructureKind;
              if (!INFRASTRUCTURE_KINDS.includes(kind)) return;
              const position = flow?.screenToFlowPosition({ x: event.clientX, y: event.clientY });
              addDevice(kind, position);
            }}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.35}
            maxZoom={1.8}
            defaultEdgeOptions={{ type: 'smoothstep' }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} />
            <Controls position="bottom-left" />
            <MiniMap pannable zoomable position="bottom-right" className="!bg-background/90" />
            {nodes.length === 0 && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Add a device</div>}
          </ReactFlow>
        </section>

        <aside className="order-3 overflow-hidden rounded-xl border bg-card lg:col-span-2 xl:col-span-1">
          <div className="border-b p-3"><p className="text-sm font-semibold">Inspector</p></div>
          {!selectedNode ? (
            <div className="flex min-h-[220px] items-center justify-center p-6 text-sm text-muted-foreground">Select a device</div>
          ) : (
            <div className="space-y-4 p-4">
              <div className="flex items-start gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted"><InfrastructureKindIcon kind={selectedNode.data.kind} className="h-5 w-5" /></div><div><p className="font-semibold">{selectedNode.data.label || 'Unnamed device'}</p><p className="text-xs capitalize text-muted-foreground">{selectedNode.data.kind}</p></div></div>
              <div className="space-y-3 rounded-xl border p-3">
                <Field label="Label" value={selectedNode.data.label} onChange={(value) => updateSelected('label', value.slice(0, 160))} placeholder="Domain Controller" />
                <Field label="Hostname" value={selectedNode.data.hostname || ''} onChange={(value) => updateSelected('hostname', value.slice(0, 253))} placeholder="dc01.lab.local" mono />
                <Field label="IPv4 address" value={selectedNode.data.ipv4 || ''} onChange={(value) => updateSelected('ipv4', value.slice(0, 64))} placeholder="10.0.0.10" mono />
                <Field label="Network CIDR" value={selectedNode.data.cidr || ''} onChange={(value) => updateSelected('cidr', value.slice(0, 64))} placeholder="10.0.0.0/24" mono />
                <Field label="Gateway" value={selectedNode.data.gateway || ''} onChange={(value) => updateSelected('gateway', value.slice(0, 64))} placeholder="10.0.0.1" mono />
                <Field label="Role" value={selectedNode.data.role || ''} onChange={(value) => updateSelected('role', value.slice(0, 240))} placeholder="AD DS + DNS" />
              </div>

              {selectedIsCompute && (
                <div className="space-y-3 rounded-xl border p-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Runtime profile</p>
                  </div>
                  <SelectField
                    label="Operating system"
                    value={selectedNode.data.runtimeProfile?.profileId || ''}
                    onChange={(value) => setRuntimeProfile(value ? defaultRuntimeProfileSelection(value) : undefined)}
                    options={[{ value: '', label: 'Not selected' }, ...compatibleProfiles.map((profile) => ({ value: profile.id, label: profile.label }))]}
                  />
                  {selectedNode.data.runtimeProfile && selectedRuntimeProfile && (
                    <>
                      <SelectField
                        label="Architecture"
                        value={selectedNode.data.runtimeProfile.architecture}
                        onChange={(value) => patchRuntimeProfile({ architecture: value as RuntimeProfileSelection['architecture'] })}
                        options={selectedRuntimeProfile.supportedArchitectures.map((value) => ({ value, label: value }))}
                      />
                      <SelectField
                        label="Resource class"
                        value={selectedNode.data.runtimeProfile.resourceClass}
                        onChange={(value) => patchRuntimeProfile({ resourceClass: value as RuntimeProfileSelection['resourceClass'] })}
                        options={RUNTIME_RESOURCE_CLASSES.map((value) => ({ value, label: value }))}
                      />
                      <SelectField
                        label="Access"
                        value={selectedNode.data.runtimeProfile.accessMode}
                        onChange={(value) => patchRuntimeProfile({ accessMode: value as RuntimeProfileSelection['accessMode'] })}
                        options={selectedRuntimeProfile.supportedAccessModes.map((value) => ({ value, label: value }))}
                      />
                      <div className={`rounded-lg p-2 text-[11px] leading-4 ${selectedRuntimeAvailability.available ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>
                        {selectedRuntimeAvailability.available
                          ? `Mapped to the controlled ${selectedRuntimeAvailability.labSlug} runtime adapter.`
                          : selectedRuntimeAvailability.note || 'This runtime profile is not currently deployable.'}
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="space-y-2 rounded-xl border p-3">
                <div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Validation</p><Badge variant={validation.valid ? 'outline' : 'destructive'} className="text-[9px]">{validation.valid ? 'No blocking errors' : `${validation.errors.length} blocking`}</Badge></div>
                {validation.issues.filter((issue) => !issue.nodeId || issue.nodeId === selectedNode.id).slice(0, 6).map((issue, index) => <div key={`${issue.code}-${index}`} className={`rounded-lg p-2 text-[11px] leading-4 ${issue.severity === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>{issue.message}</div>)}
                {!validation.issues.some((issue) => issue.nodeId === selectedNode.id) && <p className="text-[11px] text-muted-foreground">This device has no addressing, runtime-profile, or connectivity issues detected.</p>}
              </div>

              <Button variant="destructive" className="w-full" onClick={removeSelected}><Trash2 className="mr-2 h-4 w-4" />Remove device</Button>
            </div>
          )}

          <div className="border-t p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Whole design</p>
            <div className="mt-2 space-y-1.5">
              {validation.issues.slice(0, 5).map((issue, index) => <p key={`${issue.code}-summary-${index}`} className={`text-[11px] leading-4 ${issue.severity === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>• {issue.message}</p>)}
              {validation.issues.length === 0 && <p className="text-[11px] text-muted-foreground">No validation issues detected. The blueprint is ready for deployment translation.</p>}
              {validation.issues.length > 5 && <p className="text-[10px] text-muted-foreground">+{validation.issues.length - 5} more issues</p>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, mono = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; mono?: boolean }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={mono ? 'font-mono text-xs' : 'text-xs'} />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> | readonly { value: string; label: string }[] }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring">
        {options.map((option) => <option key={option.value || 'empty'} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
