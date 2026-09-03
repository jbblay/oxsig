"use client";

import * as React from "react";
import {
  Activity,
  CircleStop,
  Cloud,
  GripVertical,
  Info,
  Loader2,
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
import LabMachineNode, { type LabMachineFlowNode, type LabMachineNodeData } from "@/components/labs/LabMachineNode";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { LabDefinition, LabInstanceStatus, LabRuntimeCapabilities } from "@/lib/labs/types";

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
type TerminalEntry = {
  id: string;
  command: string;
  status: "running" | "success" | "error";
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  commandId?: string;
  durationMs?: number;
  ssmStatus?: string;
  error?: string;
  code?: string;
  stage?: string;
};

type DockTab = "terminal" | "events" | "network" | "diagnostics";

type PersistedTopology = {
  nodes: Array<Pick<LabMachineFlowNode, "id" | "position" | "type"> & { data: Pick<LabMachineNodeData, "slug" | "label"> }>;
  edges: Edge[];
};

const TRANSITIONAL: LabInstanceStatus[] = ["created", "provisioning", "stopping", "destroying"];
const NODE_TYPES = { machine: LabMachineNode };
const TOPOLOGY_KEY = "oxsig:cyber-lab-topology:v1";
const RUNTIME_NODE_KEY = "oxsig:cyber-lab-runtime-node:v1";

async function csrfToken() {
  const response = await fetch("/api/csrf-token", { cache: "no-store" });
  if (!response.ok) throw new Error("Secure request setup failed");
  return (await response.json()).token as string;
}

async function errorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return body?.error || fallback;
}

function short(value?: string | null, size = 12) {
  if (!value) return "—";
  return value.length <= size ? value : `${value.slice(0, size)}…`;
}

