"use client";

import * as React from "react";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";
import {
  Clock3,
  Network,
  Play,
  RotateCcw,
  Server,
  ShieldCheck,
  Square,
  Terminal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

interface LabDefinition {
  id: string;
  name: string;
  description: string;
  targetHost: string;
  targetPort: number;
  objectives: string[];
  hints: string[];
}

interface LabSession {
  id: string;
  labId: string;
  state: string;
  createdAt: string;
  expiresAt: string;
  targetHost: string;
  targetPort: number;
}

interface SocketResult<T = unknown> {
  ok: boolean;
  error?: string;
  session?: LabSession | null;
  labs?: LabDefinition[];
  data?: T;
}

const ANSI_PATTERN = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

function cleanTerminalOutput(value: string) {
  return value.replace(ANSI_PATTERN, "").replace(/\r/g, "");
}

function remainingTime(expiresAt?: string) {
  if (!expiresAt) return "--:--";
  const remaining = Math.max(0, Date.parse(expiresAt) - Date.now());
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function LabsPage() {
  const socketRef = React.useRef<Socket | null>(null);
  const terminalRef = React.useRef<HTMLPreElement | null>(null);
  const [labs, setLabs] = React.useState<LabDefinition[]>([]);
  const [selectedLabId, setSelectedLabId] = React.useState("web-recon-01");
  const [session, setSession] = React.useState<LabSession | null>(null);
  const [connected, setConnected] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [terminalAttached, setTerminalAttached] = React.useState(false);
  const [terminalOutput, setTerminalOutput] = React.useState(
    "OxSig Lab Terminal\nLaunch the lab to create an isolated Kali session.\n"
  );
  const [command, setCommand] = React.useState("");
  const [, forceClock] = React.useState(0);

  const selectedLab = labs.find(lab => lab.id === selectedLabId) || labs[0];

  const emit = React.useCallback(<T,>(event: string, payload: unknown): Promise<SocketResult<T>> => {
    return new Promise(resolve => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        resolve({ ok: false, error: "Lab service is disconnected." });
        return;
      }
      socket.emit(event, payload, (result: SocketResult<T>) => resolve(result));
    });
  }, []);

  const attachTerminal = React.useCallback(async (sessionId: string) => {
    const result = await emit("lab:terminal:attach", { sessionId });
    if (!result.ok) {
      toast.error(result.error || "Unable to attach terminal");
      return;
    }
    setTerminalAttached(true);
    setTerminalOutput("Connecting to disposable Kali container...\n");
  }, [emit]);

  React.useEffect(() => {
    const socket = io({
      path: "/socket.io/",
      transports: ["websocket", "polling"],
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("lab:catalog", {}, (result: SocketResult) => {
        if (!result.ok) {
          toast.error(result.error || "Unable to load labs");
          return;
        }
        setLabs(result.labs || []);
        setSession(result.session || null);
        if (result.session?.id) attachTerminal(result.session.id);
      });
    });

    socket.on("disconnect", () => {
      setConnected(false);
      setTerminalAttached(false);
    });

    socket.on("lab:terminal:data", ({ data }: { sessionId: string; data: string }) => {
      setTerminalOutput(previous => `${previous}${cleanTerminalOutput(data)}`.slice(-50000));
    });

    socket.on("lab:terminal:exit", () => {
      setTerminalAttached(false);
      setTerminalOutput(previous => `${previous}\n[terminal detached]\n`);
    });

    return () => {
      socket.emit("lab:terminal:detach", {});
      socket.disconnect();
      socketRef.current = null;
    };
  }, [attachTerminal]);

  React.useEffect(() => {
    const timer = window.setInterval(() => forceClock(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  React.useEffect(() => {
    terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight });
  }, [terminalOutput]);

  async function launchLab() {
    setBusy(true);
    try {
      const result = await emit("lab:start", { labId: selectedLabId });
      if (!result.ok || !result.session) throw new Error(result.error || "Unable to launch lab");
      setSession(result.session);
      setTerminalOutput("");
      await attachTerminal(result.session.id);
      toast.success("Isolated Kali lab launched");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to launch lab");
    } finally {
      setBusy(false);
    }
  }

  async function stopLab() {
    if (!session) return;
    setBusy(true);
    try {
      await emit("lab:terminal:detach", {});
      const result = await emit("lab:stop", { sessionId: session.id });
      if (!result.ok) throw new Error(result.error || "Unable to stop lab");
      setSession(null);
      setTerminalAttached(false);
      setTerminalOutput("Lab destroyed. Launch again for a fresh environment.\n");
      toast.success("Lab destroyed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to stop lab");
    } finally {
      setBusy(false);
    }
  }

  async function resetLab() {
    if (!session) return;
    setBusy(true);
    try {
      await emit("lab:terminal:detach", {});
      const result = await emit("lab:reset", { sessionId: session.id });
      if (!result.ok || !result.session) throw new Error(result.error || "Unable to reset lab");
      setSession(result.session);
      setTerminalOutput("");
      await attachTerminal(result.session.id);
      toast.success("Fresh lab environment created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to reset lab");
    } finally {
      setBusy(false);
    }
  }

  async function submitCommand(event: React.FormEvent) {
    event.preventDefault();
    if (!session || !terminalAttached || !command.trim()) return;

    const nextCommand = command;
    setCommand("");
    const result = await emit("lab:terminal:input", {
      sessionId: session.id,
      data: `${nextCommand}\n`,
    });
    if (!result.ok) toast.error(result.error || "Terminal input failed");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Terminal className="h-6 w-6 text-emerald-500" />
            <h1 className="text-3xl font-bold tracking-tight">Practical Labs</h1>
          </div>
          <p className="mt-1 text-muted-foreground">
            Disposable, isolated cybersecurity exercises running behind the OxSig security boundary.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={connected ? "default" : "destructive"}>
            {connected ? "Lab service online" : "Lab service offline"}
          </Badge>
          {session && <Badge variant="outline">{session.state}</Badge>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Lab catalog</CardTitle>
              <CardDescription>Start with the first safe terminal-based exercise.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {labs.map(lab => (
                <button
                  key={lab.id}
                  type="button"
                  onClick={() => setSelectedLabId(lab.id)}
                  disabled={Boolean(session)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    selectedLabId === lab.id ? "border-primary bg-primary/5" : "hover:bg-muted/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{lab.name}</span>
                    <Badge variant="secondary">Docker</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{lab.description}</p>
                </button>
              ))}

              {!labs.length && (
                <p className="text-sm text-muted-foreground">Waiting for the authenticated lab service...</p>
              )}

              <Separator />

              <div className="flex gap-2">
                {!session ? (
                  <Button className="flex-1" onClick={launchLab} disabled={busy || !connected || !selectedLab}>
                    <Play className="mr-2 h-4 w-4" />
                    Launch lab
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" className="flex-1" onClick={resetLab} disabled={busy}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Reset
                    </Button>
                    <Button variant="destructive" className="flex-1" onClick={stopLab} disabled={busy}>
                      <Square className="mr-2 h-4 w-4" />
                      Destroy
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                Isolation policy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Private per-session Docker network.</p>
              <p>No privileged mode or host networking.</p>
              <p>All Linux capabilities dropped.</p>
              <p>Read-only root filesystem with limited tmpfs.</p>
              <p>Automatic expiry and lifecycle-only auditing.</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 min-w-0">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>{selectedLab?.name || "Lab workspace"}</CardTitle>
                  <CardDescription>{selectedLab?.description}</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline" className="gap-1">
                    <Network className="h-3 w-3" />
                    {selectedLab ? `${selectedLab.targetHost}:${selectedLab.targetPort}` : "target"}
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <Clock3 className="h-3 w-3" />
                    {session ? remainingTime(session.expiresAt) : "30:00"}
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <Server className="h-3 w-3" />
                    512 MB Kali
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 font-semibold">Objectives</h3>
                  <ol className="space-y-2 text-sm text-muted-foreground">
                    {(selectedLab?.objectives || []).map((objective, index) => (
                      <li key={objective} className="flex gap-2">
                        <span className="font-mono text-foreground">{index + 1}.</span>
                        <span>{objective}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div>
                  <h3 className="mb-2 font-semibold">Hints</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {(selectedLab?.hints || []).map(hint => (
                      <li key={hint} className="flex gap-2">
                        <span aria-hidden>•</span>
                        <span>{hint}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-slate-800 bg-slate-950 text-slate-100">
            <CardHeader className="border-b border-slate-800 bg-slate-900/70 py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm text-slate-100">
                  <Terminal className="h-4 w-4 text-emerald-400" />
                  kali@oxsig-lab
                </CardTitle>
                <span className="text-xs text-slate-400">
                  {terminalAttached ? "attached" : "detached"}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <pre
                ref={terminalRef}
                className="h-[420px] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-[13px] leading-5"
                aria-live="polite"
              >
                {terminalOutput}
              </pre>
              <form onSubmit={submitCommand} className="flex border-t border-slate-800 bg-slate-900 p-3">
                <span className="mr-2 self-center font-mono text-emerald-400">$</span>
                <Input
                  value={command}
                  onChange={event => setCommand(event.target.value)}
                  disabled={!terminalAttached || !session}
                  placeholder={session ? "Enter a command" : "Launch the lab to enable terminal input"}
                  autoComplete="off"
                  spellCheck={false}
                  className="border-slate-700 bg-slate-950 font-mono text-slate-100 placeholder:text-slate-600"
                />
                <Button type="submit" className="ml-2" disabled={!terminalAttached || !command.trim()}>
                  Run
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
