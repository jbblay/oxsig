"use client";

import * as React from "react";
import {
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleStop,
  Cloud,
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
  Sparkles,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { LabAccessMode, LabDefinition, LabInstanceStatus, LabRuntimeCapabilities } from "@/lib/labs/types";
import { getCsrfToken } from "@/lib/security/csrf-client";

type Capabilities = LabRuntimeCapabilities & { reason?: string; region?: string };
type Instance = {
  id: string;
  slug: string;
  name: string;
  status: LabInstanceStatus;
  lastError?: string;
  createdAt: string;
  expiresAt: string;
  metadata?: Record<string, unknown>;
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
type LabLayoutState = {
  machinesOpen: boolean;
  inspectorOpen: boolean;
  workspaceOpen: boolean;
  dockCollapsed: boolean;
};

type PersistedTopology = {
  nodes: Array<Pick<LabMachineFlowNode, "id" | "position" | "type"> & { data: Pick<LabMachineNodeData, "slug" | "label"> }>;
  edges: Edge[];
};

const TRANSITIONAL: LabInstanceStatus[] = ["created", "provisioning", "stopping", "destroying"];
const NODE_TYPES = { machine: LabMachineNode };
const TOPOLOGY_KEY = "oxsig:cyber-lab-topology:v1";
const RUNTIME_NODE_KEY = "oxsig:cyber-lab-runtime-node:v1";
const LAYOUT_KEY = "oxsig:cyber-lab-layout:v1";
const LAYOUT_HINT_KEY = "oxsig:cyber-lab-layout-hint:v1";
const ACTION_BUTTON = "h-10 w-full justify-start";

async function errorMessage(response: Response, fallback: string) {
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
  if (!Number.isFinite(ms)) return null;
  return Math.round(ms / 60_000);
}

function relativeExpiry(value?: string | null) {
  const mins = minutesUntil(value);
  if (mins === null) return "—";
  if (mins <= 0) return "Expired";
  if (mins < 60) return `${mins}m left`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hours}h left` : `${hours}h ${rem}m left`;
}

function nodeData(lab: LabDefinition, label: string, status: LabMachineNodeData["status"] = "planned", live = false): LabMachineNodeData {
  return {
    slug: lab.slug,
    label,
    shortName: lab.shortName,
    category: lab.category,
    osFamily: lab.osFamily,
    platform: lab.platform,
    instanceType: lab.recommendedInstanceType,
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

export default function LabRuntimePanel({ embedded = false }: { embedded?: boolean }) {
  const [catalog, setCatalog] = React.useState<LabDefinition[]>([]);
  const [capabilities, setCapabilities] = React.useState<Capabilities | null>(null);
  const [instances, setInstances] = React.useState<Instance[]>([]);
  const [reconciliationWarning, setReconciliationWarning] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<LabMachineFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [flow, setFlow] = React.useState<ReactFlowInstance<LabMachineFlowNode, Edge> | null>(null);
  const [topologyReady, setTopologyReady] = React.useState(false);
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
  const [workspaceOpen, setWorkspaceOpen] = React.useState(true);
  const [layoutReady, setLayoutReady] = React.useState(false);
  const [showLayoutHint, setShowLayoutHint] = React.useState(false);

  const instance = instances[0];
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;
  const liveNode = nodes.find((node) => node.id === liveNodeId) || null;
  const selectedLab = selectedNode ? catalog.find((item) => item.slug === selectedNode.data.slug) || null : null;
  const selectedIsLive = Boolean(instance && selectedNode && selectedNode.id === liveNodeId);
  const liveNodeLabel = liveNode?.data.label || instance?.name || "Live machine";
  const liveMinutesLeft = minutesUntil(instance?.expiresAt);
  const liveExpiringSoon = liveMinutesLeft !== null && liveMinutesLeft > 0 && liveMinutesLeft <= 10;
  const liveExpired = liveMinutesLeft !== null && liveMinutesLeft <= 0;
  const liveAccessMode: LabAccessMode = instance?.metadata?.accessMode === "desktop" ? "desktop" : "terminal";
  const workspaceVisible = workspaceOpen && !dockFocus;
  const labColumns = `${machinesOpen ? "260px" : "52px"} minmax(0,1fr) ${inspectorOpen ? "300px" : "52px"}`;

  const load = React.useCallback(async (silent = false) => {
    try {
      const response = await fetch("/api/labs", { cache: "no-store" });
      if (!response.ok) throw new Error(await errorMessage(response, "Could not load the Cyber Lab"));
      const body = await response.json();
      const nextCatalog = (body.catalog || []) as LabDefinition[];
      const nextInstances = (body.instances || []) as Instance[];
      setCatalog(nextCatalog);
      setCapabilities(body.capabilities || null);
      setInstances(nextInstances);
      setReconciliationWarning(body.reconciliationWarning || null);

      const current = nextInstances[0];
      if (current && typeof window !== "undefined") {
        try {
          const saved = JSON.parse(window.localStorage.getItem(RUNTIME_NODE_KEY) || "null") as { instanceId?: string; nodeId?: string } | null;
          if (saved?.instanceId === current.id && saved.nodeId) setLiveNodeId(saved.nodeId);
        } catch {
          // Ignore stale local UI metadata.
        }
      } else if (!current) {
        setLiveNodeId(null);
        setTerminalId(null);
        setDesktopId(null);
        setDockOpen(false);
        setDockCollapsed(false);
        setDockFocus(false);
        setTerminalDiagnostics(null);
        setTerminalFailure(null);
        if (typeof window !== "undefined") window.localStorage.removeItem(RUNTIME_NODE_KEY);
      }
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Could not load the Cyber Lab");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const refreshCloudState = React.useCallback(async () => {
    setBusy("reconcile");
    await load(true);
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
        if (!silent) toast.error(failure.error);
      } else {
        setTerminalFailure(null);
      }
    } catch (error) {
      const failure = { error: error instanceof Error ? error.message : "Could not inspect the terminal path", stage: "network" };
      setTerminalFailure(failure);
      if (!silent) toast.error(failure.error);
    } finally {
      if (!silent) setBusy(null);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(LAYOUT_KEY) || "null") as Partial<LabLayoutState> | null;
      if (typeof saved?.machinesOpen === "boolean") setMachinesOpen(saved.machinesOpen);
      if (typeof saved?.inspectorOpen === "boolean") setInspectorOpen(saved.inspectorOpen);
      if (typeof saved?.workspaceOpen === "boolean") setWorkspaceOpen(saved.workspaceOpen);
      if (typeof saved?.dockCollapsed === "boolean") setDockCollapsed(saved.dockCollapsed);
    } catch {
      window.localStorage.removeItem(LAYOUT_KEY);
    }
    setShowLayoutHint(!window.localStorage.getItem(LAYOUT_HINT_KEY));
    setLayoutReady(true);
  }, []);

  React.useEffect(() => {
    if (!layoutReady || typeof window === "undefined") return;
    const layout: LabLayoutState = { machinesOpen, inspectorOpen, workspaceOpen, dockCollapsed };
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  }, [dockCollapsed, inspectorOpen, layoutReady, machinesOpen, workspaceOpen]);

  React.useEffect(() => {
    if (!selectedLab) {
      setSelectedAccessMode("terminal");
      return;
    }
    const modes = selectedLab.accessModes?.length ? selectedLab.accessModes : ["terminal"];
    if (!modes.includes(selectedAccessMode)) setSelectedAccessMode(selectedLab.defaultAccessMode || modes[0]);
  }, [selectedAccessMode, selectedLab]);

  React.useEffect(() => {
    if (!instances.some((item) => TRANSITIONAL.includes(item.status))) return;
    const timer = window.setInterval(() => void load(true), 4000);
    return () => window.clearInterval(timer);
  }, [instances, load]);

  React.useEffect(() => {
    if (!terminalId) return;
    const timer = window.setInterval(() => void refreshTerminal(terminalId, true), 8000);
    return () => window.clearInterval(timer);
  }, [terminalId, refreshTerminal]);

  React.useEffect(() => {
    if (topologyReady || catalog.length === 0 || typeof window === "undefined") return;

    let restoredNodes: LabMachineFlowNode[] = [];
    let restoredEdges: Edge[] = [];
    try {
      const saved = JSON.parse(window.localStorage.getItem(TOPOLOGY_KEY) || "null") as PersistedTopology | null;
      if (saved?.nodes?.length) {
        restoredNodes = saved.nodes.flatMap((savedNode) => {
          const lab = catalog.find((item) => item.slug === savedNode.data.slug);
          if (!lab) return [];
          return [{ id: savedNode.id, type: "machine", position: savedNode.position, data: nodeData(lab, savedNode.data.label || lab.shortName) } satisfies LabMachineFlowNode];
        });
        const nodeIds = new Set(restoredNodes.map((node) => node.id));
        restoredEdges = (saved.edges || []).filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
      }
    } catch {
      window.localStorage.removeItem(TOPOLOGY_KEY);
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
  }, [catalog, instance, setEdges, setNodes, topologyReady]);

  React.useEffect(() => {
    if (!topologyReady || typeof window === "undefined") return;
    const payload: PersistedTopology = {
      nodes: nodes.map((node) => ({ id: node.id, type: "machine", position: node.position, data: { slug: node.data.slug, label: node.data.label } })),
      edges,
    };
    window.localStorage.setItem(TOPOLOGY_KEY, JSON.stringify(payload));
  }, [edges, nodes, topologyReady]);

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
    const fallbackPosition = { x: 100 + (nodes.length % 3) * 270, y: 90 + Math.floor(nodes.length / 3) * 190 };
    const node: LabMachineFlowNode = { id, type: "machine", position: position || fallbackPosition, data: nodeData(lab, `${lab.shortName}-${String(ordinal).padStart(2, "0")}`) };
    setNodes((current) => [...current, node]);
    setSelectedNodeId(id);
  }, [catalog, nodes, setNodes]);

  const onConnect = React.useCallback((connection: Connection) => {
    setEdges((current) => addEdge({ ...connection, type: "smoothstep", animated: true }, current));
  }, [setEdges]);

  const createLab = async () => {
    if (!selectedLab || !selectedNode) return;
    if (instance) {
      toast.error("One live AWS machine is allowed per account at a time. You can still design the rest of the topology.");
      return;
    }
    if (!selectedLab.available) {
      toast.error(selectedLab.availabilityNote || "This VM is not available yet.");
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
      if (!response.ok) throw new Error(body.error || "Could not start the cloud lab");
      const created = body.instance as Instance | undefined;
      setLiveNodeId(selectedNode.id);
      if (created?.id && typeof window !== "undefined") window.localStorage.setItem(RUNTIME_NODE_KEY, JSON.stringify({ instanceId: created.id, nodeId: selectedNode.id }));
      toast.success(`${selectedLab.shortName} ${accessMode} VM requested`);
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the cloud lab");
    } finally {
      setBusy(null);
    }
  };

  const act = async (id: string, action: "start" | "stop" | "destroy") => {
    setBusy(action);
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
      if (!response.ok) throw new Error(await errorMessage(response, `Could not ${action} the lab`));
      if (action === "destroy") {
        setDockOpen(false);
        setDockCollapsed(false);
        setDockFocus(false);
        setTerminalDiagnostics(null);
        setTerminalFailure(null);
        if (typeof window !== "undefined") window.localStorage.removeItem(RUNTIME_NODE_KEY);
      }
      if (action === "stop") setDockTab("diagnostics");
      toast.success(action === "destroy" ? "VM termination requested" : `VM ${action} requested`);
      await load(true);
    } catch (error) {
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

  const dismissLayoutHint = () => {
    setShowLayoutHint(false);
    if (typeof window !== "undefined") window.localStorage.setItem(LAYOUT_HINT_KEY, "seen");
  };

  const removeSelectedNode = () => {
    if (!selectedNode) return;
    if (selectedIsLive) {
      toast.error("Destroy the live AWS machine before removing its topology node.");
      return;
    }
    setNodes((current) => current.filter((node) => node.id !== selectedNode.id));
    setEdges((current) => current.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id));
    setSelectedNodeId(null);
  };

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className={embedded ? "text-xl font-semibold" : "text-2xl font-bold md:text-3xl"}>{embedded ? "Lab" : "Cyber Lab"}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Design the topology visually, then provision the selected machine into a real temporary AWS lab.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline"><Network className="mr-1 h-3.5 w-3.5" />{nodes.length} nodes · {edges.length} links</Badge>
          <Badge variant={capabilities?.configured ? "default" : "outline"}><Cloud className="mr-1 h-3.5 w-3.5" />{capabilities?.configured ? `AWS ${capabilities.region || "connected"}` : "AWS setup needed"}</Badge>
          <Button size="sm" variant="outline" className="h-8" onClick={() => setWorkspaceOpen((open) => !open)} aria-expanded={workspaceOpen}>
            {workspaceOpen ? <ChevronUp className="mr-1.5 h-3.5 w-3.5" /> : <ChevronDown className="mr-1.5 h-3.5 w-3.5" />}
            {workspaceOpen ? "Collapse lab" : "Expand lab"}
          </Button>
        </div>
      </div>

      {capabilities && !capabilities.configured && <Card className="border-amber-500/40"><CardContent className="pt-6"><p className="font-medium">Cloud runtime is not ready on this deployment</p><p className="mt-1 text-sm text-muted-foreground">{capabilities.reason}</p></CardContent></Card>}

      {reconciliationWarning && (
        <Card className="border-amber-500/40 bg-amber-500/5"><CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">AWS state needs another check</p><p className="mt-1 text-xs text-muted-foreground">{reconciliationWarning}</p></div><Button size="sm" variant="outline" onClick={() => void refreshCloudState()} disabled={busy === "reconcile"}><RefreshCw className={`mr-2 h-3.5 w-3.5 ${busy === "reconcile" ? "animate-spin" : ""}`} />Refresh AWS state</Button></CardContent></Card>
      )}

      {showLayoutHint && (
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-blue-500/5 via-background to-purple-500/5 p-3 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3"><div className="mt-0.5 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 p-2 text-white shadow-sm"><Sparkles className="h-4 w-4" /></div><div><p className="text-sm font-semibold">Shape the lab around your task</p><p className="mt-0.5 max-w-3xl text-xs leading-5 text-muted-foreground">Machines and Inspector start open, but each can collapse. Collapse the whole topology when you want terminal or desktop space, or use Focus in the lab dock.</p></div></div>
            <Button size="sm" variant="ghost" className="shrink-0" onClick={dismissLayoutHint}>Got it</Button>
          </div>
        </div>
      )}

      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${workspaceVisible ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="grid min-h-[650px] gap-3 transition-[grid-template-columns] duration-300 ease-in-out xl:grid-cols-[var(--lab-columns)]" style={{ "--lab-columns": labColumns } as React.CSSProperties}>
            <aside className="overflow-hidden rounded-2xl border bg-card transition-shadow duration-300">
              <div className={`flex items-center border-b ${machinesOpen ? "justify-between p-4" : "justify-center p-2"}`}>
                {machinesOpen && <div className="min-w-0"><p className="font-semibold">Machines</p><p className="mt-1 text-xs text-muted-foreground">Drag to the canvas, or tap Add on mobile.</p></div>}
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setMachinesOpen((open) => !open)} aria-label={machinesOpen ? "Collapse machines" : "Expand machines"} title={machinesOpen ? "Collapse machines" : "Expand machines"}>{machinesOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</Button>
              </div>
              <div className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out ${machinesOpen ? "max-h-[620px] opacity-100" : "pointer-events-none max-h-0 opacity-0"}`}>
                <div className="max-h-[590px] space-y-2 overflow-auto p-3">
                  {catalog.map((lab) => (
                    <div key={lab.slug} draggable onDragStart={(event) => { event.dataTransfer.setData("application/x-oxsig-lab", lab.slug); event.dataTransfer.effectAllowed = "move"; }} className="rounded-xl border bg-background p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm">
                      <div className="flex items-start gap-2.5">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted/60 ring-1 ring-border"><LabOsIcon osFamily={lab.osFamily} className="h-7 w-7" /></div>
                        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><p className="truncate text-sm font-medium">{lab.shortName}</p>{!lab.available && <Badge variant="outline" className="text-[9px]">Locked</Badge>}{lab.accessModes.includes("desktop") && <Badge variant="secondary" className="text-[9px]">Desktop</Badge>}</div><p className="mt-0.5 text-[11px] text-muted-foreground">{lab.category}</p><div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground"><span>{lab.accessModes.includes("desktop") ? "Terminal + Desktop" : lab.shell === "powershell" ? "PowerShell" : "Bash"}</span><span className="font-mono">{lab.recommendedInstanceType}</span></div></div>
                        <GripVertical className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/60" />
                      </div>
                      <Button size="sm" variant="ghost" className="mt-2 h-8 w-full" onClick={() => addMachine(lab.slug)}><Plus className="mr-1.5 h-3.5 w-3.5" />Add to topology</Button>
                    </div>
                  ))}
                </div>
              </div>
              {!machinesOpen && <div className="flex h-[590px] w-full flex-col items-center gap-2 py-4">{catalog.map((lab) => <button key={lab.slug} type="button" draggable onDragStart={(event) => { event.dataTransfer.setData("application/x-oxsig-lab", lab.slug); event.dataTransfer.effectAllowed = "move"; }} onClick={() => addMachine(lab.slug)} className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background transition-all hover:border-primary/40 hover:bg-muted" title={`Add ${lab.shortName}`} aria-label={`Add ${lab.shortName} to topology`}><LabOsIcon osFamily={lab.osFamily} className="h-5 w-5" /></button>)}<button type="button" onClick={() => setMachinesOpen(true)} className="mt-auto flex flex-col items-center gap-2 text-muted-foreground transition-colors hover:text-foreground" title="Expand machines"><Server className="h-4 w-4" /><span className="rotate-180 text-[10px] font-semibold uppercase tracking-[0.2em] [writing-mode:vertical-rl]">Machines</span></button></div>}
            </aside>

            <section className="relative min-h-[650px] overflow-hidden rounded-2xl border bg-muted/10 transition-shadow duration-300">
              <ReactFlow<LabMachineFlowNode, Edge> nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onInit={setFlow} onNodeClick={(_event, node) => setSelectedNodeId(node.id)} onPaneClick={() => setSelectedNodeId(null)} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { event.preventDefault(); const slug = event.dataTransfer.getData("application/x-oxsig-lab"); if (!slug) return; const position = flow?.screenToFlowPosition({ x: event.clientX, y: event.clientY }); addMachine(slug, position); }} fitView fitViewOptions={{ padding: 0.2 }} minZoom={0.35} maxZoom={1.7} defaultEdgeOptions={{ type: "smoothstep" }}>
                <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} /><Controls position="bottom-left" /><MiniMap pannable zoomable position="bottom-right" className="!bg-background/90" />
                {nodes.length === 0 && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="max-w-sm rounded-2xl border border-dashed bg-background/90 p-8 text-center shadow-sm backdrop-blur"><Server className="mx-auto h-10 w-10 text-muted-foreground/50" /><p className="mt-3 font-medium">Build your lab topology</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Drag machines here, move them freely, connect their handles, and select a node to provision or inspect it.</p></div></div>}
              </ReactFlow>
              <div className="pointer-events-none absolute left-3 top-3 rounded-lg border bg-background/90 px-3 py-2 text-[10px] text-muted-foreground shadow-sm backdrop-blur">Topology links are design-only in this release · one live EC2 VM per user</div>
              <Button size="sm" variant="secondary" className="absolute right-3 top-3 z-10 h-8 bg-background/90 shadow-sm backdrop-blur" onClick={() => setWorkspaceOpen(false)} title="Collapse the lab topology"><ChevronUp className="mr-1.5 h-3.5 w-3.5" />Collapse lab</Button>
            </section>

            <aside className="overflow-hidden rounded-2xl border bg-card transition-shadow duration-300">
              <div className={`flex items-center border-b ${inspectorOpen ? "justify-between p-4" : "justify-center p-2"}`}>
                {inspectorOpen && <div className="min-w-0"><p className="font-semibold">Inspector</p><p className="mt-1 text-xs text-muted-foreground">Select a topology node to manage it.</p></div>}
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setInspectorOpen((open) => !open)} aria-label={inspectorOpen ? "Collapse inspector" : "Expand inspector"} title={inspectorOpen ? "Collapse inspector" : "Expand inspector"}>{inspectorOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}</Button>
              </div>
              <div className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out ${inspectorOpen ? "max-h-[1500px] opacity-100" : "pointer-events-none max-h-0 opacity-0"}`}>
                {!selectedNode || !selectedLab ? <div className="flex min-h-[300px] flex-col items-center justify-center p-6 text-center text-muted-foreground"><Info className="h-8 w-8 opacity-40" /><p className="mt-3 text-sm font-medium">Nothing selected</p><p className="mt-1 text-xs">Choose a node on the canvas.</p></div> : (
                  <div className="space-y-4 p-4">
                    <div><div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{selectedNode.data.label}</p><p className="text-xs text-muted-foreground">{selectedLab.name}</p><div className="mt-2 flex flex-wrap gap-1.5"><Badge variant="secondary" className="text-[9px] uppercase tracking-wide">Selected</Badge>{selectedIsLive && <Badge className="text-[9px]"><Cloud className="mr-1 h-3 w-3" />Live in AWS</Badge>}{selectedIsLive && <Badge variant="outline" className="text-[9px] capitalize">{liveAccessMode}</Badge>}</div></div><Badge variant="outline" className="capitalize">{selectedIsLive ? instance?.status : "planned"}</Badge></div><p className="mt-3 text-xs leading-5 text-muted-foreground">{selectedLab.description}</p></div>
                    <div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-muted/60 p-2"><span className="block text-[10px] text-muted-foreground">Platform</span>{selectedLab.platform}</div><div className="rounded-lg bg-muted/60 p-2"><span className="block text-[10px] text-muted-foreground">Shell</span>{selectedLab.shell}</div><div className="rounded-lg bg-muted/60 p-2"><span className="block text-[10px] text-muted-foreground">Instance</span><span className="font-mono">{!instance && selectedAccessMode === "desktop" && selectedLab.desktopInstanceType ? selectedLab.desktopInstanceType : selectedLab.recommendedInstanceType}</span></div><div className="rounded-lg bg-muted/60 p-2"><span className="block text-[10px] text-muted-foreground">Access</span><span className="capitalize">{selectedIsLive ? liveAccessMode : selectedAccessMode}</span></div></div>
                    {!instance && selectedLab.accessModes.length > 1 && <div className="space-y-2 rounded-xl border p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Access mode</p><div className="grid grid-cols-2 gap-2"><Button type="button" size="sm" variant={selectedAccessMode === "terminal" ? "default" : "outline"} onClick={() => setSelectedAccessMode("terminal")}><Terminal className="mr-1.5 h-3.5 w-3.5" />Terminal</Button><Button type="button" size="sm" variant={selectedAccessMode === "desktop" ? "default" : "outline"} onClick={() => setSelectedAccessMode("desktop")}><Monitor className="mr-1.5 h-3.5 w-3.5" />Desktop</Button></div><p className="text-[10px] leading-4 text-muted-foreground">{selectedAccessMode === "desktop" ? "Desktop provisions a GUI-sized VM and private browser display through SSM; terminal access remains available too." : "Terminal uses the lighter persistent SSM shell profile."}</p></div>}
                    {!selectedLab.available && selectedLab.availabilityNote && <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] leading-5 text-amber-700 dark:text-amber-300">{selectedLab.availabilityNote}</div>}
                    {selectedIsLive && instance?.expiresAt && <p className={`text-[11px] ${liveExpired ? "text-destructive" : liveExpiringSoon ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>Expires {new Date(instance.expiresAt).toLocaleString()} ({relativeExpiry(instance.expiresAt)})</p>}
                    {selectedIsLive && instance?.lastError && <div className="rounded-lg bg-destructive/10 p-3 text-[11px] text-destructive">The last cloud operation failed. Refresh AWS state or open Diagnostics for the exact AWS/SSM state.</div>}

                    <div className="space-y-2 rounded-xl border p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Actions for {selectedNode.data.label}</p>
                      {!instance && <Button className={ACTION_BUTTON} onClick={() => void createLab()} disabled={!capabilities?.configured || !selectedLab.available || busy === "create"}>{busy === "create" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : selectedAccessMode === "desktop" ? <Monitor className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}{selectedLab.available ? `Provision ${selectedAccessMode} in AWS` : "Activation required"}</Button>}
                      {instance && !selectedIsLive && <div className="rounded-lg border bg-muted/30 p-3 text-[11px] text-muted-foreground">{liveNodeLabel} is currently the live AWS machine. This selected node remains design-only until that runtime is destroyed.</div>}
                      {selectedIsLive && instance?.status === "stopped" && <Button className={ACTION_BUTTON} onClick={() => void act(instance.id, "start")} disabled={Boolean(busy)}>{busy === "start" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}Start {selectedNode.data.label}</Button>}
                      {selectedIsLive && instance?.status === "running" && <>{liveAccessMode === "desktop" && <Button className={ACTION_BUTTON} onClick={openDesktop}><Monitor className="mr-2 h-4 w-4" />Open browser desktop — {selectedNode.data.label}</Button>}{capabilities?.supportsTerminal && <Button className={ACTION_BUTTON} variant={liveAccessMode === "desktop" ? "outline" : "default"} onClick={() => void openTerminal()}><Terminal className="mr-2 h-4 w-4" />Open interactive terminal — {selectedNode.data.label}</Button>}<Button className={ACTION_BUTTON} variant="outline" onClick={() => void act(instance.id, "stop")} disabled={Boolean(busy)}>{busy === "stop" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CircleStop className="mr-2 h-4 w-4" />}Stop {selectedNode.data.label}</Button></>}
                      {selectedIsLive && instance && !["destroying", "destroyed"].includes(instance.status) && <Button className={ACTION_BUTTON} variant="destructive" onClick={() => void act(instance.id, "destroy")} disabled={Boolean(busy)}>{busy === "destroy" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}Destroy {selectedNode.data.label}</Button>}
                      {selectedIsLive && instance && TRANSITIONAL.includes(instance.status) && <Button className={ACTION_BUTTON} variant="outline" onClick={() => void refreshCloudState()} disabled={busy === "reconcile"}><RefreshCw className={`mr-2 h-4 w-4 ${busy === "reconcile" ? "animate-spin" : ""}`} />Refresh AWS state</Button>}
                      <Button className={ACTION_BUTTON} variant="ghost" onClick={removeSelectedNode} disabled={selectedIsLive}><X className="mr-2 h-4 w-4" />Remove {selectedNode.data.label} from canvas</Button>
                      {selectedIsLive && <p className="text-[10px] leading-4 text-muted-foreground">A live AWS node stays on the canvas until AWS reconciliation confirms that its runtime is gone.</p>}
                    </div>
                    {selectedIsLive && instance && TRANSITIONAL.includes(instance.status) && <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />AWS is updating {selectedNode.data.label}. Use Refresh AWS state if this does not clear.</div>}
                  </div>
                )}
              </div>
              {!inspectorOpen && <button type="button" onClick={() => setInspectorOpen(true)} className="flex h-[590px] w-full flex-col items-center gap-3 pt-5 text-muted-foreground transition-colors hover:text-foreground" title="Expand inspector"><Info className="h-4 w-4" /><span className="text-[10px] font-semibold uppercase tracking-[0.2em] [writing-mode:vertical-rl]">Inspector</span></button>}
            </aside>
          </div>
        </div>
      </div>

      {!workspaceVisible && !dockFocus && <button type="button" onClick={() => setWorkspaceOpen(true)} className="flex w-full items-center justify-between rounded-2xl border bg-card px-4 py-3 text-left shadow-sm transition-all duration-200 hover:border-primary/30 hover:shadow"><div><p className="text-sm font-semibold">Lab topology collapsed</p><p className="mt-0.5 text-xs text-muted-foreground">Expand when you need Machines, connections, or Inspector.</p></div><ChevronDown className="h-4 w-4 text-muted-foreground" /></button>}

      {dockOpen && instance && (
        <section className={`overflow-hidden rounded-2xl border bg-card shadow-lg transition-all duration-300 ease-in-out ${dockFocus ? "fixed inset-3 z-[80] overflow-y-auto shadow-2xl md:inset-5" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
            <div className="flex flex-wrap gap-1">
              {([...(liveAccessMode === "desktop" ? [["desktop", "Desktop", Monitor] as const] : []), ["terminal", "Terminal", Terminal] as const, ["events", "Events", Activity] as const, ["network", "Network", Network] as const, ["diagnostics", "Diagnostics", RefreshCw] as const]).map(([tab, label, Icon]) => <Button key={tab} size="sm" variant={dockTab === tab ? "secondary" : "ghost"} className="h-8" onClick={() => { setDockTab(tab as DockTab); setDockCollapsed(false); }}><Icon className="mr-1.5 h-3.5 w-3.5" />{label}</Button>)}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="font-medium text-foreground">Lab dock — {liveNodeLabel}</span><Badge variant="outline" className="h-5 capitalize">{instance.status}</Badge><Badge variant="outline" className="h-5 capitalize">{liveAccessMode}</Badge>{instance.expiresAt && <Badge variant={liveExpired ? "destructive" : liveExpiringSoon ? "secondary" : "outline"} className="h-5">{relativeExpiry(instance.expiresAt)}</Badge>}
              {(terminalId || desktopId) && <Button size="icon" variant={dockFocus ? "secondary" : "ghost"} className="h-7 w-7" onClick={() => { setDockCollapsed(false); setDockFocus((focus) => !focus); }} aria-label={dockFocus ? "Exit lab focus mode" : "Focus lab session"} title={dockFocus ? "Exit lab focus mode" : "Focus lab session"}>{dockFocus ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Button>}
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { if (dockFocus) setDockFocus(false); setDockCollapsed((collapsed) => !collapsed); }} aria-label={dockCollapsed ? "Expand lab dock" : "Collapse lab dock"} title={dockCollapsed ? "Expand lab dock" : "Collapse lab dock"}>{dockCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setTerminalId(null); setDesktopId(null); setDockOpen(false); setDockCollapsed(false); setDockFocus(false); }} aria-label="Close lab dock"><X className="h-4 w-4" /></Button>
            </div>
          </div>

          <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${dockCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}>
            <div className="min-h-0 overflow-hidden">
              {dockTab === "desktop" && liveAccessMode === "desktop" && <div className="p-3">{desktopId ? <InteractiveSsmDesktop labInstanceId={desktopId} machineLabel={liveNodeLabel} focusMode={dockFocus} /> : <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border bg-muted/20 p-6 text-center"><Monitor className="h-9 w-9 text-muted-foreground/50" /><p className="mt-3 text-sm font-medium">Browser desktop is not open</p><p className="mt-1 max-w-md text-xs text-muted-foreground">Select {liveNodeLabel} and use Open browser desktop to start the private SSM desktop tunnel.</p><Button className="mt-4" size="sm" onClick={openDesktop}><Monitor className="mr-2 h-3.5 w-3.5" />Open browser desktop</Button></div>}</div>}

              {terminalId && terminalDiagnostics?.ready && <div className={dockTab === "terminal" ? "p-3" : "hidden"}><InteractiveSsmTerminal labInstanceId={terminalId} machineLabel={liveNodeLabel} focusMode={dockFocus} /></div>}
              {dockTab === "terminal" && (!terminalId || !terminalDiagnostics?.ready) && <div className="grid gap-3 p-3 lg:grid-cols-[1fr_260px]"><div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border bg-muted/20 p-6 text-center"><Terminal className="h-9 w-9 text-muted-foreground/50" /><p className="mt-3 text-sm font-medium">{terminalId ? `Waiting for ${liveNodeLabel} terminal readiness` : "Interactive terminal is not open"}</p><p className="mt-1 max-w-md text-xs text-muted-foreground">{terminalId ? "EC2 must be running and Systems Manager must report Online before the persistent shell can start." : `Select ${liveNodeLabel} and use Open interactive terminal to create a persistent Session Manager shell.`}</p>{instance.expiresAt && <p className={`mt-2 text-[11px] ${liveExpired ? "text-destructive" : liveExpiringSoon ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>Lab lease: {relativeExpiry(instance.expiresAt)}</p>}{terminalId && <Button className="mt-4" size="sm" variant="outline" onClick={() => void refreshTerminal(instance.id)} disabled={busy === "diagnostics"}><RefreshCw className={`mr-2 h-3.5 w-3.5 ${busy === "diagnostics" ? "animate-spin" : ""}`} />Refresh terminal readiness</Button>}</div><div className="space-y-2 text-xs"><p className="font-medium">Live path</p><div className="space-y-1 rounded-xl border p-3 text-[11px] text-muted-foreground"><div>Machine <span className="float-right font-medium text-foreground">{liveNodeLabel}</span></div><div>Access <span className="float-right capitalize">{liveAccessMode}</span></div><div>Oxsig <span className="float-right font-mono">{short(instance.id)}</span></div><div>EC2 <span className="float-right font-mono">{short(terminalDiagnostics?.instanceId, 18)}</span></div><div>State <span className="float-right">{terminalDiagnostics?.ec2State || instance.status}</span></div><div>SSM <span className="float-right">{terminalDiagnostics?.ssmPingStatus || "checking"}</span></div><div>Region <span className="float-right">{terminalDiagnostics?.region || capabilities?.region || "—"}</span></div></div>{terminalFailure && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-[11px] text-destructive"><div className="font-mono">{terminalFailure.stage || "unknown"}/{terminalFailure.code || "ERROR"}</div><div className="mt-1">{terminalFailure.error}</div></div>}</div></div>}

              {dockTab === "events" && <div className="grid gap-3 p-4 sm:grid-cols-3"><div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">Machine</p><p className="mt-1 text-sm font-medium">{liveNodeLabel}</p></div><div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">Current lifecycle</p><p className="mt-1 text-sm font-medium capitalize">{instance.status}</p></div><div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">Access mode</p><p className="mt-1 text-sm capitalize">{liveAccessMode}</p></div><div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">Terminal</p><p className="mt-1 text-sm">Persistent SSM shell</p></div>{liveAccessMode === "desktop" && <div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">Desktop</p><p className="mt-1 text-sm">SSM port tunnel + RFB</p></div>}<div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">Created</p><p className="mt-1 text-sm">{new Date(instance.createdAt).toLocaleString()}</p></div></div>}

              {dockTab === "network" && <div className="p-4"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">Designed nodes</p><p className="mt-1 text-xl font-semibold">{nodes.length}</p></div><div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">Designed links</p><p className="mt-1 text-xl font-semibold">{edges.length}</p></div><div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">Live AWS nodes</p><p className="mt-1 text-xl font-semibold">{instance ? 1 : 0}</p></div></div><p className="mt-3 text-xs text-muted-foreground">Canvas links are topology-design edges only. They do not create VPC routes, security-group rules, ENIs, or private subnets.</p></div>}

              {dockTab === "diagnostics" && <div className="p-4 text-xs"><div className="mb-3 flex flex-wrap items-center gap-2"><span className="font-semibold">Diagnostics — {liveNodeLabel}</span><Badge className="text-[9px]"><Cloud className="mr-1 h-3 w-3" />Live in AWS</Badge><Badge variant="outline" className="text-[9px] capitalize">{liveAccessMode}</Badge></div><div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground"><span className="rounded bg-muted px-2 py-1">Oxsig {short(instance.id)}</span><span>›</span><span className="rounded bg-muted px-2 py-1">EC2 {short(terminalDiagnostics?.instanceId, 18)}</span><span>›</span><span className="rounded bg-muted px-2 py-1">{terminalDiagnostics?.ec2State || instance.status}</span><span>›</span><span className="rounded bg-muted px-2 py-1">SSM {terminalDiagnostics?.ssmPingStatus || (terminalDiagnostics?.ssmRegistered ? "registered" : "checking")}</span><span>›</span><span className="rounded bg-muted px-2 py-1">{terminalDiagnostics?.region || capabilities?.region || "region"}</span></div>{terminalDiagnostics ? <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl border p-3"><span className="text-muted-foreground">SSM registered</span><strong className="mt-1 block">{terminalDiagnostics.ssmRegistered ? "Yes" : "No"}</strong></div><div className="rounded-xl border p-3"><span className="text-muted-foreground">Agent</span><strong className="mt-1 block">{terminalDiagnostics.ssmAgentVersion || "—"}</strong></div><div className="rounded-xl border p-3"><span className="text-muted-foreground">Platform</span><strong className="mt-1 block">{terminalDiagnostics.platformType || "—"}</strong></div><div className="rounded-xl border p-3"><span className="text-muted-foreground">OS</span><strong className="mt-1 block">{[terminalDiagnostics.platformName, terminalDiagnostics.platformVersion].filter(Boolean).join(" ") || "—"}</strong></div></div> : <p className="mt-3 text-muted-foreground">Open a session or refresh the path to collect EC2/SSM diagnostics.</p>}{terminalFailure && <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-destructive"><span className="font-mono">{terminalFailure.stage || "unknown"}/{terminalFailure.code || "ERROR"}</span><p className="mt-1">{terminalFailure.error}</p></div>}<Button className="mt-3" size="sm" variant="outline" onClick={() => void refreshTerminal(instance.id)} disabled={busy === "diagnostics"}><RefreshCw className={`mr-2 h-3.5 w-3.5 ${busy === "diagnostics" ? "animate-spin" : ""}`} />Refresh diagnostics</Button></div>}
            </div>
          </div>
        </section>
      )}

      {!dockOpen && instance && <Button variant="outline" className="w-full sm:w-auto" onClick={() => { setDockOpen(true); setDockCollapsed(false); setDockTab(desktopId ? "desktop" : terminalId ? "terminal" : "diagnostics"); if (!terminalId) void refreshTerminal(instance.id); }}><PanelBottom className="mr-2 h-4 w-4" />Open {liveNodeLabel} lab dock</Button>}
    </div>
  );
}
