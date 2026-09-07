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
import {
  persistTerminalExecution,
  prepareTerminalExecution,
  type PreparedTerminalExecution,
} from "@/lib/labs/terminal-execution-client";
import { getCsrfToken } from "@/lib/security/csrf-client";

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

const MAX_AUTO_RECONNECT_ATTEMPTS = 3;
const AUTO_RECONNECT_DELAYS_MS = [1000, 2500, 5000] as const;

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
  receipt: PreparedTerminalExecution;
  startMarker: string;
  endMarkerBase: string;
  buffer: string;
  started: boolean;
  finalizing: boolean;
  timeout: ReturnType<typeof setTimeout> | null;
};

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

function runLabel(surface: AiTerminalRunRequest["surface"]) {
  return surface === "academy" ? "Academy checkpoint" : "AI Practitioner command";
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
  const reconnectTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = React.useRef(0);
  const connectRef = React.useRef<(recovery?: boolean) => Promise<void>>(async () => undefined);
  const activeAiRunRef = React.useRef<ActiveAiRun | null>(null);
  const aiRunStartingRef = React.useRef(false);
  const outputDecoderRef = React.useRef(new TextDecoder());
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

  const clearReconnectTimer = React.useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }, []);

  const emitTerminalState = React.useCallback((connected: boolean) => {
    window.dispatchEvent(new CustomEvent<AiTerminalState>(AI_TERMINAL_STATE_EVENT, {
      detail: {
        labInstanceId,
        connected,
        sessionId: connected ? sessionIdRef.current : null,
      },
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
      executionId: active.receipt.executionId,
      evidenceId: active.receipt.evidenceId,
      provenance: active.receipt.provenance,
      executionReceiptId: active.receipt.executionReceiptId,
      terminalSessionId: active.receipt.sessionId,
      surface: active.receipt.surface,
      error: message,
    });
  }, [finishAiRun, labInstanceId]);

  const persistAndFinishAiRun = React.useCallback(async (
    active: ActiveAiRun,
    stdout: string,
    stderr: string,
    exitCode: number
  ) => {
    if (active.finalizing || activeAiRunRef.current !== active) return;
    active.finalizing = true;
    if (active.timeout) clearTimeout(active.timeout);
    active.timeout = null;

    try {
      const execution = await persistTerminalExecution({
        labInstanceId,
        receipt: active.receipt,
        command: active.request.command,
        stdout,
        stderr,
        exitCode,
      });
      setStatusDetail(`${runLabel(active.request.surface)} completed and its session-bound browser evidence was recorded.`);
      finishAiRun({
        requestId: active.request.requestId,
        labInstanceId,
        command: execution.command,
        stdout: execution.stdout,
        stderr: execution.stderr,
        exitCode: execution.exitCode,
        executionId: execution.executionId,
        evidenceId: execution.evidenceId,
        provenance: execution.provenance,
        executionReceiptId: execution.executionReceiptId,
        terminalSessionId: execution.terminalSessionId,
        surface: execution.surface,
        risk: execution.risk,
      });
    } catch (persistError) {
      const message = persistError instanceof Error
        ? persistError.message
        : "The visible command ran, but OXSIG could not persist its bound evidence.";
      setStatusDetail(message);
      finishAiRun({
        requestId: active.request.requestId,
        labInstanceId,
        command: active.request.command,
        stdout,
        stderr: stderr || message,
        exitCode,
        executionId: active.receipt.executionId,
        evidenceId: active.receipt.evidenceId,
        provenance: active.receipt.provenance,
        executionReceiptId: active.receipt.executionReceiptId,
        terminalSessionId: active.receipt.sessionId,
        surface: active.receipt.surface,
        error: message,
      });
    }
  }, [finishAiRun, labInstanceId]);

  const handleChannelOutput = React.useCallback((data: Uint8Array) => {
    const active = activeAiRunRef.current;
    if (!active) {
      terminalRef.current?.write(data);
      return;
    }

    const text = outputDecoderRef.current.decode(data, { stream: true });
    active.buffer += text;

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

    if (active.finalizing) return;
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
    setStatusDetail(`${runLabel(active.request.surface)} completed in the visible terminal with exit ${exitCode}; recording bound evidence…`);
    void persistAndFinishAiRun(active, cleanTerminalEvidence(rawOutput), "", Number.isFinite(exitCode) ? exitCode : -1);
  }, [persistAndFinishAiRun]);

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
      // The managed transport also closes the remote session when the data channel disappears.
    }
  }, [labInstanceId]);

  const scheduleRecovery = React.useCallback((generation: number, reason?: string) => {
    if (generation !== generationRef.current || intentionalCloseRef.current) return false;
    const attempt = reconnectAttemptRef.current + 1;
    if (attempt > MAX_AUTO_RECONNECT_ATTEMPTS) return false;

    reconnectAttemptRef.current = attempt;
    const delay = AUTO_RECONNECT_DELAYS_MS[Math.min(attempt - 1, AUTO_RECONNECT_DELAYS_MS.length - 1)];
    clearReconnectTimer();
    setState("connecting");
    setError(null);
    setBridgeTicketExpiresAt(null);
    setStatusDetail(`Terminal connection interrupted${reason ? `: ${reason}` : ""}. Recovering automatically (${attempt}/${MAX_AUTO_RECONNECT_ATTEMPTS})…`);
    emitTerminalState(false);
    terminalRef.current?.writeln(`\r\n[Terminal connection interrupted. Automatic recovery ${attempt}/${MAX_AUTO_RECONNECT_ATTEMPTS} in ${Math.ceil(delay / 1000)}s…]\r\n`);

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (generation !== generationRef.current || intentionalCloseRef.current) return;
      void connectRef.current(true);
    }, delay);
    return true;
  }, [clearReconnectTimer, emitTerminalState]);

  const disconnect = React.useCallback(async (writeMessage = true) => {
    generationRef.current += 1;
    intentionalCloseRef.current = true;
    reconnectAttemptRef.current = 0;
    aiRunStartingRef.current = false;
    clearHandshakeTimer();
    clearReconnectTimer();
    failActiveAiRun("The interactive terminal disconnected before the approved command completed.");
    channelRef.current?.close();
    channelRef.current = null;
    await endServerSession(false);
    setState("disconnected");
    setError(null);
    setStatusDetail("Disconnected from the persistent lab terminal.");
    setBridgeTicketExpiresAt(null);
    emitTerminalState(false);
    if (writeMessage) terminalRef.current?.writeln("\r\n[OXSIG terminal disconnected]\r\n");
    intentionalCloseRef.current = false;
  }, [clearHandshakeTimer, clearReconnectTimer, emitTerminalState, endServerSession, failActiveAiRun]);

  const connect = React.useCallback(async (recovery = false) => {
    if (!terminalRef.current || !fitRef.current) return;
    if (!recovery) reconnectAttemptRef.current = 0;
    clearReconnectTimer();
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    intentionalCloseRef.current = true;
    aiRunStartingRef.current = false;
    clearHandshakeTimer();
    failActiveAiRun("The terminal reconnected before the approved command completed.");
    channelRef.current?.close();
    channelRef.current = null;
    await endServerSession(false);
    intentionalCloseRef.current = false;

    setState("connecting");
    setError(null);
    setStatusDetail(recovery ? "Recovering the persistent lab terminal." : "Requesting a persistent lab terminal.");
    setBridgeTicketExpiresAt(null);
    emitTerminalState(false);
    const terminal = terminalRef.current;
    terminal.writeln(`\r\n[${recovery ? "Recovering" : "Connecting"} ${machineLabel} terminal…]`);

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
      if (!response.ok) throw new Error(body.error || "Could not start the interactive terminal");
      if (!body.sessionId || !body.bridgePath || !body.tokenValue) throw new Error("OXSIG did not return a complete terminal session");
      if (generation !== generationRef.current) return;

      const session = body as SessionResponse;
      sessionIdRef.current = session.sessionId;
      setSessionId(session.sessionId);
      setBridgeTicketExpiresAt(session.bridgeTicketExpiresAt || null);
      if (session.bridgeTicketTtlMs) setStatusDetail(`Session created. Secure connection ticket valid for about ${Math.max(1, Math.ceil(session.bridgeTicketTtlMs / 1000))}s while connecting.`);

      const channel = new SsmBrowserDataChannel({
        onOutput: handleChannelOutput,
        onReady: (customerMessage) => {
          if (generation !== generationRef.current) return;
          clearHandshakeTimer();
          reconnectAttemptRef.current = 0;
          setState("connected");
          setError(null);
          setBridgeTicketExpiresAt(null);
          setStatusDetail(recovery ? "Terminal connection recovered with a fresh shell." : "Connected to the persistent shell session.");
          emitTerminalState(true);
          if (recovery) terminalRef.current?.writeln("\r\n[Terminal connection recovered. A fresh shell is active.]\r\n");
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
          aiRunStartingRef.current = false;
          failActiveAiRun(message);
          setState("error");
          setError(message);
          setStatusDetail("Connection failed before the interactive shell became ready.");
          setBridgeTicketExpiresAt(null);
          emitTerminalState(false);
          terminalRef.current?.writeln(`\r\n[OXSIG terminal error: ${message}]\r\n`);
          void endServerSession(true);
        },
        onClose: (reason) => {
          if (generation !== generationRef.current || intentionalCloseRef.current) return;
          clearHandshakeTimer();
          aiRunStartingRef.current = false;
          failActiveAiRun(reason || "The terminal session closed before the approved command completed.");
          setBridgeTicketExpiresAt(null);
          emitTerminalState(false);
          void endServerSession(true).finally(() => {
            if (scheduleRecovery(generation, reason)) return;
            setState("disconnected");
            setStatusDetail(reason ? `Session closed: ${reason}` : "Session closed.");
            if (reason) terminalRef.current?.writeln(`\r\n[Session closed: ${reason}]\r\n`);
          });
        },
      });
      channelRef.current = channel;
      channel.connect({ sessionId: session.sessionId, streamUrl: bridgeWebSocketUrl(session.bridgePath), tokenValue: session.tokenValue });

      handshakeTimerRef.current = setTimeout(() => {
        if (generation !== generationRef.current || channel.isReady()) return;
        setState("error");
        setError("The secure terminal connection opened, but the interactive shell handshake did not finish in time.");
        setStatusDetail("The terminal transport was accepted, but the shell handshake timed out.");
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
      setError(message);
      setBridgeTicketExpiresAt(null);
      emitTerminalState(false);
      terminal.writeln(`\r\n[OXSIG terminal error: ${message}]\r\n`);
      await endServerSession(false);
      if (!scheduleRecovery(generation, message)) {
        setState("error");
        setStatusDetail("Connection attempt failed. Automatic recovery attempts are exhausted; reconnect manually to retry.");
      }
    }
  }, [clearHandshakeTimer, clearReconnectTimer, emitTerminalState, endServerSession, failActiveAiRun, handleChannelOutput, labInstanceId, machineLabel, scheduleRecovery]);

  React.useEffect(() => { connectRef.current = connect; }, [connect]);

  React.useEffect(() => {
    const answerStateQuery = () => emitTerminalState(state === "connected" && Boolean(channelRef.current?.isReady()));

    const emitRunError = (request: AiTerminalRunRequest, message: string) => {
      window.dispatchEvent(new CustomEvent<AiTerminalRunResult>(AI_TERMINAL_RESULT_EVENT, {
        detail: { requestId: request.requestId, labInstanceId, command: request.command, stdout: "", stderr: message, exitCode: -1, surface: request.surface, error: message },
      }));
    };

    const runApprovedCommand = (event: Event) => {
      const request = (event as CustomEvent<AiTerminalRunRequest>).detail;
      if (!request || request.labInstanceId !== labInstanceId) return;
      if (request.surface !== "ai-practitioner" && request.surface !== "academy") return;

      void (async () => {
        const channel = channelRef.current;
        const currentSessionId = sessionIdRef.current;
        if (state !== "connected" || !channel?.isReady() || !currentSessionId) {
          emitRunError(request, "Open and connect the interactive terminal before approving a learning command.");
          return;
        }
        if (activeAiRunRef.current || aiRunStartingRef.current) {
          emitRunError(request, "Another approved command is already running in this terminal.");
          return;
        }

        aiRunStartingRef.current = true;
        try {
          setStatusDetail(`Binding ${runLabel(request.surface).toLowerCase()} to the active terminal session…`);
          const receipt = await prepareTerminalExecution({ labInstanceId, surface: request.surface, command: request.command, sessionId: currentSessionId });

          const liveChannel = channelRef.current;
          if (state !== "connected" || !liveChannel?.isReady() || sessionIdRef.current !== currentSessionId || receipt.sessionId !== currentSessionId) {
            throw new Error("The terminal session changed while OXSIG was binding the execution receipt. Approve the command again on the current session.");
          }

          const markerId = receipt.executionReceiptId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 80);
          const startMarker = `__OXSIG_AI_BEGIN_${markerId}__`;
          const endMarkerBase = `__OXSIG_AI_END_${markerId}__:`;
          const commandBase64 = utf8Base64(request.command);
          const label = runLabel(request.surface);

          terminalRef.current?.writeln(`\r\n[${label} approved] $ ${request.command}`);
          setStatusDetail(`${label} is running visibly in the active terminal session…`);

          const active: ActiveAiRun = { request, receipt, startMarker, endMarkerBase, buffer: "", started: false, finalizing: false, timeout: null };
          active.timeout = setTimeout(() => {
            if (activeAiRunRef.current !== active || active.finalizing) return;
            channelRef.current?.sendInput("\x03");
            terminalRef.current?.writeln(`\r\n[${label} timed out after 45 seconds]`);
            setStatusDetail(`${label} timed out; recording the browser-observed output against its bound receipt…`);
            void persistAndFinishAiRun(active, cleanTerminalEvidence(active.buffer), "The interactive command timed out or required further input.", -1);
          }, 45_000);
          activeAiRunRef.current = active;

          const shellLine = `__oxsig_id='${markerId}'; __oxsig_cmd="$(printf '%s' '${commandBase64}' | base64 -d)"; printf '\\n__OXSIG_AI_BEGIN_%s__\\n' "$__oxsig_id"; eval "$__oxsig_cmd"; __oxsig_rc=$?; printf '\\n__OXSIG_AI_END_%s__:%s\\n' "$__oxsig_id" "$__oxsig_rc"\r`;
          liveChannel.sendInput(shellLine);
        } catch (runError) {
          const message = runError instanceof Error ? runError.message : "OXSIG could not start the approved terminal command.";
          emitRunError(request, message);
          setStatusDetail(message);
        } finally {
          aiRunStartingRef.current = false;
        }
      })();
    };

    window.addEventListener(AI_TERMINAL_QUERY_EVENT, answerStateQuery);
    window.addEventListener(AI_TERMINAL_RUN_EVENT, runApprovedCommand);
    return () => {
      window.removeEventListener(AI_TERMINAL_QUERY_EVENT, answerStateQuery);
      window.removeEventListener(AI_TERMINAL_RUN_EVENT, runApprovedCommand);
    };
  }, [emitTerminalState, labInstanceId, persistAndFinishAiRun, state]);

  React.useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let dataDisposable: { dispose(): void } | null = null;

    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
      if (disposed || !hostRef.current) return;

      const terminal = new Terminal({ cursorBlink: true, cursorStyle: "block", fontSize: 13, scrollback: 5000, convertEol: false });
      const fit = new FitAddon();
      terminal.loadAddon(fit);
      terminal.open(hostRef.current);
      terminalRef.current = terminal;
      fitRef.current = fit;
      fit.fit();
      terminal.writeln(`OXSIG interactive terminal — ${machineLabel}`);
      terminal.writeln("Persistent managed shell. No inbound SSH port is exposed to the learner.\r\n");

      dataDisposable = terminal.onData((data) => {
        if ((activeAiRunRef.current || aiRunStartingRef.current) && data !== "\x03") return;
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
      clearReconnectTimer();
      reconnectAttemptRef.current = 0;
      aiRunStartingRef.current = false;
      failActiveAiRun("The interactive terminal closed before the approved command completed.");
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
  }, [clearHandshakeTimer, clearReconnectTimer, emitTerminalState, endServerSession, failActiveAiRun, machineLabel]);

  React.useEffect(() => {
    if (!terminalReady) return;
    void connect();
  }, [connect, terminalReady]);

  const statusLabel = state === "connected" ? "Connected" : state === "connecting" ? "Connecting" : state === "error" ? "Error" : "Disconnected";
  const ticketSecondsLeft = bridgeTicketExpiresAt ? Math.max(0, Math.ceil((new Date(bridgeTicketExpiresAt).getTime() - nowMs) / 1000)) : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold">Interactive terminal — {machineLabel}</span>
          <Badge variant={state === "connected" ? "default" : "outline"} className="text-[9px]">{state === "connecting" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CircleDot className="mr-1 h-3 w-3" />}{statusLabel}</Badge>
          {sessionId && <span className="text-[10px] text-muted-foreground">Active session</span>}
        </div>
        <div className="flex gap-2">
          {state !== "connected" && <Button size="sm" variant="outline" onClick={() => void connect()} disabled={state === "connecting" || !terminalReady}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Reconnect</Button>}
          {(state === "connected" || state === "connecting") && <Button size="sm" variant="outline" onClick={() => void disconnect()}><Unplug className="mr-1.5 h-3.5 w-3.5" />Disconnect</Button>}
        </div>
      </div>

      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">{error}</div>}
      {(statusDetail || ticketSecondsLeft !== null) && <div className="rounded-lg border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">{statusDetail}{ticketSecondsLeft !== null && state === "connecting" ? ` ${ticketSecondsLeft > 0 ? `(${ticketSecondsLeft}s secure connection window left)` : "(connection window expired; reconnect to retry)"}` : ""}</div>}
      <div className="overflow-hidden rounded-xl bg-black p-2"><div ref={hostRef} className={focusMode ? "h-[calc(100vh-235px)] min-h-[420px] w-full transition-[height] duration-300 ease-in-out" : "h-[420px] min-h-[280px] w-full transition-[height] duration-300 ease-in-out"} aria-label={`Interactive terminal for ${machineLabel}`} /></div>
      <p className="text-[10px] text-muted-foreground">The shell stays persistent while its secure managed transport remains connected. If transport is interrupted, OXSIG makes up to three bounded recovery attempts using a fresh shell; shell-local state such as the working directory or exported variables can reset after recovery. Approved learning commands are bound to the exact active terminal session before they run visibly, and their browser-observed output is persisted against a one-time execution receipt before AI explanation or Academy evaluation.</p>
    </div>
  );
}
