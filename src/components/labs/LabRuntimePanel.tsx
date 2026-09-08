"use client";

import * as React from "react";
import {
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleStop,
  GripVertical,
  Info,
  Loader2,
  Maximize2,
  Minimize2,
  Monitor,
  Network,
  PanelBottom,
  Play,
  Plus,
  RefreshCw,
  Server,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
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
} from "@xyflow/react";
import { toast } from "sonner";
import InteractiveSsmDesktop from "@/components/labs/InteractiveSsmDesktop";
import InteractiveSsmTerminal from "@/components/labs/InteractiveSsmTerminal";
import LabMachineNode, { LabOsIcon, type LabMachineFlowNode, type LabMachineNodeData } from "@/components/labs/LabMachineNode";
import { useLabTopologyDurableState } from "@/components/labs/LabTopologyDurableStateProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getLabsSnapshot, invalidateLabsSnapshot } from "@/lib/labs/client";
import { applyOptimisticLabLifecycle, replaceLabInstance, type LabLifecycleAction } from "@/lib/labs/optimistic-lifecycle";
import { LabTopologySaveQueue } from "@/lib/labs/topology-save-queue";
import type { LabTopology } from "@/lib/labs/topology-schema";
import type {
  LabAccessMode,
  LabInstanceStatus,
  LearnerLabDefinition,
  LearnerLabRuntimeCapabilities,
} from "@/lib/labs/types";
import { getCsrfToken } from "@/lib/security/csrf-client";

type Instance = {
  id: string;
  slug: string;
  name: string;
  status: LabInstanceStatus;
  createdAt: string;
  startedAt?: string | null;
  expiresAt: string;
  metadata?: { accessMode?: LabAccessMode };
};

type TerminalDiagnostics = {
  region: string;
  instanceId: string;
  ec2State: string;
  instanceProfileConfigured: boolean;
  ssmRegistered: boolean;
  ssmPingStatus: string | null;
  ssmAgentVersion: string | null;
  platformType: string | null;
  platformName: string | null;
  platformVersion: string | null;
  ready: boolean;
};

type TerminalFailure = { error: string; code?: string; stage?: string };
type DockTab = "desktop" | "terminal" | "events" | "network" | "diagnostics";

type LayoutState = {
  machinesOpen: boolean;
  inspectorOpen: boolean;
  topologyOpen: boolean;
  dockCollapsed: boolean;
};

const TRANSITIONAL: LabInstanceStatus[] = ["created", "provisioning", "stopping", "destroying", "resetting"];
const NODE_TYPES = { machine: LabMachineNode };
const RUNTIME_NODE_KEY = "oxsig:cyber-lab-runtime-node:v1";
const LAYOUT_KEY = "oxsig:cyber-lab-layout:v1";
const ACTION_BUTTON = "min-h-11 h-auto w-full justify-start whitespace-normal text-left py-2";
const TOPOLOGY_SAVE_DEBOUNCE_MS = 400;

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return body?.error || fallback;
}

function short(value?: string | null, size = 12) {
  if (!value) return "—";
  return value.length <= size ? value : `${value.slice(0, size)}…`;
}

function minutesUntil(value?: string | null) {
  if (!value) return null;
  const ms = new Date(value).getTime() - Date.now();
  return Number.isFinite(ms) ? Math.round(ms / 60_000) : null;
}

function relativeExpiry(value?: string | null) {
  const mins = minutesUntil(value);
  if (mins === null) return "—";
  if (mins <= 0) return "Expired";
  if (mins < 60) return `${mins}m left`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `${hours}h ${rem}m left` : `${hours}h left`;
}

function nodeData(
  lab: LearnerLabDefinition,
  label: string,
  status: LabMachineNodeData["status"] = "planned",
  live = false
): LabMachineNodeData {
  return {
    slug: lab.slug,
    label,
    shortName: lab.shortName,
    category: lab.category,
    osFamily: lab.osFamily,
    platform: lab.platform,
    available: lab.available,
    availabilityNote: lab.availabilityNote,
    status,
    live,
  };
}

function uniqueNodeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `machine-${crypto.randomUUID()}`;
  return `machine-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function topologyPayload(nodes: LabMachineFlowNode[], edges: Edge[]): LabTopology {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: "machine" as const,
      position: node.position,
      data: { slug: node.data.slug, label: node.data.label },
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.sourceHandle !== undefined ? { sourceHandle: edge.sourceHandle } : {}),
      ...(edge.targetHandle !== undefined ? { targetHandle: edge.targetHandle } : {}),
      ...(edge.type !== undefined ? { type: edge.type } : {}),
      ...(edge.animated !== undefined ? { animated: Boolean(edge.animated) } : {}),
    })),
  };
}

export default function LabRuntimePanel({ embedded = false }: { embedded?: boolean }) {
  const { initialTopology, saveTopology } = useLabTopologyDurableState();
  const [catalog, setCatalog] = React.useState<LearnerLabDefinition[]>([]);
  const [capabilities, setCapabilities] = React.useState<LearnerLabRuntimeCapabilities | null>(null);
  const [instances, setInstances] = React.useState<Instance[]>([]);
  const [reconciliationWarning, setReconciliationWarning] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<LabMachineFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [flow, setFlow] = React.useState<ReactFlowInstance<LabMachineFlowNode, Edge> | null>(null);
  const [topologyReady, setTopologyReady] = React.useState(false);
  const topologySaveQueue = React.useMemo(() => new LabTopologySaveQueue(
    saveTopology,
    (error) => toast.error(error instanceof Error ? error.message : "Cyber Lab topology could not be saved")
  ), [saveTopology]);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [liveNodeId, setLiveNodeId] = React.useState<string | null>(null);
  const [selectedAccessMode, setSelectedAccessMode] = React.useState<LabAccessMode>("terminal");

  const [dockOpen, setDockOpen] = React.useState(false);
  const [dockTab, setDockTab] = React.useState<DockTab>("terminal");
  const [dockCollapsed, setDockCollapsed] = React.useState(false);
  const [dockFocus, setDockFocus] = React.useState(false);
  const [terminalId, setTerminalId] = React.useState<string | null>(null);
  const [desktopId, setDesktopId] = React.useState<string | null>(null);
  const [terminalDiagnostics, setTerminalDiagnostics] = React.useState<TerminalDiagnostics | null>(null);
  const [terminalFailure, setTerminalFailure] = React.useState<TerminalFailure | null>(null);

  const [machinesOpen, setMachinesOpen] = React.useState(true);
  const [inspectorOpen, setInspectorOpen] = React.useState(true);
  const [topologyOpen, setTopologyOpen] = React.useState(true);
  const [compactPanel, setCompactPanel] = React.useState<"machines" | "topology" | "inspector">("topology");
  const [layoutReady, setLayoutReady] = React.useState(false);

  const instance = instances[0];
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;
  const liveNode = nodes.find((node) => node.id === liveNodeId) || null;
  const selectedLab = selectedNode ? catalog.find((item) => item.slug === selectedNode.data.slug) || null : null;
  const selectedIsLive = Boolean(instance && selectedNode && selectedNode.id === liveNodeId);
  const liveNodeLabel = liveNode?.data.label || instance?.name || "Practice machine";
  const liveAccessMode: LabAccessMode = instance?.metadata?.accessMode === "desktop" ? "desktop" : "terminal";
  const liveMinutesLeft = minutesUntil(instance?.expiresAt);
  const liveExpiringSoon = liveMinutesLeft !== null && liveMinutesLeft > 0 && liveMinutesLeft <= 10;
  const liveExpired = liveMinutesLeft !== null && liveMinutesLeft <= 0;
  const lifecycleBusy = busy === "start" || busy === "stop" || busy === "destroy";
  const topologyVisible = topologyOpen && !dockFocus;
  const labColumns = `${machinesOpen ? "232px" : "52px"} minmax(0,1fr) ${inspectorOpen ? "280px" : "52px"}`;

  const load = React.useCallback(async (silent = false, force = false) => {
    try {
      const result = await getLabsSnapshot({ force });
      if (!result.ok) throw new Error(result.data.error || "Could not load the Cyber Lab");
      setLoadError(null);
      const body = result.data;
      const nextCatalog = (body.catalog || []) as LearnerLabDefinition[];
      const nextInstances = (body.instances || []) as Instance[];
      setCatalog(nextCatalog);
      setCapabilities((body.capabilities || null) as LearnerLabRuntimeCapabilities | null);
      setInstances(nextInstances);
      setReconciliationWarning(body.reconciliationWarning || null);

      const current = nextInstances[0];
      if (current && typeof window !== "undefined") {
        try {
          const saved = JSON.parse(window.localStorage.getItem(RUNTIME_NODE_KEY) || "null") as { instanceId?: string; nodeId?: string } | null;
          if (saved?.instanceId === current.id && saved.nodeId) setLiveNodeId(saved.nodeId);
        } catch {
          window.localStorage.removeItem(RUNTIME_NODE_KEY);
        }
      } else if (!current) {
        setLiveNodeId(null);
        setTerminalId(null);
        setDesktopId(null);
        setDockOpen(false);
        setTerminalDiagnostics(null);
        setTerminalFailure(null);
        if (typeof window !== "undefined") window.localStorage.removeItem(RUNTIME_NODE_KEY);
      }
    } catch (error) {
      if (!silent) setLoadError(error instanceof Error ? error.message : "Could not load the Cyber Lab");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const refreshLabStatus = React.useCallback(async () => {
    setBusy("reconcile");
    await load(true, true);
    setBusy(null);
  }, [load]);

  const refreshTerminal = React.useCallback(async (id: string, silent = false) => {
    if (!silent) setBusy("diagnostics");
    try {
      const response = await fetch(`/api/labs/instances/${id}/terminal`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      setTerminalDiagnostics(body.diagnostics || null);
      if (!response.ok) {
        const failure = { error: body.error || "Could not inspect the terminal path", code: body.code, stage: body.stage };
        setTerminalFailure(failure);
        if (!silent) toast.error("Terminal is not ready. Open Diagnostics for details.");
      } else {
        setTerminalFailure(null);
      }
    } catch (error) {
      setTerminalFailure({ error: error instanceof Error ? error.message : "Could not inspect the terminal path", stage: "network" });
      if (!silent) toast.error("Terminal readiness check failed.");
    } finally {
      if (!silent) setBusy(null);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(LAYOUT_KEY) || "null") as Partial<LayoutState> | null;
      if (typeof saved?.machinesOpen === "boolean") setMachinesOpen(saved.machinesOpen);
      if (typeof saved?.inspectorOpen === "boolean") setInspectorOpen(saved.inspectorOpen);
      if (typeof saved?.topologyOpen === "boolean") setTopologyOpen(saved.topologyOpen);
      if (typeof saved?.dockCollapsed === "boolean") setDockCollapsed(saved.dockCollapsed);
    } catch {
      window.localStorage.removeItem(LAYOUT_KEY);
    }
    setLayoutReady(true);
  }, []);

  React.useEffect(() => {
    if (!layoutReady || typeof window === "undefined") return;
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify({ machinesOpen, inspectorOpen, topologyOpen, dockCollapsed } satisfies LayoutState));
  }, [dockCollapsed, inspectorOpen, layoutReady, machinesOpen, topologyOpen]);

  React.useEffect(() => {
    if (!selectedLab) {
      setSelectedAccessMode("terminal");
      return;
    }
    const modes = selectedLab.accessModes?.length ? selectedLab.accessModes : ["terminal"];
    if (!modes.includes(selectedAccessMode)) setSelectedAccessMode(selectedLab.defaultAccessMode || modes[0]);
  }, [selectedAccessMode, selectedLab]);

  React.useEffect(() => {
    if (lifecycleBusy || !instances.some((item) => TRANSITIONAL.includes(item.status))) return;
    const timer = window.setInterval(() => void load(true), 4000);
    return () => window.clearInterval(timer);
  }, [instances, lifecycleBusy, load]);

  React.useEffect(() => {
    if (!terminalId) return;
    const timer = window.setInterval(() => void refreshTerminal(terminalId, true), 8000);
    return () => window.clearInterval(timer);
  }, [terminalId, refreshTerminal]);

  React.useEffect(() => {
    if (topologyReady || catalog.length === 0) return;
    let restoredNodes: LabMachineFlowNode[] = [];
    let restoredEdges: Edge[] = [];
    const saved = initialTopology;
    topologySaveQueue.setConfirmed(saved);

    if (saved.nodes.length) {
      restoredNodes = saved.nodes.flatMap((savedNode) => {
        const lab = catalog.find((item) => item.slug === savedNode.data.slug);
        if (!lab) return [];
        return [{ id: savedNode.id, type: "machine", position: savedNode.position, data: nodeData(lab, savedNode.data.label || lab.shortName) } satisfies LabMachineFlowNode];
      });
      const ids = new Set(restoredNodes.map((node) => node.id));
      restoredEdges = saved.edges
        .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
        .map((edge) => ({ ...edge } as Edge));
    }

    if (instance && !restoredNodes.some((node) => node.data.slug === instance.slug)) {
      const lab = catalog.find((item) => item.slug === instance.slug);
      if (lab) {
        const id = uniqueNodeId();
        restoredNodes.push({ id, type: "machine", position: { x: 160, y: 120 }, data: nodeData(lab, `${lab.shortName}-01`, instance.status, true) });
        setLiveNodeId(id);
        setSelectedNodeId(id);
      }
    }

    setNodes(restoredNodes);
    setEdges(restoredEdges);
    setTopologyReady(true);
  }, [catalog, initialTopology, instance, setEdges, setNodes, topologyReady, topologySaveQueue]);

  React.useEffect(() => {
    if (!topologyReady) return;
    const payload = topologyPayload(nodes, edges);
    const timer = window.setTimeout(() => {
      void topologySaveQueue.enqueue(payload);
    }, TOPOLOGY_SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [edges, nodes, topologyReady, topologySaveQueue]);

  React.useEffect(() => {
    if (!topologyReady || catalog.length === 0) return;
    setNodes((current) => {
      let resolvedLiveNodeId = liveNodeId;
      if (instance && (!resolvedLiveNodeId || !current.some((node) => node.id === resolvedLiveNodeId && node.data.slug === instance.slug))) {
        resolvedLiveNodeId = current.find((node) => node.data.slug === instance.slug)?.id || null;
      }
      let next = current.map((node) => {
        const lab = catalog.find((item) => item.slug === node.data.slug);
        if (!lab) return node;
        const isLive = Boolean(instance && node.id === resolvedLiveNodeId && node.data.slug === instance.slug);
        return { ...node, data: nodeData(lab, node.data.label, isLive ? instance!.status : "planned", isLive) };
      });
      if (instance && !resolvedLiveNodeId) {
        const lab = catalog.find((item) => item.slug === instance.slug);
        if (lab) {
          const id = uniqueNodeId();
          next = [...next, { id, type: "machine", position: { x: 160, y: 120 }, data: nodeData(lab, `${lab.shortName}-01`, instance.status, true) }];
          resolvedLiveNodeId = id;
          setSelectedNodeId(id);
        }
      }
      if (resolvedLiveNodeId !== liveNodeId) setLiveNodeId(resolvedLiveNodeId);
      return next;
    });
  }, [catalog, instance, liveNodeId, setNodes, topologyReady]);

  const addMachine = React.useCallback((slug: string, position?: { x: number; y: number }) => {
    const lab = catalog.find((item) => item.slug === slug);
    if (!lab) return;
    const ordinal = nodes.filter((node) => node.data.slug === slug).length + 1;
    const id = uniqueNodeId();
    const fallback = { x: 100 + (nodes.length % 3) * 270, y: 90 + Math.floor(nodes.length / 3) * 190 };
    setNodes((current) => [...current, {
      id,
      type: "machine",
      position: position || fallback,
      data: nodeData(lab, `${lab.shortName}-${String(ordinal).padStart(2, "0")}`),
    }]);
    setSelectedNodeId(id);
  }, [catalog, nodes, setNodes]);

  const onConnect = React.useCallback((connection: Connection) => {
    setEdges((current) => addEdge({ ...connection, type: "smoothstep", animated: true }, current));
  }, [setEdges]);

  const createLab = async () => {
    if (!selectedLab || !selectedNode) return;
    if (instance) {
      toast.error("One running machine is allowed at a time.");
      return;
    }
    if (!selectedLab.available) {
      toast.error(selectedLab.availabilityNote || "This lab profile is not available yet.");
      return;
    }
    const accessMode = selectedLab.accessModes.includes(selectedAccessMode) ? selectedAccessMode : selectedLab.defaultAccessMode;
    setBusy("create");
    try {
      const csrf = await getCsrfToken();
      const response = await fetch("/api/labs", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ slug: selectedLab.slug, accessMode }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not start the practice lab");
      const created = body.instance as Instance | undefined;
      setLiveNodeId(selectedNode.id);
      if (created?.id && typeof window !== "undefined") {
        window.localStorage.setItem(RUNTIME_NODE_KEY, JSON.stringify({ instanceId: created.id, nodeId: selectedNode.id }));
      }
      toast.success(`${selectedLab.shortName} ${accessMode} lab requested`);
      invalidateLabsSnapshot();
      await load(true, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the practice lab");
    } finally {
      setBusy(null);
    }
  };

  const act = async (id: string, action: LabLifecycleAction) => {
    const previous = instances.find((item) => item.id === id) || null;
    if (!previous) return;
    const optimistic = applyOptimisticLabLifecycle(previous, action);
    const previousTerminalId = terminalId;
    const previousDesktopId = desktopId;
    setBusy(action);
    setInstances((current) => replaceLabInstance(current, optimistic));
    if (action === "stop" || action === "destroy") {
      setTerminalId(null);
      setDesktopId(null);
    }
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(`/api/labs/instances/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error(await responseError(response, `Could not ${action} the lab`));
      if (action === "destroy") {
        setDockOpen(false);
        setDockFocus(false);
        setTerminalDiagnostics(null);
        setTerminalFailure(null);
        if (typeof window !== "undefined") window.localStorage.removeItem(RUNTIME_NODE_KEY);
      }
      if (action === "stop") setDockTab("events");
      toast.success(action === "destroy" ? "Lab cleanup requested" : `Lab ${action} requested`);
      invalidateLabsSnapshot();
      await load(true, true);
    } catch (error) {
      setInstances((current) => replaceLabInstance(current, previous));
      if (action === "stop" || action === "destroy") {
        setTerminalId(previousTerminalId);
        setDesktopId(previousDesktopId);
      }
      toast.error(error instanceof Error ? error.message : `Could not ${action} the lab`);
    } finally {
      setBusy(null);
    }
  };

  const openTerminal = async () => {
    if (!instance || !selectedIsLive) return;
    setTerminalId(instance.id);
    setDockOpen(true);
    setDockCollapsed(false);
    setDockTab("terminal");
    setTerminalDiagnostics(null);
    setTerminalFailure(null);
    await refreshTerminal(instance.id);
  };

  const openDesktop = () => {
    if (!instance || !selectedIsLive || liveAccessMode !== "desktop") return;
    setDesktopId(instance.id);
    setDockOpen(true);
    setDockCollapsed(false);
    setDockTab("desktop");
  };

  const removeSelectedNode = () => {
    if (!selectedNode) return;
    if (selectedIsLive) {
      toast.error("Destroy the running machine before removing it.");
      return;
    }
    setNodes((current) => current.filter((node) => node.id !== selectedNode.id));
    setEdges((current) => current.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id));
    setSelectedNodeId(null);
  };

  if (loading) return <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Loading lab workspace…</div>;

  if (loadError) return (
    <div role="alert" className="rounded-xl border border-destructive/30 bg-card p-5">
      <h2 className="text-sm font-semibold">Could not load Cyber Lab</h2>
      <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
      <Button className="mt-4" variant="outline" onClick={() => { setLoading(true); void load(false, true); }}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button>
    </div>
  );

  return (
    <div className="oxsig-lab-runtime space-y-3 pb-2" data-session-open={dockOpen && !dockCollapsed} data-compact-panel={compactPanel}>
      <div className="oxsig-lab-toolbar flex flex-wrap items-center justify-end gap-2">
        {!embedded && <h1 className="mr-auto text-2xl font-bold md:text-3xl">Cyber Lab</h1>}
        <Badge variant="outline"><Network className="mr-1 h-3.5 w-3.5" />{nodes.length} nodes · {edges.length} links</Badge>
        <Badge variant={capabilities?.configured ? "default" : "outline"}><Server className="mr-1 h-3.5 w-3.5" />{capabilities?.configured ? "Ready" : "Unavailable"}</Badge>
        <Button size="sm" variant="outline" className="h-8" onClick={() => setTopologyOpen((open) => !open)} aria-expanded={topologyOpen}>
          {topologyOpen ? <ChevronUp className="mr-1.5 h-3.5 w-3.5" /> : <ChevronDown className="mr-1.5 h-3.5 w-3.5" />}
          {topologyOpen ? "Hide topology" : "Show topology"}
        </Button>
      </div>

      {capabilities && !capabilities.configured && (
        <Card className="border-amber-500/40"><CardContent className="pt-6"><p className="text-sm font-medium">Lab service unavailable</p></CardContent></Card>
      )}

      {reconciliationWarning && (
        <Card className="border-amber-500/40 bg-amber-500/5"><CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-medium">Status refresh failed</p><Button size="sm" variant="outline" onClick={() => void refreshLabStatus()} disabled={busy === "reconcile" || lifecycleBusy}><RefreshCw className={`mr-2 h-3.5 w-3.5 ${busy === "reconcile" ? "animate-spin" : ""}`} />Refresh</Button></CardContent></Card>
      )}

      {dockOpen && instance && (
        <section aria-label="Lab session" className={`oxsig-lab-session overflow-hidden rounded-xl border bg-card shadow-lg ${dockFocus ? "fixed inset-3 z-[80] overflow-y-auto shadow-2xl md:inset-5" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
            <div className="oxsig-scrollbar flex max-w-full gap-1 overflow-x-auto" role="group" aria-label="Session views">
              {([...(liveAccessMode === "desktop" ? [["desktop", "Desktop", Monitor] as const] : []), ["terminal", "Terminal", Terminal] as const, ["events", "Events", Activity] as const, ["network", "Network", Network] as const, ["diagnostics", "Diagnostics", RefreshCw] as const]).map(([tab, label, Icon]) => <Button key={tab} size="sm" variant={dockTab === tab ? "secondary" : "ghost"} className="h-10 shrink-0" aria-pressed={dockTab === tab} onClick={() => { setDockTab(tab as DockTab); setDockCollapsed(false); }}><Icon className="mr-1.5 h-3.5 w-3.5" />{label}</Button>)}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{liveNodeLabel}</span><Badge variant="outline" className="h-5 capitalize">{instance.status}</Badge><Badge variant="outline" className="h-5 capitalize">{liveAccessMode}</Badge>{instance.expiresAt && <Badge variant={liveExpired ? "destructive" : liveExpiringSoon ? "secondary" : "outline"} className="h-5">{relativeExpiry(instance.expiresAt)}</Badge>}
              {(terminalId || desktopId) && <Button size="icon" variant={dockFocus ? "secondary" : "ghost"} className="h-10 w-10" onClick={() => { setDockCollapsed(false); setDockFocus((focus) => !focus); }} aria-label={dockFocus ? "Exit focus mode" : "Focus lab session"}>{dockFocus ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Button>}
              <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => { if (dockFocus) setDockFocus(false); setDockCollapsed((value) => !value); }} aria-label={dockCollapsed ? "Expand lab dock" : "Collapse lab dock"}>{dockCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</Button>
              <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => { setTerminalId(null); setDesktopId(null); setDockOpen(false); setDockFocus(false); }} aria-label="Close lab dock"><X className="h-4 w-4" /></Button>
            </div>
          </div>

          <div hidden={dockCollapsed}>
            {dockTab === "desktop" && liveAccessMode === "desktop" && <div className="p-3">{desktopId ? <InteractiveSsmDesktop labInstanceId={desktopId} machineLabel={liveNodeLabel} focusMode={dockFocus} /> : <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border bg-muted/20 p-6 text-center"><Monitor className="h-9 w-9 text-muted-foreground/50" /><p className="mt-3 text-sm font-medium">Desktop closed</p><Button className="mt-4" size="sm" onClick={openDesktop}><Monitor className="mr-2 h-3.5 w-3.5" />Open desktop</Button></div>}</div>}

            {terminalId && terminalDiagnostics?.ready && <div className={dockTab === "terminal" ? "p-3" : "hidden"}><InteractiveSsmTerminal labInstanceId={terminalId} machineLabel={liveNodeLabel} focusMode={dockFocus} /></div>}
            {dockTab === "terminal" && (!terminalId || !terminalDiagnostics?.ready) && <div className="grid gap-3 p-3 lg:grid-cols-[1fr_260px]"><div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border bg-muted/20 p-6 text-center"><Terminal className="h-9 w-9 text-muted-foreground/50" /><p className="mt-3 text-sm font-medium">{terminalId ? `Waiting for ${liveNodeLabel}` : "Terminal closed"}</p>{instance.expiresAt && <p className={`mt-2 text-xs ${liveExpired ? "text-destructive" : liveExpiringSoon ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>{relativeExpiry(instance.expiresAt)}</p>}{terminalId && <Button className="mt-4" size="sm" variant="outline" onClick={() => void refreshTerminal(instance.id)} disabled={busy === "diagnostics"}><RefreshCw className={`mr-2 h-3.5 w-3.5 ${busy === "diagnostics" ? "animate-spin" : ""}`} />Refresh</Button>}</div><div className="space-y-2 text-xs"><p className="font-medium">Session</p><div className="space-y-1 rounded-xl border p-3 text-xs text-muted-foreground"><div>Machine <span className="float-right font-medium text-foreground">{liveNodeLabel}</span></div><div>Access <span className="float-right capitalize">{liveAccessMode}</span></div><div>Status <span className="float-right capitalize">{instance.status}</span></div><div>Terminal <span className="float-right">{terminalDiagnostics?.ready ? "ready" : "checking"}</span></div></div>{terminalFailure && <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">Open Diagnostics.</div>}</div></div>}

            {dockTab === "events" && <div className="grid gap-3 p-4 sm:grid-cols-3"><div className="rounded-xl border p-3"><p className="text-xs uppercase text-muted-foreground">Machine</p><p className="mt-1 text-sm font-medium">{liveNodeLabel}</p></div><div className="rounded-xl border p-3"><p className="text-xs uppercase text-muted-foreground">Lifecycle</p><p className="mt-1 text-sm font-medium capitalize">{instance.status}</p></div><div className="rounded-xl border p-3"><p className="text-xs uppercase text-muted-foreground">Access</p><p className="mt-1 text-sm capitalize">{liveAccessMode}</p></div><div className="rounded-xl border p-3"><p className="text-xs uppercase text-muted-foreground">Terminal</p><p className="mt-1 text-sm">Managed</p></div>{liveAccessMode === "desktop" && <div className="rounded-xl border p-3"><p className="text-xs uppercase text-muted-foreground">Desktop</p><p className="mt-1 text-sm">Browser</p></div>}<div className="rounded-xl border p-3"><p className="text-xs uppercase text-muted-foreground">Created</p><p className="mt-1 text-sm">{new Date(instance.createdAt).toLocaleString()}</p></div></div>}

            {dockTab === "network" && <div className="p-4"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border p-3"><p className="text-xs uppercase text-muted-foreground">Nodes</p><p className="mt-1 text-xl font-semibold">{nodes.length}</p></div><div className="rounded-xl border p-3"><p className="text-xs uppercase text-muted-foreground">Links</p><p className="mt-1 text-xl font-semibold">{edges.length}</p></div><div className="rounded-xl border p-3"><p className="text-xs uppercase text-muted-foreground">Running</p><p className="mt-1 text-xl font-semibold">{instance.status === "running" ? 1 : 0}</p></div></div><p className="mt-3 text-xs text-muted-foreground">Links are design-only.</p></div>}

            {dockTab === "diagnostics" && <div className="p-4 text-xs"><div className="mb-3 flex flex-wrap items-center gap-2"><span className="font-semibold">Diagnostics — {liveNodeLabel}</span><Badge variant="outline" className="text-xs capitalize">{liveAccessMode}</Badge></div><div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"><span className="rounded bg-muted px-2 py-1">OXSIG {short(instance.id)}</span><span>›</span><span className="rounded bg-muted px-2 py-1">EC2 {short(terminalDiagnostics?.instanceId, 18)}</span><span>›</span><span className="rounded bg-muted px-2 py-1">{terminalDiagnostics?.ec2State || instance.status}</span><span>›</span><span className="rounded bg-muted px-2 py-1">SSM {terminalDiagnostics?.ssmPingStatus || (terminalDiagnostics?.ssmRegistered ? "registered" : "checking")}</span><span>›</span><span className="rounded bg-muted px-2 py-1">{terminalDiagnostics?.region || "region"}</span></div>{terminalDiagnostics ? <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl border p-3"><span className="text-muted-foreground">SSM registered</span><strong className="mt-1 block">{terminalDiagnostics.ssmRegistered ? "Yes" : "No"}</strong></div><div className="rounded-xl border p-3"><span className="text-muted-foreground">Agent</span><strong className="mt-1 block">{terminalDiagnostics.ssmAgentVersion || "—"}</strong></div><div className="rounded-xl border p-3"><span className="text-muted-foreground">Platform</span><strong className="mt-1 block">{terminalDiagnostics.platformType || "—"}</strong></div><div className="rounded-xl border p-3"><span className="text-muted-foreground">OS</span><strong className="mt-1 block">{[terminalDiagnostics.platformName, terminalDiagnostics.platformVersion].filter(Boolean).join(" ") || "—"}</strong></div></div> : <p className="mt-3 text-muted-foreground">No diagnostics yet.</p>}{terminalFailure && <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-destructive"><span className="font-mono">{terminalFailure.stage || "unknown"}/{terminalFailure.code || "ERROR"}</span><p className="mt-1">{terminalFailure.error}</p></div>}<Button className="mt-3" size="sm" variant="outline" onClick={() => void refreshTerminal(instance.id)} disabled={busy === "diagnostics"}><RefreshCw className={`mr-2 h-3.5 w-3.5 ${busy === "diagnostics" ? "animate-spin" : ""}`} />Refresh</Button></div>}
          </div>
        </section>
      )}


      {topologyVisible && (
        <div className="oxsig-lab-panel-switcher" role="group" aria-label="Lab panels">
          {([['machines', 'Machines', Server], ['topology', 'Topology', Network], ['inspector', 'Inspector', Info]] as const).map(([panel, label, Icon]) => (
            <Button key={panel} size="sm" variant={compactPanel === panel ? 'secondary' : 'ghost'} aria-pressed={compactPanel === panel} className="min-h-11 flex-1" onClick={() => {
              setCompactPanel(panel);
              if (panel === 'machines') setMachinesOpen(true);
              if (panel === 'inspector') setInspectorOpen(true);
            }}><Icon className="mr-1.5 h-4 w-4" />{label}</Button>
          ))}
        </div>
      )}

      <div className={topologyVisible ? "block" : "hidden"}>
        <div className="min-h-0 overflow-hidden">
          <div className="oxsig-lab-grid" style={{ "--lab-columns": labColumns } as React.CSSProperties}>
            <aside aria-label="Machine catalog" className="oxsig-lab-machines overflow-hidden rounded-xl border bg-card">
              <div className={`flex items-center border-b ${machinesOpen ? "justify-between p-3" : "justify-center p-2"}`}>
                {machinesOpen && <p className="text-sm font-semibold">Machines</p>}
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setMachinesOpen((open) => !open)} aria-label={machinesOpen ? "Collapse machines" : "Expand machines"}>{machinesOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</Button>
              </div>
              {machinesOpen ? (
                <div className="oxsig-machine-list space-y-2 overflow-auto p-3">
                  {catalog.map((lab) => (
                    <div key={lab.slug} draggable onDragStart={(event) => { event.dataTransfer.setData("application/x-oxsig-lab", lab.slug); event.dataTransfer.effectAllowed = "move"; }} className="rounded-xl border bg-background p-3 transition hover:border-primary/40 hover:shadow-sm">
                      <div className="flex items-start gap-2.5">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted/60 ring-1 ring-border"><LabOsIcon osFamily={lab.osFamily} className="h-10 w-10" /></div>
                        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><p className="truncate text-sm font-medium">{lab.shortName}</p>{!lab.available && <Badge variant="outline" className="text-xs">Locked</Badge>}{lab.accessModes.includes("desktop") && <Badge variant="secondary" className="text-xs">Desktop</Badge>}</div><p className="mt-0.5 text-xs text-muted-foreground">{lab.category}</p><p className="mt-2 text-xs text-muted-foreground">{lab.accessModes.includes("desktop") ? "Terminal + Desktop" : lab.shell === "powershell" ? "PowerShell" : "Bash"}</p></div>
                        <GripVertical className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/60" />
                      </div>
                      <Button size="sm" variant="ghost" className="mt-2 h-8 w-full" onClick={() => { addMachine(lab.slug); setCompactPanel("topology"); }}><Plus className="mr-1.5 h-3.5 w-3.5" />Add</Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="oxsig-machine-rail flex w-full flex-col items-center gap-2 py-4">{catalog.map((lab) => <button key={lab.slug} type="button" onClick={() => { addMachine(lab.slug); setCompactPanel("topology"); }} className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background" title={`Add ${lab.shortName}`}><LabOsIcon osFamily={lab.osFamily} className="h-5 w-5" /></button>)}</div>
              )}
            </aside>

            <section aria-label="Lab topology" className="oxsig-lab-canvas relative overflow-hidden rounded-xl border bg-muted/10">
              <ReactFlow<LabMachineFlowNode, Edge>
                nodes={nodes}
                edges={edges}
                nodeTypes={NODE_TYPES}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onInit={setFlow}
                onNodeClick={(_event, node) => { setSelectedNodeId(node.id); setInspectorOpen(true); setCompactPanel("inspector"); }}
                onPaneClick={() => setSelectedNodeId(null)}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
                onDrop={(event) => { event.preventDefault(); const slug = event.dataTransfer.getData("application/x-oxsig-lab"); if (!slug) return; addMachine(slug, flow?.screenToFlowPosition({ x: event.clientX, y: event.clientY })); }}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                minZoom={0.35}
                maxZoom={1.7}
                defaultEdgeOptions={{ type: "smoothstep" }}
              >
                <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} /><Controls position="bottom-left" /><MiniMap pannable zoomable position="bottom-right" className="oxsig-lab-minimap !bg-background/90" />
                {nodes.length === 0 && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Add a machine</div>}
              </ReactFlow>
              <div className="pointer-events-none absolute bottom-14 left-3 right-3 rounded-lg border bg-background/90 px-3 py-2 text-xs text-muted-foreground shadow-sm">Design-only links · 1 running machine max</div>
              <Button size="sm" variant="secondary" className="absolute right-3 top-3 z-10 h-8 bg-background/90" onClick={() => setTopologyOpen(false)}><ChevronUp className="mr-1.5 h-3.5 w-3.5" />Collapse</Button>
            </section>

            <aside aria-label="Machine inspector" className="oxsig-lab-inspector overflow-hidden rounded-xl border bg-card">
              <div className={`flex items-center border-b ${inspectorOpen ? "justify-between p-3" : "justify-center p-2"}`}>
                {inspectorOpen && <p className="text-sm font-semibold">Inspector</p>}
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setInspectorOpen((open) => !open)} aria-label={inspectorOpen ? "Collapse inspector" : "Expand inspector"}>{inspectorOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}</Button>
              </div>
              {inspectorOpen && (!selectedNode || !selectedLab ? (
                <div className="flex min-h-[220px] items-center justify-center p-6 text-sm text-muted-foreground"><Info className="mr-2 h-4 w-4 opacity-50" />Select a machine</div>
              ) : (
                <div className="oxsig-inspector-content space-y-4 p-4">
                  <div><div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{selectedNode.data.label}</p><p className="text-xs text-muted-foreground">{selectedLab.name}</p><div className="mt-2 flex flex-wrap gap-1.5"><Badge variant="secondary" className="text-xs uppercase">Selected</Badge>{selectedIsLive && <Badge className="text-xs"><Server className="mr-1 h-3 w-3" />Live machine</Badge>}{selectedIsLive && <Badge variant="outline" className="text-xs capitalize">{liveAccessMode}</Badge>}</div></div><Badge variant="outline" className="capitalize">{selectedIsLive ? instance?.status : "planned"}</Badge></div></div>
                  <div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-muted/60 p-2"><span className="block text-xs text-muted-foreground">Platform</span>{selectedLab.platform}</div><div className="rounded-lg bg-muted/60 p-2"><span className="block text-xs text-muted-foreground">Shell</span>{selectedLab.shell}</div><div className="rounded-lg bg-muted/60 p-2"><span className="block text-xs text-muted-foreground">Access</span><span className="capitalize">{selectedIsLive ? liveAccessMode : selectedAccessMode}</span></div><div className="rounded-lg bg-muted/60 p-2"><span className="block text-xs text-muted-foreground">Availability</span>{selectedLab.available ? "Ready" : "Unavailable"}</div></div>
                  {!instance && selectedLab.accessModes.length > 1 && <div className="space-y-2 rounded-xl border p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Access</p><div className="grid grid-cols-2 gap-2"><Button type="button" size="sm" variant={selectedAccessMode === "terminal" ? "default" : "outline"} onClick={() => setSelectedAccessMode("terminal")}><Terminal className="mr-1.5 h-3.5 w-3.5" />Terminal</Button><Button type="button" size="sm" variant={selectedAccessMode === "desktop" ? "default" : "outline"} onClick={() => setSelectedAccessMode("desktop")}><Monitor className="mr-1.5 h-3.5 w-3.5" />Desktop</Button></div></div>}
                  {!selectedLab.available && selectedLab.availabilityNote && <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">{selectedLab.availabilityNote}</div>}
                  {selectedIsLive && instance?.expiresAt && <p className={`text-xs ${liveExpired ? "text-destructive" : liveExpiringSoon ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>Expires {new Date(instance.expiresAt).toLocaleString()} ({relativeExpiry(instance.expiresAt)})</p>}

                  <div className="space-y-2 rounded-xl border p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</p>
                    {!instance && <Button className={ACTION_BUTTON} onClick={() => void createLab()} disabled={!capabilities?.configured || !selectedLab.available || busy === "create"}>{busy === "create" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : selectedAccessMode === "desktop" ? <Monitor className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}{selectedLab.available ? `Start ${selectedAccessMode} lab` : "Activation required"}</Button>}
                    {instance && !selectedIsLive && <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">{liveNodeLabel} is running.</div>}
                    {selectedIsLive && instance?.status === "stopped" && <Button className={ACTION_BUTTON} onClick={() => void act(instance.id, "start")} disabled={Boolean(busy)}>{busy === "start" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}Start {selectedNode.data.label}</Button>}
                    {selectedIsLive && instance?.status === "running" && <>{liveAccessMode === "desktop" && <Button className={ACTION_BUTTON} onClick={openDesktop}><Monitor className="mr-2 h-4 w-4" />Open desktop</Button>}{capabilities?.supportsTerminal && <Button className={ACTION_BUTTON} variant={liveAccessMode === "desktop" ? "outline" : "default"} onClick={() => void openTerminal()}><Terminal className="mr-2 h-4 w-4" />Open terminal</Button>}<Button className={ACTION_BUTTON} variant="outline" onClick={() => void act(instance.id, "stop")} disabled={Boolean(busy)}><CircleStop className="mr-2 h-4 w-4" />Stop {selectedNode.data.label}</Button></>}
                    {selectedIsLive && instance && !["destroying", "destroyed"].includes(instance.status) && <Button className={ACTION_BUTTON} variant="destructive" onClick={() => void act(instance.id, "destroy")} disabled={Boolean(busy)}><Trash2 className="mr-2 h-4 w-4" />Destroy {selectedNode.data.label}</Button>}
                    {selectedIsLive && instance && TRANSITIONAL.includes(instance.status) && <Button className={ACTION_BUTTON} variant="outline" onClick={() => void refreshLabStatus()} disabled={busy === "reconcile" || lifecycleBusy}><RefreshCw className={`mr-2 h-4 w-4 ${busy === "reconcile" ? "animate-spin" : ""}`} />Refresh status</Button>}
                    <Button className={ACTION_BUTTON} variant="ghost" onClick={removeSelectedNode} disabled={selectedIsLive}><X className="mr-2 h-4 w-4" />Remove</Button>
                  </div>
                  {selectedIsLive && instance && TRANSITIONAL.includes(instance.status) && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Updating…</div>}
                </div>
              ))}
            </aside>
          </div>
        </div>
      </div>

      {!topologyVisible && !dockFocus && <button type="button" onClick={() => setTopologyOpen(true)} className="flex w-full items-center justify-between rounded-xl border bg-card px-4 py-3 text-left shadow-sm"><p className="text-sm font-semibold">Lab topology</p><ChevronDown className="h-4 w-4 text-muted-foreground" /></button>}


      {!dockOpen && instance && <Button variant="outline" className="w-full sm:w-auto" onClick={() => { setDockOpen(true); setDockCollapsed(false); setDockTab(liveAccessMode === "desktop" && desktopId ? "desktop" : "terminal"); if (!terminalId) void refreshTerminal(instance.id); }}><PanelBottom className="mr-2 h-4 w-4" />Open lab dock</Button>}
    </div>
  );
}
