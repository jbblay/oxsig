"use client";

import * as React from "react";
import {
  CircleStop,
  Cloud,
  GripVertical,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Server,
  Terminal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

const TRANSITIONAL: LabInstanceStatus[] = ["created", "provisioning", "stopping", "destroying"];

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

function terminalPrompt(lab?: LabDefinition) {
  if (lab?.shell === "powershell") return "PS C:\\>";
  if (lab?.osFamily === "kali") return "kali@oxsig:~$";
  if (lab?.osFamily === "rocky") return "rocky@oxsig:~$";
  if (lab?.osFamily === "amazon-linux") return "ec2-user@oxsig:~$";
  return "ubuntu@oxsig:~$";
}

export default function LabRuntimePanel({ embedded = false }: { embedded?: boolean }) {
  const [catalog, setCatalog] = React.useState<LabDefinition[]>([]);
  const [capabilities, setCapabilities] = React.useState<Capabilities | null>(null);
  const [instances, setInstances] = React.useState<Instance[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = React.useState<string | null>(null);
  const [placed, setPlaced] = React.useState(false);
  const [terminalId, setTerminalId] = React.useState<string | null>(null);
  const [command, setCommand] = React.useState("");
  const [terminalDiagnostics, setTerminalDiagnostics] = React.useState<TerminalDiagnostics | null>(null);
  const [terminalFailure, setTerminalFailure] = React.useState<TerminalFailure | null>(null);
  const [history, setHistory] = React.useState<TerminalEntry[]>([]);

  const instance = instances[0];
  const selectedLab = catalog.find((item) => item.slug === selectedSlug) || catalog[0];
  const activeLab = instance ? catalog.find((item) => item.slug === instance.slug) || selectedLab : selectedLab;

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

      if (nextInstances[0]) {
        setPlaced(true);
        setSelectedSlug(nextInstances[0].slug);
      } else if (!selectedSlug && nextCatalog[0]) {
        const firstAvailable = nextCatalog.find((item) => item.available) || nextCatalog[0];
        setSelectedSlug(firstAvailable.slug);
      }
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Could not load the Cyber Lab");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedSlug]);

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

  const addToCanvas = (slug: string) => {
    if (instance) {
      toast.error("Destroy the current lab before selecting another machine.");
      return;
    }
    const profile = catalog.find((item) => item.slug === slug);
    if (!profile) return;
    setSelectedSlug(slug);
    setPlaced(true);
    setCommand(profile.defaultCommand);
    setHistory([]);
    setTerminalFailure(null);
    setTerminalDiagnostics(null);
  };

  const createLab = async () => {
    if (!selectedLab) return;
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
      if (!response.ok) throw new Error(await errorMessage(response, "Could not start the cloud lab"));
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
        setTerminalDiagnostics(null);
        setTerminalFailure(null);
        setHistory([]);
      }
      toast.success(action === "destroy" ? "VM termination requested" : `VM ${action} requested`);
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not ${action} the lab`);
    } finally {
      setBusy(null);
    }
  };

  const toggleTerminal = async (id: string) => {
    if (terminalId === id) {
      setTerminalId(null);
      return;
    }
    setTerminalId(id);
    setTerminalDiagnostics(null);
    setTerminalFailure(null);
    setHistory([]);
    if (!command.trim() && activeLab) setCommand(activeLab.defaultCommand);
    await refreshTerminal(id);
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
        setHistory((current) => current.map((entry) => entry.id === entryId ? {
          ...entry,
          status: "error",
          error: failure.error,
          code: failure.code,
          stage: failure.stage,
        } : entry));
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
      setHistory((current) => current.map((entry) => entry.id === entryId ? {
        ...entry,
        status: "error",
        error: message,
        stage: "network",
      } : entry));
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className={embedded ? "text-xl font-semibold" : "text-2xl font-bold md:text-3xl"}>{embedded ? "Lab" : "Cyber Lab"}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Choose an operating system, start a real temporary AWS VM, inspect its live state, and destroy it when the exercise is finished.
          </p>
        </div>
        <Badge variant={capabilities?.configured ? "default" : "outline"}>
          <Cloud className="mr-1 h-3.5 w-3.5" />
          {capabilities?.configured ? `AWS ${capabilities.region || "connected"}` : "AWS setup needed"}
        </Badge>
      </div>

      {!capabilities?.configured && (
        <Card className="border-amber-500/40"><CardContent className="pt-6"><p className="font-medium">Cloud runtime is not ready on this deployment</p><p className="mt-1 text-sm text-muted-foreground">{capabilities?.reason}</p></CardContent></Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">Machines</CardTitle><CardDescription>Select a VM, then add it to the one-machine MVP canvas.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {catalog.map((lab) => (
              <div
                key={lab.slug}
                draggable={!instance}
                onDragStart={(event) => event.dataTransfer.setData("application/x-oxsig-lab", lab.slug)}
                className={`rounded-xl border p-3 ${selectedSlug === lab.slug ? "border-primary bg-primary/5" : "bg-background"}`}
              >
                <div className="flex items-start gap-3">
                  <GripVertical className="mt-1 h-4 w-4 text-muted-foreground" />
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted"><Server className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{lab.shortName}</p>{!lab.available && <Badge variant="outline">Activation required</Badge>}</div>
                    <p className="text-xs text-muted-foreground">{lab.category} · {lab.recommendedInstanceType}</p>
                    {!lab.available && lab.availabilityNote && <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">{lab.availabilityNote}</p>}
                  </div>
                </div>
                <Button className="mt-3 w-full" size="sm" variant="outline" disabled={Boolean(instance)} onClick={() => addToCanvas(lab.slug)}>
                  <Plus className="mr-2 h-4 w-4" />Select VM
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Lab canvas</CardTitle><CardDescription>One active VM per user for the MVP. The selected operating system controls the real EC2 image.</CardDescription></CardHeader>
          <CardContent>
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const slug = event.dataTransfer.getData("application/x-oxsig-lab");
                if (slug) addToCanvas(slug);
              }}
              className="flex min-h-[360px] items-center justify-center rounded-xl border border-dashed bg-muted/20 p-5"
            >
              {!placed || !activeLab ? (
                <div className="text-center text-muted-foreground"><Server className="mx-auto h-10 w-10 opacity-50" /><p className="mt-3 font-medium">Choose a machine</p><p className="mt-1 text-xs">Select or drag a VM from the machine palette.</p></div>
              ) : (
                <div className="w-full max-w-4xl rounded-2xl border bg-background p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted"><Server className="h-6 w-6" /></div>
                      <div><p className="font-semibold">{activeLab.name}</p><p className="text-xs text-muted-foreground">AWS EC2 · {activeLab.recommendedInstanceType} · {activeLab.platform === "windows" ? "PowerShell" : "Bash"}</p></div>
                    </div>
                    <Badge variant="outline" className="capitalize">{instance?.status || (activeLab.available ? "not started" : "activation required")}</Badge>
                  </div>

                  <p className="mt-4 text-sm text-muted-foreground">{activeLab.description}</p>
                  {!activeLab.available && activeLab.availabilityNote && (
                    <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
                      {activeLab.availabilityNote}{activeLab.marketplaceProductCode ? ` Product code: ${activeLab.marketplaceProductCode}` : ""}
                    </div>
                  )}
                  {instance?.lastError && <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">The last cloud operation failed. Open terminal diagnostics or retry the lifecycle action for details.</p>}
                  {instance?.expiresAt && <p className="mt-4 text-xs text-muted-foreground">Temporary session expires {new Date(instance.expiresAt).toLocaleString()}.</p>}

                  <div className="mt-5 flex flex-wrap gap-2">
                    {!instance && (
                      <Button onClick={() => void createLab()} disabled={!capabilities?.configured || !activeLab.available || busy === "create"}>
                        {busy === "create" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                        {activeLab.available ? `Start ${activeLab.shortName}` : "Marketplace activation required"}
                      </Button>
                    )}
                    {instance?.status === "stopped" && <Button onClick={() => void act(instance.id, "start")} disabled={Boolean(busy)}><Play className="mr-2 h-4 w-4" />Start</Button>}
                    {instance?.status === "running" && (
                      <>
                        {capabilities?.supportsTerminal && <Button variant="outline" onClick={() => void toggleTerminal(instance.id)}><Terminal className="mr-2 h-4 w-4" />{terminalId === instance.id ? "Close terminal" : "Terminal"}</Button>}
                        <Button variant="outline" onClick={() => void act(instance.id, "stop")} disabled={Boolean(busy)}><CircleStop className="mr-2 h-4 w-4" />Stop</Button>
                      </>
                    )}
                    {instance && !["destroying", "destroyed"].includes(instance.status) && <Button variant="destructive" onClick={() => void act(instance.id, "destroy")} disabled={Boolean(busy)}><Trash2 className="mr-2 h-4 w-4" />Destroy</Button>}
                  </div>

                  {instance && TRANSITIONAL.includes(instance.status) && <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />AWS is updating the machine. Status refreshes automatically.</div>}

                  {terminalId === instance?.id && instance.status === "running" && (
                    <div className="mt-5 space-y-3 border-t pt-5">
                      <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                        <span className="rounded bg-muted px-2 py-1">Oxsig {short(instance.id)}</span><span>›</span>
                        <span className="rounded bg-muted px-2 py-1">EC2 {short(terminalDiagnostics?.instanceId, 18)}</span><span>›</span>
                        <span className="rounded bg-muted px-2 py-1">{terminalDiagnostics?.ec2State || "checking EC2"}</span><span>›</span>
                        <span className="rounded bg-muted px-2 py-1">SSM {terminalDiagnostics?.ssmPingStatus || (terminalDiagnostics?.ssmRegistered ? "registered" : "checking")}</span><span>›</span>
                        <span className="rounded bg-muted px-2 py-1">{terminalDiagnostics?.platformType || activeLab.platform}</span><span>›</span>
                        <span className="rounded bg-muted px-2 py-1">{terminalDiagnostics?.region || capabilities?.region || "region"}</span>
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void refreshTerminal(instance.id)} disabled={busy === "diagnostics"}><RefreshCw className={`mr-1 h-3 w-3 ${busy === "diagnostics" ? "animate-spin" : ""}`} />Refresh</Button>
                      </div>

                      {terminalDiagnostics && (
                        <div className={`rounded-lg border p-3 text-xs ${terminalDiagnostics.ready ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
                          <div className="flex flex-wrap gap-x-4 gap-y-1"><span>EC2: <strong>{terminalDiagnostics.ec2State}</strong></span><span>SSM: <strong>{terminalDiagnostics.ssmRegistered ? "registered" : "not registered"}</strong></span><span>Ping: <strong>{terminalDiagnostics.ssmPingStatus || "—"}</strong></span><span>Agent: <strong>{terminalDiagnostics.ssmAgentVersion || "—"}</strong></span><span>OS: <strong>{[terminalDiagnostics.platformName, terminalDiagnostics.platformVersion].filter(Boolean).join(" ") || "—"}</strong></span></div>
                        </div>
                      )}

                      {terminalFailure && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"><div className="font-mono">{terminalFailure.stage || "unknown"}/{terminalFailure.code || "ERROR"}</div><div className="mt-1">{terminalFailure.error}</div></div>}

                      <div className="min-h-56 max-h-[520px] overflow-auto rounded-lg bg-black p-4 font-mono text-xs text-emerald-400">
                        {history.length === 0 ? <div className="text-emerald-300/70">Terminal diagnostics are visible above. Run a command when EC2 is running and SSM is Online.</div> : history.map((entry) => (
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

                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void runCommand(); }} placeholder={activeLab.defaultCommand} aria-label="Lab command" className="font-mono" />
                        <Button onClick={() => void runCommand()} disabled={busy === "command" || !command.trim() || terminalDiagnostics?.ready !== true}>{busy === "command" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Run</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
