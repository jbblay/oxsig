"use client";

import * as React from "react";
import { CircleDot, Loader2, RefreshCw, Unplug } from "lucide-react";
import type { Terminal as XTermTerminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SsmBrowserDataChannel } from "@/lib/labs/ssm-browser-channel";
import {
  AI_TERMINAL_QUERY_EVENT,
  AI_TERMINAL_RESULT_EVENT,
  AI_TERMINAL_RUN_EVENT,
  AI_TERMINAL_STATE_EVENT,
  type AiTerminalRunRequest,
  type AiTerminalRunResult,
  type AiTerminalState,
} from "@/lib/labs/ai-terminal-events";

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

type SessionResponse = {
  sessionId: string;
  bridgePath: string;
  tokenValue: string;
  bridgeTicketTtlMs?: number;
  bridgeTicketExpiresAt?: string;
  region: string;
  target: string;
};

type ActiveAiRun = {
  request: AiTerminalRunRequest;
  startMarker: string;
  endMarkerBase: string;
  buffer: string;
  started: boolean;
  timeout: ReturnType<typeof setTimeout> | null;
};

async function getCsrfToken() {
  const response = await fetch("/api/csrf-token", { cache: "no-store" });
  if (!response.ok) throw new Error("Secure terminal setup failed");
  return (await response.json()).token as string;
}

function bridgeWebSocketUrl(path: string) {
  const url = new URL(path, window.location.origin);
  url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function utf8Base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}

