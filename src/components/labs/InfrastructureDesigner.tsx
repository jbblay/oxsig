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
import { getCsrfToken } from '@/lib/security/csrf-client';

const NODE_TYPES = { infrastructure: InfrastructureDeviceNode };
const SAVE_DELAY_MS = 650;

type SaveState = 'loading' | 'saved' | 'saving' | 'error';

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

  const updateSelected = React.useCallback((field: keyof InfrastructureDeviceNodeData, value: string) => {
    if (!selectedNodeId) return;
    setNodes((current) => current.map((node) => {
      if (node.id !== selectedNodeId) return node;
      return { ...node, data: { ...node.data, [field]: value } };
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
    <div className="space-y-4 pb-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold md:text-3xl">Infrastructure Designer</h1>
            <Badge variant="secondary">Blueprint v1</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Build the intended network first. OXSIG stores and validates the blueprint separately from live AWS runtime state so it can later become a controlled deployment plan.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
      </div>

      <div className="grid min-h-[680px] gap-3 xl:grid-cols-[250px_minmax(0,1fr)_310px]">
        <aside className="overflow-hidden rounded-2xl border bg-card">
          <div className="border-b p-4"><p className="font-semibold">Technical palette</p><p className="mt-1 text-xs text-muted-foreground">Drag a device to the canvas or tap Add.</p></div>
          <div className="max-h-[620px] space-y-2 overflow-auto p-3">
            {INFRASTRUCTURE_KINDS.map((kind) => {
              const meta = INFRASTRUCTURE_KIND_META[kind];
              return (
                <div key={kind} draggable onDragStart={(event) => { event.dataTransfer.setData('application/x-oxsig-infrastructure-kind', kind); event.dataTransfer.effectAllowed = 'move'; }} className="rounded-xl border bg-background p-3 transition hover:border-primary/40 hover:shadow-sm">
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted ring-1 ring-border"><InfrastructureKindIcon kind={kind} className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1"><p className="text-sm font-medium">{meta.label}</p><p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{meta.description}</p></div>
                    <GripVertical className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/60" />
                  </div>
                  <Button size="sm" variant="ghost" className="mt-2 h-8 w-full" onClick={() => addDevice(kind)}><Plus className="mr-1.5 h-3.5 w-3.5" />Add {meta.label}</Button>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="relative min-h-[680px] overflow-hidden rounded-2xl border bg-muted/10">
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
            {nodes.length === 0 && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="max-w-sm rounded-2xl border border-dashed bg-background/90 p-8 text-center shadow-sm backdrop-blur"><Network className="mx-auto h-10 w-10 text-muted-foreground/50" /><p className="mt-3 font-medium">Design the system before you deploy it</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Add clients, servers, routers, switches, and firewalls. Connect them, configure addressing, then let OXSIG validate the blueprint.</p></div></div>}
          </ReactFlow>
          <div className="pointer-events-none absolute left-3 top-3 rounded-lg border bg-background/90 px-3 py-2 text-[10px] text-muted-foreground shadow-sm backdrop-blur">Blueprint only · deployment compiler comes after the design contract is proven</div>
        </section>

        <aside className="overflow-hidden rounded-2xl border bg-card">
          <div className="border-b p-4"><p className="font-semibold">Inspector</p><p className="mt-1 text-xs text-muted-foreground">Configure the selected technical device.</p></div>
          {!selectedNode ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center p-6 text-center text-muted-foreground"><Network className="h-8 w-8 opacity-40" /><p className="mt-3 text-sm font-medium">Nothing selected</p><p className="mt-1 text-xs">Choose a device on the canvas.</p></div>
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

              <div className="space-y-2 rounded-xl border p-3">
                <div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Validation</p><Badge variant={validation.valid ? 'outline' : 'destructive'} className="text-[9px]">{validation.valid ? 'No blocking errors' : `${validation.errors.length} blocking`}</Badge></div>
                {validation.issues.filter((issue) => !issue.nodeId || issue.nodeId === selectedNode.id).slice(0, 6).map((issue, index) => <div key={`${issue.code}-${index}`} className={`rounded-lg p-2 text-[11px] leading-4 ${issue.severity === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>{issue.message}</div>)}
                {!validation.issues.some((issue) => issue.nodeId === selectedNode.id) && <p className="text-[11px] text-muted-foreground">This device has no addressing or connectivity issues detected.</p>}
              </div>

              <Button variant="destructive" className="w-full" onClick={removeSelected}><Trash2 className="mr-2 h-4 w-4" />Remove device</Button>
            </div>
          )}

          <div className="border-t p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Whole design</p>
            <div className="mt-2 space-y-1.5">
              {validation.issues.slice(0, 5).map((issue, index) => <p key={`${issue.code}-summary-${index}`} className={`text-[11px] leading-4 ${issue.severity === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>• {issue.message}</p>)}
              {validation.issues.length === 0 && <p className="text-[11px] text-muted-foreground">No validation issues detected. The blueprint is ready for a future deployment translation step.</p>}
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
