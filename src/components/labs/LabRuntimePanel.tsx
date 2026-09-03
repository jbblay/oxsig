"use client";

import * as React from "react";
import {
  CircleStop,
  Cloud,
  GripVertical,
  Loader2,
  Play,
  Plus,
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

export default function LabRuntimePanel({ embedded = false }: { embedded?: boolean }) {
  const [catalog, setCatalog] = React.useState<LabDefinition[]>([]);
  const [capabilities, setCapabilities] = React.useState<Capabilities | null>(null);
  const [instances, setInstances] = React.useState<Instance[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [placed, setPlaced] = React.useState(false);
  const [terminalId, setTerminalId] = React.useState<string | null>(null);
  const [command, setCommand] = React.useState("whoami && hostname && uname -a");
  const [output, setOutput] = React.useState("");

  const load = React.useCallback(async (silent = false) => {
    try {
      const response = await fetch("/api/labs", { cache: "no-store" });
      if (!response.ok) throw new Error(await errorMessage(response, "Could not load the Cyber Lab"));
      const body = await response.json();
      setCatalog(body.catalog || []);
      setCapabilities(body.capabilities || null);
      setInstances(body.instances || []);
      if ((body.instances || []).length > 0) setPlaced(true);
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Could not load the Cyber Lab");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!instances.some((instance) => TRANSITIONAL.includes(instance.status))) return;
    const timer = window.setInterval(() => void load(true), 4000);
    return () => window.clearInterval(timer);
  }, [instances, load]);

  const lab = catalog[0];
  const instance = instances[0];

  const createLab = async () => {
    if (!lab) return;
    setBusy("create");
    try {
      const csrf = await csrfToken();
      const response = await fetch("/api/labs", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ slug: lab.slug }),
      });
      if (!response.ok) throw new Error(await errorMessage(response, "Could not start the cloud lab"));
      toast.success("Cloud VM requested");
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
        setOutput("");
      }
      toast.success(action === "destroy" ? "VM termination requested" : `VM ${action} requested`);
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not ${action} the lab`);
    } finally {
      setBusy(null);
    }
  };

  const runCommand = async () => {
    if (!terminalId || !command.trim()) return;
    setBusy("command");
    try {
      const csrf = await csrfToken();
      const response = await fetch(`/api/labs/instances/${terminalId}/terminal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ command }),
      });
      if (!response.ok) throw new Error(await errorMessage(response, "Command failed"));
      const body = await response.json();
      setOutput(`${body.stdout || ""}${body.stderr ? `\n${body.stderr}` : ""}`.trim() || "(no output)");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Command failed");
    } finally {
      setBusy(null);
    }
  };

  const addToCanvas = () => setPlaced(true);

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className={embedded ? "text-xl font-semibold" : "text-2xl font-bold md:text-3xl"}>
            {embedded ? "Lab" : "Cyber Lab"}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Build a lab visually, start real temporary machines in AWS, and remove them when the session is finished.
          </p>
        </div>
        <Badge variant={capabilities?.configured ? "default" : "outline"}>
          <Cloud className="mr-1 h-3.5 w-3.5" />
          {capabilities?.configured ? `AWS ${capabilities.region || "connected"}` : "AWS setup needed"}
        </Badge>
      </div>

      {!capabilities?.configured && (
        <Card className="border-amber-500/40">
          <CardContent className="pt-6">
            <p className="font-medium">Cloud runtime is not ready on this deployment</p>
            <p className="mt-1 text-sm text-muted-foreground">{capabilities?.reason}</p>
          </CardContent>
        </Card>
      )}

      {capabilities?.configured && !capabilities.supportsTerminal && capabilities.reason && (
        <Card className="border-blue-500/30">
          <CardContent className="pt-6 text-sm text-muted-foreground">{capabilities.reason}</CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Machines</CardTitle>
            <CardDescription>Drag on desktop or tap Add on mobile.</CardDescription>
          </CardHeader>
          <CardContent>
            {lab ? (
              <div
                draggable
                onDragStart={(event) => event.dataTransfer.setData("application/x-oxsig-lab", lab.slug)}
                className="rounded-xl border bg-background p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <GripVertical className="mt-1 h-5 w-5 text-muted-foreground" />
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Server className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">Ubuntu</p>
                    <p className="text-xs text-muted-foreground">Temporary AWS VM</p>
                  </div>
                </div>
                <Button className="mt-4 w-full" size="sm" variant="outline" onClick={addToCanvas}>
                  <Plus className="mr-2 h-4 w-4" />Add to canvas
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No machine template is available.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lab canvas</CardTitle>
            <CardDescription>The MVP starts with one machine. Connections and multi-machine topologies come after this path works end-to-end.</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (event.dataTransfer.getData("application/x-oxsig-lab")) addToCanvas();
              }}
              className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed bg-muted/20 p-5"
            >
              {!placed ? (
                <div className="text-center text-muted-foreground">
                  <Server className="mx-auto h-10 w-10 opacity-50" />
                  <p className="mt-3 font-medium">Drop a machine here</p>
                  <p className="mt-1 text-xs">Or use Add to canvas from a phone.</p>
                </div>
              ) : (
                <div className="w-full max-w-md rounded-2xl border bg-background p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                        <Server className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="font-semibold">Ubuntu Security Lab</p>
                        <p className="text-xs text-muted-foreground">AWS EC2 · t3.micro MVP</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="capitalize">{instance?.status || "not started"}</Badge>
                  </div>

                  {instance?.lastError && (
                    <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
                      The last cloud operation failed. You can retry the lifecycle action or destroy the lab.
                    </p>
                  )}

                  {instance?.expiresAt && (
                    <p className="mt-4 text-xs text-muted-foreground">
                      Temporary session expires {new Date(instance.expiresAt).toLocaleString()}.
                    </p>
                  )}

                  <div className="mt-5 flex flex-wrap gap-2">
                    {!instance && (
                      <Button onClick={() => void createLab()} disabled={!capabilities?.configured || busy === "create"}>
                        {busy === "create" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                        Start VM
                      </Button>
                    )}

                    {instance?.status === "stopped" && (
                      <Button onClick={() => void act(instance.id, "start")} disabled={Boolean(busy)}>
                        <Play className="mr-2 h-4 w-4" />Start
                      </Button>
                    )}

                    {instance?.status === "running" && (
                      <>
                        {capabilities?.supportsTerminal && (
                          <Button
                            variant="outline"
                            onClick={() => setTerminalId(terminalId === instance.id ? null : instance.id)}
                          >
                            <Terminal className="mr-2 h-4 w-4" />Command
                          </Button>
                        )}
                        <Button variant="outline" onClick={() => void act(instance.id, "stop")} disabled={Boolean(busy)}>
                          <CircleStop className="mr-2 h-4 w-4" />Stop
                        </Button>
                      </>
                    )}

                    {instance && !["destroying", "destroyed"].includes(instance.status) && (
                      <Button variant="destructive" onClick={() => void act(instance.id, "destroy")} disabled={Boolean(busy)}>
                        <Trash2 className="mr-2 h-4 w-4" />Destroy
                      </Button>
                    )}
                  </div>

                  {instance && TRANSITIONAL.includes(instance.status) && (
                    <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />AWS is updating the machine. Status refreshes automatically.
                    </div>
                  )}

                  {terminalId === instance?.id && instance.status === "running" && (
                    <div className="mt-5 space-y-2 border-t pt-5">
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          value={command}
                          onChange={(event) => setCommand(event.target.value)}
                          onKeyDown={(event) => { if (event.key === "Enter") void runCommand(); }}
                          aria-label="Lab command"
                        />
                        <Button onClick={() => void runCommand()} disabled={busy === "command"}>Run</Button>
                      </div>
                      <pre className="min-h-32 overflow-auto rounded-lg bg-black p-3 text-xs text-emerald-400">
                        {output || "Run a command on the temporary Ubuntu VM."}
                      </pre>
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