function cleanTerminalEvidence(value: string) {
  return value
    .replace(/\x1B(?:[@-_][0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g, "")
    .replace(/\r/g, "")
    .trim();
}

export default function InteractiveSsmTerminal({
  labInstanceId,
  machineLabel,
  focusMode = false,
}: {
  labInstanceId: string;
  machineLabel: string;
  focusMode?: boolean;
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
  const activeAiRunRef = React.useRef<ActiveAiRun | null>(null);
  const [terminalReady, setTerminalReady] = React.useState(false);
  const [state, setState] = React.useState<ConnectionState>("connecting");
  const [error, setError] = React.useState<string | null>(null);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [statusDetail, setStatusDetail] = React.useState<string | null>(null);
  const [bridgeTicketExpiresAt, setBridgeTicketExpiresAt] = React.useState<string | null>(null);
  const [nowMs, setNowMs] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!bridgeTicketExpiresAt || state !== "connecting") return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [bridgeTicketExpiresAt, state]);

  const clearHandshakeTimer = React.useCallback(() => {
    if (handshakeTimerRef.current) clearTimeout(handshakeTimerRef.current);
    handshakeTimerRef.current = null;
  }, []);

  const emitTerminalState = React.useCallback((connected: boolean) => {
    window.dispatchEvent(new CustomEvent<AiTerminalState>(AI_TERMINAL_STATE_EVENT, {
      detail: { labInstanceId, connected },
    }));
  }, [labInstanceId]);

  const finishAiRun = React.useCallback((result: AiTerminalRunResult) => {
    const active = activeAiRunRef.current;
    if (active?.timeout) clearTimeout(active.timeout);
    activeAiRunRef.current = null;
    window.dispatchEvent(new CustomEvent<AiTerminalRunResult>(AI_TERMINAL_RESULT_EVENT, { detail: result }));
  }, []);

  const failActiveAiRun = React.useCallback((message: string) => {
    const active = activeAiRunRef.current;
    if (!active) return;
    finishAiRun({
      requestId: active.request.requestId,
      labInstanceId,
      command: active.request.command,
      stdout: cleanTerminalEvidence(active.buffer),
      stderr: message,
      exitCode: -1,
      error: message,
    });
  }, [finishAiRun, labInstanceId]);

  const handleChannelOutput = React.useCallback((data: string) => {
    const active = activeAiRunRef.current;
    if (!active) {
      terminalRef.current?.write(data);
      return;
    }

    active.buffer += data;

    if (!active.started) {
      const startIndex = active.buffer.indexOf(active.startMarker);
      if (startIndex < 0) {
        const keep = Math.max(active.startMarker.length * 2, 256);
        if (active.buffer.length > keep) active.buffer = active.buffer.slice(-keep);
        return;
      }
      active.started = true;
      active.buffer = active.buffer.slice(startIndex + active.startMarker.length).replace(/^[\r\n]+/, "");
    }

    const endIndex = active.buffer.indexOf(active.endMarkerBase);
    if (endIndex < 0) return;

    const afterMarker = active.buffer.slice(endIndex + active.endMarkerBase.length);
    const exitMatch = afterMarker.match(/^(-?\d+)/);
    if (!exitMatch) return;

    const rawOutput = active.buffer.slice(0, endIndex).replace(/[\r\n]+$/, "");
    const remainder = afterMarker.slice(exitMatch[0].length).replace(/^[\r\n]+/, "");
    if (rawOutput) terminalRef.current?.write(`${rawOutput}\r\n`);
    if (remainder) terminalRef.current?.write(remainder);

    const exitCode = Number.parseInt(exitMatch[1], 10);
    setStatusDetail(`AI Practitioner command completed in the visible terminal with exit ${exitCode}.`);
    finishAiRun({
      requestId: active.request.requestId,
      labInstanceId,
      command: active.request.command,
      stdout: cleanTerminalEvidence(rawOutput),
      stderr: "",
      exitCode: Number.isFinite(exitCode) ? exitCode : -1,
    });
  }, [finishAiRun, labInstanceId]);

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
    failActiveAiRun("The interactive terminal disconnected before the AI command completed.");
    channelRef.current?.close();
    channelRef.current = null;
    await endServerSession(false);
    setState("disconnected");
    setError(null);
    setStatusDetail("Disconnected from the AWS Systems Manager shell.");
    setBridgeTicketExpiresAt(null);
    emitTerminalState(false);
    if (writeMessage) terminalRef.current?.writeln("\r\n[Oxsig terminal disconnected]\r\n");
    intentionalCloseRef.current = false;
  }, [clearHandshakeTimer, emitTerminalState, endServerSession, failActiveAiRun]);

  const connect = React.useCallback(async () => {
    if (!terminalRef.current || !fitRef.current) return;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    intentionalCloseRef.current = true;
    clearHandshakeTimer();
    failActiveAiRun("The terminal reconnected before the AI command completed.");
    channelRef.current?.close();
    channelRef.current = null;
    await endServerSession(false);
    intentionalCloseRef.current = false;

    setState("connecting");
    setError(null);
    setStatusDetail("Requesting an interactive Session Manager shell.");
    setBridgeTicketExpiresAt(null);
    emitTerminalState(false);
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
      if (!body.sessionId || !body.bridgePath || !body.tokenValue) {
        throw new Error("Oxsig did not return a complete terminal bridge session");
      }
      if (generation !== generationRef.current) return;

      const session = body as SessionResponse;
      sessionIdRef.current = session.sessionId;
      setSessionId(session.sessionId);
      setBridgeTicketExpiresAt(session.bridgeTicketExpiresAt || null);
      if (session.bridgeTicketTtlMs) {
        setStatusDetail(`Session created. Bridge ticket valid for about ${Math.max(1, Math.ceil(session.bridgeTicketTtlMs / 1000))}s while connecting.`);
      }

      const channel = new SsmBrowserDataChannel({
        onOutput: handleChannelOutput,
        onReady: (customerMessage) => {
          if (generation !== generationRef.current) return;
          clearHandshakeTimer();
          setState("connected");
          setError(null);
          setBridgeTicketExpiresAt(null);
          setStatusDetail("Connected to the persistent shell session.");
          emitTerminalState(true);
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
          failActiveAiRun(message);
          setState("error");
          setError(message);
          setStatusDetail("Connection failed before the interactive shell became ready.");
          setBridgeTicketExpiresAt(null);
          emitTerminalState(false);
          terminalRef.current?.writeln(`\r\n[Oxsig terminal error: ${message}]\r\n`);
          void endServerSession(true);
        },
        onClose: (reason) => {
          if (generation !== generationRef.current || intentionalCloseRef.current) return;
          clearHandshakeTimer();
          failActiveAiRun(reason || "The terminal session closed before the AI command completed.");
          setState("disconnected");
          setStatusDetail(reason ? `Session closed: ${reason}` : "Session closed.");
          setBridgeTicketExpiresAt(null);
          emitTerminalState(false);
          if (reason) terminalRef.current?.writeln(`\r\n[Session closed: ${reason}]\r\n`);
          void endServerSession(true);
        },
      });
      channelRef.current = channel;
      channel.connect({
        sessionId: session.sessionId,
        streamUrl: bridgeWebSocketUrl(session.bridgePath),
        tokenValue: session.tokenValue,
      });

      handshakeTimerRef.current = setTimeout(() => {
        if (generation !== generationRef.current || channel.isReady()) return;
        setState("error");
        setError("AWS Session Manager connected, but the interactive shell handshake did not finish in time.");
        setStatusDetail("AWS accepted the session, but the shell handshake timed out.");
        setBridgeTicketExpiresAt(null);
        emitTerminalState(false);
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
      setStatusDetail("Connection attempt failed.");
      setBridgeTicketExpiresAt(null);
      emitTerminalState(false);
      terminal.writeln(`\r\n[Oxsig terminal error: ${message}]\r\n`);
      await endServerSession(false);
    }
  }, [clearHandshakeTimer, emitTerminalState, endServerSession, failActiveAiRun, handleChannelOutput, labInstanceId, machineLabel]);

  React.useEffect(() => {
    const answerStateQuery = () => {
      emitTerminalState(state === "connected" && Boolean(channelRef.current?.isReady()));
    };

    const runApprovedCommand = (event: Event) => {
      const request = (event as CustomEvent<AiTerminalRunRequest>).detail;
      if (!request || request.labInstanceId !== labInstanceId) return;

      const channel = channelRef.current;
      if (state !== "connected" || !channel?.isReady()) {
        window.dispatchEvent(new CustomEvent<AiTerminalRunResult>(AI_TERMINAL_RESULT_EVENT, {
          detail: {
            requestId: request.requestId,
            labInstanceId,
            command: request.command,
            stdout: "",
            stderr: "Open and connect the interactive terminal before approving an AI command.",
            exitCode: -1,
            error: "Open and connect the interactive terminal before approving an AI command.",
          },
        }));
        return;
      }

      if (activeAiRunRef.current) {
        window.dispatchEvent(new CustomEvent<AiTerminalRunResult>(AI_TERMINAL_RESULT_EVENT, {
          detail: {
            requestId: request.requestId,
            labInstanceId,
            command: request.command,
            stdout: "",
            stderr: "Another AI command is already running in this terminal.",
            exitCode: -1,
            error: "Another AI command is already running in this terminal.",
          },
        }));
        return;
      }

      const markerId = request.requestId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 80) || `${Date.now()}`;
      const startMarker = `__OXSIG_AI_BEGIN_${markerId}__`;
      const endMarkerBase = `__OXSIG_AI_END_${markerId}__:`;
      const commandBase64 = utf8Base64(request.command);

      terminalRef.current?.writeln(`\r\n[AI Practitioner approved] $ ${request.command}`);
      setStatusDetail("AI Practitioner command is running in this visible terminal.");

      const active: ActiveAiRun = {
        request,
        startMarker,
        endMarkerBase,
        buffer: "",
        started: false,
        timeout: null,
      };
      active.timeout = setTimeout(() => {
        if (activeAiRunRef.current !== active) return;
        channelRef.current?.sendInput("\x03");
        terminalRef.current?.writeln("\r\n[AI Practitioner command timed out after 45 seconds]");
        setStatusDetail("AI Practitioner command timed out; captured terminal evidence will be explained.");
        finishAiRun({
          requestId: request.requestId,
          labInstanceId,
          command: request.command,
          stdout: cleanTerminalEvidence(active.buffer),
          stderr: "The interactive command timed out or required further input.",
          exitCode: -1,
        });
      }, 45_000);
      activeAiRunRef.current = active;

      const shellLine = `__oxsig_id='${markerId}'; __oxsig_cmd="$(printf '%s' '${commandBase64}' | base64 -d)"; printf '\\n__OXSIG_AI_BEGIN_%s__\\n' "$__oxsig_id"; eval "$__oxsig_cmd"; __oxsig_rc=$?; printf '\\n__OXSIG_AI_END_%s__:%s\\n' "$__oxsig_id" "$__oxsig_rc"\r`;
      channel.sendInput(shellLine);
    };

    window.addEventListener(AI_TERMINAL_QUERY_EVENT, answerStateQuery);
    window.addEventListener(AI_TERMINAL_RUN_EVENT, runApprovedCommand);
    return () => {
      window.removeEventListener(AI_TERMINAL_QUERY_EVENT, answerStateQuery);
      window.removeEventListener(AI_TERMINAL_RUN_EVENT, runApprovedCommand);
    };
  }, [emitTerminalState, finishAiRun, labInstanceId, state]);

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

      dataDisposable = terminal.onData((data) => {
        if (activeAiRunRef.current && data !== "\x03") return;
        channelRef.current?.sendInput(data);
      });
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
      failActiveAiRun("The interactive terminal closed before the AI command completed.");
      emitTerminalState(false);
      generationRef.current += 1;
      intentionalCloseRef.current = true;
      channelRef.current?.close();
      channelRef.current = null;
      void endServerSession(true);
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [clearHandshakeTimer, emitTerminalState, endServerSession, failActiveAiRun, machineLabel]);

  React.useEffect(() => {
    if (!terminalReady) return;
    void connect();
  }, [connect, terminalReady]);

  const statusLabel = state === "connected" ? "Connected"
    : state === "connecting" ? "Connecting"
    : state === "error" ? "Error"
    : "Disconnected";
  const ticketSecondsLeft = bridgeTicketExpiresAt ? Math.max(0, Math.ceil((new Date(bridgeTicketExpiresAt).getTime() - nowMs) / 1000)) : null;

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
      {(statusDetail || ticketSecondsLeft !== null) && (
        <div className="rounded-lg border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
          {statusDetail}
          {ticketSecondsLeft !== null && state === "connecting" ? ` ${ticketSecondsLeft > 0 ? `(${ticketSecondsLeft}s bridge ticket window left)` : "(bridge ticket window expired; reconnect to retry)"}` : ""}
        </div>
      )}
      <div className="overflow-hidden rounded-xl bg-black p-2">
        <div
          ref={hostRef}
          className={focusMode ? "h-[calc(100vh-235px)] min-h-[420px] w-full transition-[height] duration-300 ease-in-out" : "h-[420px] min-h-[280px] w-full transition-[height] duration-300 ease-in-out"}
          aria-label={`Interactive terminal for ${machineLabel}`}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">
        This is one persistent shell session: directories, environment changes, interactive programs, Ctrl+C, and command history remain in the same terminal until you disconnect or the VM ends. Approved AI Practitioner commands run here visibly and their real terminal output is sent back for explanation.
      </p>
    </div>
  );
}
