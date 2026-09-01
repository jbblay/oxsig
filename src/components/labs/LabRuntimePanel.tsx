"use client";

import * as React from "react";
import { Boxes, CircleStop, Loader2, Network, Play, RotateCcw, Server, Terminal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { LabDefinition, LabInstanceStatus, LabRuntimeCapabilities } from "@/lib/labs/types";

type Capabilities = LabRuntimeCapabilities & { reason?: string };
type Instance = { id: string; slug: string; name: string; status: LabInstanceStatus; lastError?: string; createdAt: string; expiresAt: string };

async function csrfToken() { const response = await fetch("/api/csrf-token", { cache: "no-store" }); if (!response.ok) throw new Error("Secure request setup failed"); return (await response.json()).token as string; }
async function errorMessage(response: Response, fallback: string) { const body = await response.json().catch(() => null); return body?.error || fallback; }

export default function LabRuntimePanel({ embedded = false }: { embedded?: boolean }) {
  const [catalog, setCatalog] = React.useState<LabDefinition[]>([]);
  const [capabilities, setCapabilities] = React.useState<Capabilities | null>(null);
  const [instances, setInstances] = React.useState<Instance[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [terminalId, setTerminalId] = React.useState<string | null>(null);
  const [command, setCommand] = React.useState("whoami && id && uname -a");
  const [output, setOutput] = React.useState("");
  const [selectedSlug, setSelectedSlug] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try { const response = await fetch("/api/labs", { cache: "no-store" }); if (!response.ok) throw new Error(await errorMessage(response, "Could not load labs")); const body = await response.json(); setCatalog(body.catalog); setSelectedSlug((current) => current || body.catalog[0]?.slug || null); setCapabilities(body.capabilities); setInstances(body.instances); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not load labs"); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const createLab = async (slug: string) => {
    setBusy(slug);
    try { const csrf = await csrfToken(); const response = await fetch("/api/labs", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify({ slug }) }); if (!response.ok) throw new Error(await errorMessage(response, "Could not start lab")); toast.success("Kali lab started"); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not start lab"); }
    finally { setBusy(null); }
  };

  const act = async (id: string, action: "start" | "stop" | "reset" | "destroy") => {
    setBusy(id);
    try { const csrf = await csrfToken(); const response = await fetch(`/api/labs/instances/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify({ action }) }); if (!response.ok) throw new Error(await errorMessage(response, `Could not ${action} lab`)); if (action === "destroy") setTerminalId(null); toast.success(`Lab ${action} complete`); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : `Could not ${action} lab`); }
    finally { setBusy(null); }
  };

  const runCommand = async () => {
    if (!terminalId || !command.trim()) return;
    setBusy(terminalId);
    try { const csrf = await csrfToken(); const response = await fetch(`/api/labs/instances/${terminalId}/terminal`, { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify({ command }) }); if (!response.ok) throw new Error(await errorMessage(response, "Command failed")); const body = await response.json(); setOutput(`${body.stdout || ""}${body.stderr ? `\n${body.stderr}` : ""}`.trim() || "(no output)"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Command failed"); }
    finally { setBusy(null); }
  };

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  const running = instances.filter((item) => item.status === "running").length;
  const selectedLab = catalog.find((lab) => lab.slug === selectedSlug) || catalog[0];
  const selectedInstances = instances.filter((instance) => instance.slug === selectedLab?.slug);

  return <div className="space-y-6 pb-12">
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><h2 className={embedded ? "text-xl font-semibold" : "text-2xl font-bold md:text-3xl"}>{embedded ? "Runtime Manager" : "Cyber Lab"}</h2><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Disposable, user-owned security environments. OXSIG reports a lab as running only after its real runtime confirms it.</p></div><Badge variant={capabilities?.configured ? "default" : "outline"}>Runtime: {capabilities?.configured ? "Docker connected" : "Unavailable"}</Badge></div>
    {!capabilities?.configured && <Card className="border-amber-500/40"><CardContent className="pt-6"><p className="font-medium">Labs are honest but unavailable on this deployment</p><p className="mt-1 text-sm text-muted-foreground">{capabilities?.reason} Vercel cannot host Docker containers; run OXSIG on an isolated Docker-capable server and set <code>LAB_DOCKER_ENABLED=true</code>.</p></CardContent></Card>}
    <div className="grid gap-3 sm:grid-cols-3"><Card><CardContent className="pt-5"><Boxes className="mb-2 h-5 w-5 text-blue-500" /><div className="text-2xl font-bold">{catalog.length}</div><p className="text-xs text-muted-foreground">Lab definitions</p></CardContent></Card><Card><CardContent className="pt-5"><Terminal className="mb-2 h-5 w-5 text-emerald-500" /><div className="text-2xl font-bold">{running}</div><p className="text-xs text-muted-foreground">Running containers</p></CardContent></Card><Card><CardContent className="pt-5"><RotateCcw className="mb-2 h-5 w-5 text-violet-500" /><div className="text-2xl font-bold">{instances.length}</div><p className="text-xs text-muted-foreground">Your lab instances</p></CardContent></Card></div>

    {selectedLab && <Card><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><Network className="h-5 w-5" />Selected topology</CardTitle><CardDescription className="mt-1">The topology represents the lab you selected, not unrelated browser peers.</CardDescription></div><Badge variant="secondary">{selectedLab.name}</Badge></div></CardHeader><CardContent><div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6"><div className="text-center"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border bg-background shadow-sm"><Server className="h-9 w-9 text-primary" /></div><p className="mt-3 font-medium">{selectedLab.name}</p><p className="text-xs text-muted-foreground">{selectedLab.runtime} · {selectedLab.estimatedMemoryMb} MB</p><Badge variant="outline" className="mt-2 capitalize">{selectedInstances[0]?.status || "not started"}</Badge></div></div></CardContent></Card>}

    {instances.length > 0 && <Card><CardHeader><CardTitle>Your labs</CardTitle><CardDescription>Lifecycle controls are authorized by the backend and scoped to your account.</CardDescription></CardHeader><CardContent className="space-y-3">{instances.map((instance) => <div key={instance.id} className="rounded-lg border p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex items-center gap-2"><p className="font-medium">{instance.name}</p><Badge variant="outline" className="capitalize">{instance.status}</Badge></div>{instance.lastError && <p className="mt-1 text-xs text-destructive">The runtime reported an error. Retry or destroy this instance.</p>}</div><div className="flex flex-wrap gap-2">{instance.status === "stopped" && <Button size="sm" onClick={() => void act(instance.id, "start")} disabled={busy === instance.id}><Play className="mr-2 h-4 w-4" />Start</Button>}{instance.status === "running" && <><Button size="sm" variant="outline" onClick={() => setTerminalId(terminalId === instance.id ? null : instance.id)}><Terminal className="mr-2 h-4 w-4" />Terminal</Button><Button size="sm" variant="outline" onClick={() => void act(instance.id, "stop")} disabled={busy === instance.id}><CircleStop className="mr-2 h-4 w-4" />Stop</Button><Button size="sm" variant="outline" onClick={() => void act(instance.id, "reset")} disabled={busy === instance.id}><RotateCcw className="mr-2 h-4 w-4" />Reset</Button></>}<Button size="sm" variant="destructive" onClick={() => void act(instance.id, "destroy")} disabled={busy === instance.id}><Trash2 className="mr-2 h-4 w-4" />Destroy</Button></div></div>
          {terminalId === instance.id && <div className="mt-4 space-y-2"><div className="flex gap-2"><Input value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void runCommand(); }} aria-label="Lab command" /><Button onClick={() => void runCommand()} disabled={busy === instance.id}>Run</Button></div><pre className="min-h-32 overflow-auto rounded-lg bg-black p-3 text-xs text-emerald-400">{output || "Run a command inside your isolated Kali container."}</pre></div>}
        </div>)}</CardContent></Card>}

    <div><h2 className="text-xl font-semibold">Lab catalog</h2><p className="text-sm text-muted-foreground">The Kali vertical slice is first; multi-host and VM labs remain deliberately deferred.</p></div>
    <div className="grid gap-4 lg:grid-cols-2">{catalog.map((lab) => <Card key={lab.slug} className={selectedSlug === lab.slug ? "border-primary" : ""}><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-lg">{lab.name}</CardTitle><CardDescription className="mt-1">{lab.description}</CardDescription></div><Badge variant="secondary" className="capitalize">{lab.runtime}</Badge></div></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap gap-2"><Badge variant="outline">{lab.category}</Badge><Badge variant="outline" className="capitalize">{lab.difficulty}</Badge><Badge variant="outline">{lab.estimatedMemoryMb} MB</Badge></div><ul className="space-y-1 text-sm text-muted-foreground">{lab.objectives.map((objective) => <li key={objective}>• {objective}</li>)}</ul><p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">{lab.availabilityReason}</p><div className="flex gap-2"><Button variant={selectedSlug === lab.slug ? "secondary" : "outline"} onClick={() => setSelectedSlug(lab.slug)}>{selectedSlug === lab.slug ? "Selected" : "View topology"}</Button><Button onClick={() => { setSelectedSlug(lab.slug); void createLab(lab.slug); }} disabled={!capabilities?.configured || !lab.available || busy === lab.slug}>{busy === lab.slug ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}Start lab</Button></div></CardContent></Card>)}</div>
  </div>;
}