function terminalPrompt(lab?: LabDefinition | null) {
  if (lab?.shell === "powershell") return "PS C:\\>";
  if (lab?.osFamily === "kali") return "kali@oxsig:~$";
  if (lab?.osFamily === "rocky") return "rocky@oxsig:~$";
  if (lab?.osFamily === "amazon-linux") return "ec2-user@oxsig:~$";
  return "ubuntu@oxsig:~$";
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
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<LabMachineFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [flow, setFlow] = React.useState<ReactFlowInstance<LabMachineFlowNode, Edge> | null>(null);
  const [topologyReady, setTopologyReady] = React.useState(false);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [liveNodeId, setLiveNodeId] = React.useState<string | null>(null);

  const [dockOpen, setDockOpen] = React.useState(false);
  const [dockTab, setDockTab] = React.useState<DockTab>("terminal");
  const [terminalId, setTerminalId] = React.useState<string | null>(null);
  const [command, setCommand] = React.useState("");
  const [terminalDiagnostics, setTerminalDiagnostics] = React.useState<TerminalDiagnostics | null>(null);
  const [terminalFailure, setTerminalFailure] = React.useState<TerminalFailure | null>(null);
  const [history, setHistory] = React.useState<TerminalEntry[]>([]);

  const instance = instances[0];
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;
  const selectedLab = selectedNode ? catalog.find((item) => item.slug === selectedNode.data.slug) || null : null;
  const activeLab = instance ? catalog.find((item) => item.slug === instance.slug) || null : null;
  const selectedIsLive = Boolean(instance && selectedNode && selectedNode.id === liveNodeId);

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

      const current = nextInstances[0];
      if (current && typeof window !== "undefined") {
        try {
          const saved = JSON.parse(window.localStorage.getItem(RUNTIME_NODE_KEY) || "null") as { instanceId?: string; nodeId?: string } | null;
          if (saved?.instanceId === current.id && saved.nodeId) setLiveNodeId(saved.nodeId);
        } catch {
          // Ignore stale local UI metadata.
        }
      }
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Could not load the Cyber Lab");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

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
          return [{
            id: savedNode.id,
            type: "machine",
            position: savedNode.position,
            data: nodeData(lab, savedNode.data.label || lab.shortName),
          } satisfies LabMachineFlowNode];
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
        return {
          ...node,
          data: nodeData(lab, node.data.label, isLive ? instance!.status : "planned", isLive),
        };
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
    const node: LabMachineFlowNode = {
      id,
      type: "machine",
      position: position || fallbackPosition,
      data: nodeData(lab, `${lab.shortName}-${String(ordinal).padStart(2, "0")}`),
    };
    setNodes((current) => [...current, node]);
    setSelectedNodeId(id);
  }, [catalog, nodes, setNodes]);

  const onConnect = React.useCallback((connection: Connection) => {
    setEdges((current) => addEdge({ ...connection, type: "smoothstep", animated: true }, current));
  }, [setEdges]);

  const createLab = async () => {
    if (!selectedLab || !selectedNode) return;
    if (instance) {
      toast.error("The MVP currently allows one live AWS machine. You can still design the rest of the topology.");
      return;
    }
    if (!selectedLab.available) {
      toast.error(selectedLab.availabilityNote || "This VM is not available yet.");
      return;
    }

    setBusy("create");
    try {
      const csrf = await csrfToken();
      const response = await fetch("/api/labs", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ slug: selectedLab.slug }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not start the cloud lab");
      const created = body.instance as Instance | undefined;
      setLiveNodeId(selectedNode.id);
      if (created?.id && typeof window !== "undefined") {
        window.localStorage.setItem(RUNTIME_NODE_KEY, JSON.stringify({ instanceId: created.id, nodeId: selectedNode.id }));
      }
      toast.success(`${selectedLab.shortName} VM requested`);
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the cloud lab");
    } finally {
      setBusy(null);
    }
  };

  const act = async (id: string, action: "start" | "stop" | "destroy") => {
    setBusy(action);
    try {
      const csrf = await csrfToken();
      const response = await fetch(`/api/labs/instances/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error(await errorMessage(response, `Could not ${action} the lab`));
      if (action === "destroy") {
        setTerminalId(null);
        setDockOpen(false);
        setTerminalDiagnostics(null);
        setTerminalFailure(null);
        setHistory([]);
        setLiveNodeId(null);
        if (typeof window !== "undefined") window.localStorage.removeItem(RUNTIME_NODE_KEY);
      }
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
    setDockTab("terminal");
    setTerminalDiagnostics(null);
    setTerminalFailure(null);
    if (!command.trim() && activeLab) setCommand(activeLab.defaultCommand);
    await refreshTerminal(instance.id);
  };

  const runCommand = async () => {
    if (!terminalId || !command.trim()) return;
    const submitted = command.trim();
    const entryId = `${Date.now()}-${Math.random()}`;
    setHistory((current) => [...current, { id: entryId, command: submitted, status: "running" }]);
    setBusy("command");

    try {
      const csrf = await csrfToken();
      const response = await fetch(`/api/labs/instances/${terminalId}/terminal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ command: submitted }),
      });
      const body = await response.json().catch(() => ({}));
      if (body.diagnostics) setTerminalDiagnostics(body.diagnostics);

      if (!response.ok) {
        const failure = { error: body.error || "Command failed", code: body.code, stage: body.stage };
        setTerminalFailure(failure);
        setHistory((current) => current.map((entry) => entry.id === entryId ? { ...entry, status: "error", error: failure.error, code: failure.code, stage: failure.stage } : entry));
        return;
      }

      setTerminalFailure(null);
      setHistory((current) => current.map((entry) => entry.id === entryId ? {
        ...entry,
        status: "success",
        stdout: body.stdout || "",
        stderr: body.stderr || "",
        exitCode: body.exitCode,
        commandId: body.commandId,
        durationMs: body.durationMs,
        ssmStatus: body.status,
      } : entry));
      setCommand("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Command failed";
      setTerminalFailure({ error: message, stage: "network" });
      setHistory((current) => current.map((entry) => entry.id === entryId ? { ...entry, status: "error", error: message, stage: "network" } : entry));
    } finally {
      setBusy(null);
    }
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

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className={embedded ? "text-xl font-semibold" : "text-2xl font-bold md:text-3xl"}>{embedded ? "Lab" : "Cyber Lab"}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Design the topology visually, then provision the selected machine into a real temporary AWS lab.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline"><Network className="mr-1 h-3.5 w-3.5" />{nodes.length} nodes · {edges.length} links</Badge>
          <Badge variant={capabilities?.configured ? "default" : "outline"}><Cloud className="mr-1 h-3.5 w-3.5" />{capabilities?.configured ? `AWS ${capabilities.region || "connected"}` : "AWS setup needed"}</Badge>
        </div>
      </div>

      {!capabilities?.configured && (
        <Card className="border-amber-500/40"><CardContent className="pt-6"><p className="font-medium">Cloud runtime is not ready on this deployment</p><p className="mt-1 text-sm text-muted-foreground">{capabilities?.reason}</p></CardContent></Card>
      )}

      <div className="grid min-h-[650px] gap-3 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
        <aside className="rounded-2xl border bg-card">
          <div className="border-b p-4">
            <p className="font-semibold">Machines</p>
            <p className="mt-1 text-xs text-muted-foreground">Drag to the canvas, or tap Add on mobile.</p>
          </div>
          <div className="max-h-[590px] space-y-2 overflow-auto p-3">
            {catalog.map((lab) => (
              <div
                key={lab.slug}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/x-oxsig-lab", lab.slug);
                  event.dataTransfer.effectAllowed = "move";
                }}
                className="rounded-xl border bg-background p-3 transition hover:border-primary/40 hover:shadow-sm"
              >
                <div className="flex items-start gap-2.5">
                  <GripVertical className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-medium">{lab.shortName}</p>
                      {!lab.available && <Badge variant="outline" className="text-[9px]">Locked</Badge>}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{lab.category}</p>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{lab.shell === "powershell" ? "PowerShell" : "Bash"}</span>
                      <span className="font-mono">{lab.recommendedInstanceType}</span>
                    </div>
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="mt-2 h-8 w-full" onClick={() => addMachine(lab.slug)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />Add to topology
                </Button>
              </div>
            ))}
          </div>
        </aside>

        <section className="relative min-h-[650px] overflow-hidden rounded-2xl border bg-muted/10">
          <ReactFlow<LabMachineFlowNode, Edge>
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setFlow}
            onNodeClick={(_event, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              const slug = event.dataTransfer.getData("application/x-oxsig-lab");
              if (!slug) return;
              const position = flow?.screenToFlowPosition({ x: event.clientX, y: event.clientY });
              addMachine(slug, position);
            }}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.35}
            maxZoom={1.7}
            defaultEdgeOptions={{ type: "smoothstep" }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} />
            <Controls position="bottom-left" />
            <MiniMap pannable zoomable position="bottom-right" className="!bg-background/90" />
            {nodes.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="max-w-sm rounded-2xl border border-dashed bg-background/90 p-8 text-center shadow-sm backdrop-blur">
                  <Server className="mx-auto h-10 w-10 text-muted-foreground/50" />
                  <p className="mt-3 font-medium">Build your lab topology</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Drag machines here, move them freely, connect their handles, and select a node to provision or inspect it.</p>
                </div>
              </div>
            )}
          </ReactFlow>
          <div className="pointer-events-none absolute left-3 top-3 rounded-lg border bg-background/90 px-3 py-2 text-[10px] text-muted-foreground shadow-sm backdrop-blur">
            Topology links are design-only in this release · one live EC2 VM per user
          </div>
        </section>

        <aside className="rounded-2xl border bg-card">
          <div className="border-b p-4">
            <p className="font-semibold">Inspector</p>
            <p className="mt-1 text-xs text-muted-foreground">Select a topology node to manage it.</p>
          </div>
          {!selectedNode || !selectedLab ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center p-6 text-center text-muted-foreground">
              <Info className="h-8 w-8 opacity-40" />
              <p className="mt-3 text-sm font-medium">Nothing selected</p>
              <p className="mt-1 text-xs">Choose a node on the canvas.</p>
            </div>
          ) : (
            <div className="space-y-4 p-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-semibold">{selectedNode.data.label}</p><p className="text-xs text-muted-foreground">{selectedLab.name}</p></div>
                  <Badge variant="outline" className="capitalize">{selectedIsLive ? instance?.status : "planned"}</Badge>
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">{selectedLab.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-muted/60 p-2"><span className="block text-[10px] text-muted-foreground">Platform</span>{selectedLab.platform}</div>
                <div className="rounded-lg bg-muted/60 p-2"><span className="block text-[10px] text-muted-foreground">Shell</span>{selectedLab.shell}</div>
                <div className="rounded-lg bg-muted/60 p-2"><span className="block text-[10px] text-muted-foreground">Instance</span><span className="font-mono">{selectedLab.recommendedInstanceType}</span></div>
                <div className="rounded-lg bg-muted/60 p-2"><span className="block text-[10px] text-muted-foreground">Runtime</span>{selectedIsLive ? "AWS EC2" : "Design"}</div>
              </div>

              {!selectedLab.available && selectedLab.availabilityNote && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] leading-5 text-amber-700 dark:text-amber-300">{selectedLab.availabilityNote}</div>
              )}

              {selectedIsLive && instance?.expiresAt && <p className="text-[11px] text-muted-foreground">Expires {new Date(instance.expiresAt).toLocaleString()}</p>}
              {selectedIsLive && instance?.lastError && <div className="rounded-lg bg-destructive/10 p-3 text-[11px] text-destructive">The last cloud operation failed. Open Diagnostics for the exact AWS/SSM state.</div>}

              <div className="space-y-2">
                {!instance && (
                  <Button className="w-full" onClick={() => void createLab()} disabled={!capabilities?.configured || !selectedLab.available || busy === "create"}>
                    {busy === "create" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                    {selectedLab.available ? "Provision in AWS" : "Activation required"}
                  </Button>
                )}
                {instance && !selectedIsLive && <div className="rounded-lg border bg-muted/30 p-3 text-[11px] text-muted-foreground">Another node is currently live. You can continue designing this node, but provisioning remains limited to one EC2 machine for now.</div>}
                {selectedIsLive && instance?.status === "stopped" && <Button className="w-full" onClick={() => void act(instance.id, "start")} disabled={Boolean(busy)}><Play className="mr-2 h-4 w-4" />Start VM</Button>}
                {selectedIsLive && instance?.status === "running" && (
                  <>
                    {capabilities?.supportsTerminal && <Button className="w-full" variant="outline" onClick={() => void openTerminal()}><Terminal className="mr-2 h-4 w-4" />Open terminal</Button>}
                    <Button className="w-full" variant="outline" onClick={() => void act(instance.id, "stop")} disabled={Boolean(busy)}><CircleStop className="mr-2 h-4 w-4" />Stop VM</Button>
                  </>
                )}
                {selectedIsLive && instance && !["destroying", "destroyed"].includes(instance.status) && <Button className="w-full" variant="destructive" onClick={() => void act(instance.id, "destroy")} disabled={Boolean(busy)}><Trash2 className="mr-2 h-4 w-4" />Destroy VM</Button>}
                <Button className="w-full" variant="ghost" onClick={removeSelectedNode} disabled={selectedIsLive}><X className="mr-2 h-4 w-4" />Remove from canvas</Button>
              </div>

              {selectedIsLive && instance && TRANSITIONAL.includes(instance.status) && <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />AWS is updating this machine.</div>}
            </div>
          )}
        </aside>
      </div>

      {dockOpen && instance && (
        <section className="overflow-hidden rounded-2xl border bg-card shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
            <div className="flex flex-wrap gap-1">
              {([
                ["terminal", "Terminal", Terminal],
                ["events", "Events", Activity],
                ["network", "Network", Network],
                ["diagnostics", "Diagnostics", RefreshCw],
              ] as const).map(([tab, label, Icon]) => (
                <Button key={tab} size="sm" variant={dockTab === tab ? "secondary" : "ghost"} className="h-8" onClick={() => setDockTab(tab)}>
                  <Icon className="mr-1.5 h-3.5 w-3.5" />{label}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>{activeLab?.shortName || instance.name}</span>
              <span>·</span><span className="capitalize">{instance.status}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDockOpen(false)}><X className="h-4 w-4" /></Button>
            </div>
          </div>

          {dockTab === "terminal" && (
            <div className="grid gap-3 p-3 lg:grid-cols-[1fr_260px]">
              <div>
                <div className="min-h-60 max-h-[440px] overflow-auto rounded-xl bg-black p-4 font-mono text-xs text-emerald-400">
                  {history.length === 0 ? <div className="text-emerald-300/70">{terminalDiagnostics?.ready ? "Terminal path ready. Run a command." : "Waiting for EC2 and SSM terminal readiness…"}</div> : history.map((entry) => (
                    <div key={entry.id} className="mb-5 last:mb-0">
                      <div><span className="text-cyan-300">{terminalPrompt(activeLab)}</span> {entry.command}</div>
                      {entry.status === "running" && <div className="mt-1 text-yellow-300">executing through AWS Systems Manager…</div>}
                      {entry.stdout && <pre className="mt-1 whitespace-pre-wrap text-emerald-300">{entry.stdout}</pre>}
                      {entry.stderr && <pre className="mt-1 whitespace-pre-wrap text-red-300">{entry.stderr}</pre>}
                      {entry.status === "error" && <div className="mt-1 text-red-300">[{entry.stage || "unknown"}/{entry.code || "ERROR"}] {entry.error}</div>}
                      {entry.status === "success" && <div className="mt-1 text-emerald-300/60">[exit {entry.exitCode ?? "?"} · {entry.ssmStatus || "done"} · {entry.durationMs ?? "?"}ms · command {short(entry.commandId, 18)}]</div>}
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <Input value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void runCommand(); }} placeholder={activeLab?.defaultCommand || "Enter a command"} aria-label="Lab command" className="font-mono" />
                  <Button onClick={() => void runCommand()} disabled={busy === "command" || !command.trim() || terminalDiagnostics?.ready !== true}>{busy === "command" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Run</Button>
                </div>
              </div>
              <div className="space-y-2 text-xs">
                <p className="font-medium">Live path</p>
                <div className="space-y-1 rounded-xl border p-3 text-[11px] text-muted-foreground">
                  <div>Oxsig <span className="float-right font-mono">{short(instance.id)}</span></div>
                  <div>EC2 <span className="float-right font-mono">{short(terminalDiagnostics?.instanceId, 18)}</span></div>
                  <div>State <span className="float-right">{terminalDiagnostics?.ec2State || instance.status}</span></div>
                  <div>SSM <span className="float-right">{terminalDiagnostics?.ssmPingStatus || "checking"}</span></div>
                  <div>Region <span className="float-right">{terminalDiagnostics?.region || capabilities?.region || "—"}</span></div>
                </div>
                {terminalFailure && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-[11px] text-destructive"><div className="font-mono">{terminalFailure.stage || "unknown"}/{terminalFailure.code || "ERROR"}</div><div className="mt-1">{terminalFailure.error}</div></div>}
                <Button size="sm" variant="outline" className="w-full" onClick={() => void refreshTerminal(instance.id)} disabled={busy === "diagnostics"}><RefreshCw className={`mr-2 h-3.5 w-3.5 ${busy === "diagnostics" ? "animate-spin" : ""}`} />Refresh path</Button>
              </div>
            </div>
          )}

          {dockTab === "events" && (
            <div className="grid gap-3 p-4 sm:grid-cols-3">
              <div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">Current lifecycle</p><p className="mt-1 text-sm font-medium capitalize">{instance.status}</p></div>
              <div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">Created</p><p className="mt-1 text-sm">{new Date(instance.createdAt).toLocaleString()}</p></div>
              <div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">Commands this session</p><p className="mt-1 text-sm">{history.length}</p></div>
              <p className="sm:col-span-3 text-xs text-muted-foreground">A full server-side lab event stream is a later step. This panel intentionally shows only state the current UI can verify.</p>
            </div>
          )}

          {dockTab === "network" && (
            <div className="p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">Designed nodes</p><p className="mt-1 text-xl font-semibold">{nodes.length}</p></div>
                <div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">Designed links</p><p className="mt-1 text-xl font-semibold">{edges.length}</p></div>
                <div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">Live AWS nodes</p><p className="mt-1 text-xl font-semibold">{instance ? 1 : 0}</p></div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Canvas links are topology-design edges only. They do not create VPC routes, security-group rules, ENIs, or private subnets yet.</p>
            </div>
          )}

          {dockTab === "diagnostics" && (
            <div className="p-4 text-xs">
              <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                <span className="rounded bg-muted px-2 py-1">Oxsig {short(instance.id)}</span><span>›</span>
                <span className="rounded bg-muted px-2 py-1">EC2 {short(terminalDiagnostics?.instanceId, 18)}</span><span>›</span>
                <span className="rounded bg-muted px-2 py-1">{terminalDiagnostics?.ec2State || instance.status}</span><span>›</span>
                <span className="rounded bg-muted px-2 py-1">SSM {terminalDiagnostics?.ssmPingStatus || (terminalDiagnostics?.ssmRegistered ? "registered" : "checking")}</span><span>›</span>
                <span className="rounded bg-muted px-2 py-1">{terminalDiagnostics?.region || capabilities?.region || "region"}</span>
              </div>
              {terminalDiagnostics ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border p-3"><span className="text-muted-foreground">SSM registered</span><strong className="mt-1 block">{terminalDiagnostics.ssmRegistered ? "Yes" : "No"}</strong></div>
                  <div className="rounded-xl border p-3"><span className="text-muted-foreground">Agent</span><strong className="mt-1 block">{terminalDiagnostics.ssmAgentVersion || "—"}</strong></div>
                  <div className="rounded-xl border p-3"><span className="text-muted-foreground">Platform</span><strong className="mt-1 block">{terminalDiagnostics.platformType || "—"}</strong></div>
                  <div className="rounded-xl border p-3"><span className="text-muted-foreground">OS</span><strong className="mt-1 block">{[terminalDiagnostics.platformName, terminalDiagnostics.platformVersion].filter(Boolean).join(" ") || "—"}</strong></div>
                </div>
              ) : <p className="mt-3 text-muted-foreground">Open Terminal or refresh the path to collect EC2/SSM diagnostics.</p>}
              {terminalFailure && <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-destructive"><span className="font-mono">{terminalFailure.stage || "unknown"}/{terminalFailure.code || "ERROR"}</span><p className="mt-1">{terminalFailure.error}</p></div>}
              <Button className="mt-3" size="sm" variant="outline" onClick={() => void refreshTerminal(instance.id)} disabled={busy === "diagnostics"}><RefreshCw className={`mr-2 h-3.5 w-3.5 ${busy === "diagnostics" ? "animate-spin" : ""}`} />Refresh diagnostics</Button>
            </div>
          )}
        </section>
      )}

      {!dockOpen && instance && (
        <Button variant="outline" className="w-full sm:w-auto" onClick={() => { setDockOpen(true); setDockTab(terminalId ? "terminal" : "diagnostics"); if (!terminalId) void refreshTerminal(instance.id); }}>
          <PanelBottom className="mr-2 h-4 w-4" />Open lab dock
        </Button>
      )}
    </div>
  );
}
