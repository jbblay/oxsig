"use client";

import * as React from "react";
import { CircleDot, Loader2, RefreshCw, Unplug } from "lucide-react";
import type { Terminal as XTermTerminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SsmBrowserDataChannel } from "@/lib/labs/ssm-browser-channel";

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

type SessionResponse = {
  sessionId: string;
  streamUrl: string;
  tokenValue: string;
  region: string;
  target: string;
};

async function getCsrfToken() {
  const response = await fetch("/api/csrf-token", { cache: "no-store" });
  if (!response.ok) throw new Error("Secure terminal setup failed");
  return (await response.json()).token as string;
}

export default function InteractiveSsmTerminal({
  labInstanceId,
  machineLabel,
}: {
  labInstanceId: string;
  machineLabel: string;
}) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const terminalRef = React.useRef<XTermTerminal | null>(null);
  const fitRef = React.useRef<FitAddon | null>(null);
  const channelRef = React.useRef<SsmBrowserDataChannel | null>(null);
  const sessionIdRef = React.useRef<string | null>(null);
  const csrfRef = React.useRef<string | null>(null);
  const generationRef = React.useRef(0);
  const intentionalCloseRef = React.useRef(false);
  const handshakeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [terminalReady, setTerminalReady] = React.useState(false);
  const [state, setState] = React.useState<ConnectionState>("connecting");
  const [error, setError] = React.useState<string | null>(null);
  const [sessionId, setSessionId] = React.useState<string | null>(null);

  const clearHandshakeTimer = React.useCallback(() => {
    if (handshakeTimerRef.current) clearTimeout(handshakeTimerRef.current);
    handshakeTimerRef.current = null;
  }, []);

  const endServerSession = React.useCallback(async (keepalive = false) => {
    const currentSessionId = sessionIdRef.current;
    const csrf = csrfRef.current;
    sessionIdRef.current = null;
    setSessionId(null);
    if (!currentSessionId || !csrf) return;

    try {
      await fetch(`/api/labs/instances/${labInstanceId}/session`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ sessionId: currentSessionId }),
        keepalive,
      });
    } catch {
      // AWS also closes the session when the data channel disappears; cleanup is best-effort here.
    }
  }, [labInstanceId]);

  const disconnect = React.useCallback(async (writeMessage = true) => {
    generationRef.current += 1;
    intentionalCloseRef.current = true;
    clearHandshakeTimer();
    channelRef.current?.close();
    channelRef.current = null;
    await endServerSession(false);
    setState("disconnected");
    setError(null);
    if (writeMessage) terminalRef.current?.writeln("\r\n[Oxsig terminal disconnected]\r\n");
    intentionalCloseRef.current = false;
  }, [clearHandshakeTimer, endServerSession]);

  const connect = React.useCallback(async () => {
    if (!terminalRef.current || !fitRef.current) return;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    intentionalCloseRef.current = true;
    clearHandshakeTimer();
    channelRef.current?.close();
    channelRef.current = null;
    await endServerSession(false);
    intentionalCloseRef.current = false;

    setState("connecting");
    setError(null);
    const terminal = terminalRef.current;
    terminal.writeln(`\r\n[Connecting ${machineLabel} through AWS Systems Manager…]`);

    try {
      const csrf = await getCsrfToken();
      if (generation !== generationRef.current) return;
      csrfRef.current = csrf;

      const response = await fetch(`/api/labs/instances/${labInstanceId}/session`, {
        method: "POST",
        headers: { "x-csrf-token": csrf },
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not start the interactive AWS terminal");
      if (!body.sessionId || !body.streamUrl || !body.tokenValue) {
        throw new Error("AWS did not return a complete terminal session");
      }
      if (generation !== generationRef.current) return;

      const session = body as SessionResponse;
      sessionIdRef.current = session.sessionId;
      setSessionId(session.sessionId);

      const channel = new SsmBrowserDataChannel({
        onOutput: (data) => terminalRef.current?.write(data),
        onReady: (customerMessage) => {
          if (generation !== generationRef.current) return;
          clearHandshakeTimer();
          setState("connected");
          setError(null);
          if (customerMessage) terminalRef.current?.writeln(`\r\n${customerMessage}`);
          requestAnimationFrame(() => {
            fitRef.current?.fit();
            const currentTerminal = terminalRef.current;
            if (currentTerminal) channelRef.current?.resize(currentTerminal.cols, currentTerminal.rows);
            currentTerminal?.focus();
          });
        },
        onError: (message) => {
          if (generation !== generationRef.current) return;
          clearHandshakeTimer();
          setState("error");
          setError(message);
          terminalRef.current?.writeln(`\r\n[Oxsig terminal error: ${message}]\r\n`);
          // A browser upgrade failure may not produce a reliable WebSocket close
          // event on every client. End the AWS session immediately instead of
          // leaving a failed Session Manager session active until timeout.
          void endServerSession(true);
        },
        onClose: (reason) => {
          if (generation !== generationRef.current || intentionalCloseRef.current) return;
          clearHandshakeTimer();
          setState("disconnected");
          if (reason) terminalRef.current?.writeln(`\r\n[Session closed: ${reason}]\r\n`);
          void endServerSession(true);
        },
      });
      channelRef.current = channel;
      channel.connect(session);

      handshakeTimerRef.current = setTimeout(() => {
        if (generation !== generationRef.current || channel.isReady()) return;
        setState("error");
        setError("AWS Session Manager connected, but the interactive shell handshake did not finish in time.");
        terminalRef.current?.writeln("\r\n[Interactive shell handshake timed out]\r\n");
        channel.close();
        void endServerSession(true);
      }, 20_000);
    } catch (connectError) {
      if (generation !== generationRef.current) return;
      const message = connectError instanceof Error ? connectError.message : "Interactive terminal connection failed";
      clearHandshakeTimer();
      setState("error");
      setError(message);
      terminal.writeln(`\r\n[Oxsig terminal error: ${message}]\r\n`);
      await endServerSession(false);
    }
  }, [clearHandshakeTimer, endServerSession, labInstanceId, machineLabel]);

  React.useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let dataDisposable: { dispose(): void } | null = null;

    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      if (disposed || !hostRef.current) return;

      const terminal = new Terminal({
        cursorBlink: true,
        cursorStyle: "block",
        fontSize: 13,
        scrollback: 5000,
        convertEol: false,
      });
      const fit = new FitAddon();
      terminal.loadAddon(fit);
      terminal.open(hostRef.current);
      terminalRef.current = terminal;
      fitRef.current = fit;
      fit.fit();
      terminal.writeln(`Oxsig interactive terminal — ${machineLabel}`);
      terminal.writeln("Persistent shell via AWS Systems Manager. No SSH port is open.\r\n");

      dataDisposable = terminal.onData((data) => channelRef.current?.sendInput(data));
      resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          if (!terminalRef.current || !fitRef.current) return;
          fitRef.current.fit();
          channelRef.current?.resize(terminalRef.current.cols, terminalRef.current.rows);
        });
      });
      resizeObserver.observe(hostRef.current);
      setTerminalReady(true);
    })();

    return () => {
      disposed = true;
      setTerminalReady(false);
      resizeObserver?.disconnect();
      dataDisposable?.dispose();
      clearHandshakeTimer();
      generationRef.current += 1;
      intentionalCloseRef.current = true;
      channelRef.current?.close();
      channelRef.current = null;
      void endServerSession(true);
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [clearHandshakeTimer, endServerSession, machineLabel]);

  React.useEffect(() => {
    if (!terminalReady) return;
    void connect();
  }, [connect, terminalReady]);

  const statusLabel = state === "connected" ? "Connected"
    : state === "connecting" ? "Connecting"
    : state === "error" ? "Error"
    : "Disconnected";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold">Interactive terminal — {machineLabel}</span>
          <Badge variant={state === "connected" ? "default" : "outline"} className="text-[9px]">
            {state === "connecting" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CircleDot className="mr-1 h-3 w-3" />}
            {statusLabel}
          </Badge>
          {sessionId && <span className="font-mono text-[10px] text-muted-foreground">SSM {sessionId.slice(0, 18)}…</span>}
        </div>
        <div className="flex gap-2">
          {state !== "connected" && (
            <Button size="sm" variant="outline" onClick={() => void connect()} disabled={state === "connecting" || !terminalReady}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />Reconnect
            </Button>
          )}
          {(state === "connected" || state === "connecting") && (
            <Button size="sm" variant="outline" onClick={() => void disconnect()}>
              <Unplug className="mr-1.5 h-3.5 w-3.5" />Disconnect
            </Button>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">{error}</div>}
      <div className="overflow-hidden rounded-xl bg-black p-2">
        <div ref={hostRef} className="h-[420px] min-h-[280px] w-full" aria-label={`Interactive terminal for ${machineLabel}`} />
      </div>
      <p className="text-[10px] text-muted-foreground">
        This is one persistent shell session: directories, environment changes, interactive programs, Ctrl+C, and command history remain in the same terminal until you disconnect or the VM ends.
      </p>
    </div>
  );
}
