'use client';

import * as React from 'react';
import { CircleDot, Loader2, RefreshCw, Unplug } from 'lucide-react';
import type { Terminal as XTermTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SsmBrowserDataChannel } from '@/lib/labs/ssm-browser-channel';
import { getCsrfToken } from '@/lib/security/csrf-client';
import {
  OPERATION_AI_TERMINAL_QUERY_EVENT,
  OPERATION_AI_TERMINAL_RESULT_EVENT,
  OPERATION_AI_TERMINAL_RUN_EVENT,
  OPERATION_AI_TERMINAL_STATE_EVENT,
  type OperationAiTerminalRunRequest,
  type OperationAiTerminalRunResult,
  type OperationAiTerminalState,
} from '@/lib/operations/ai-terminal-events';
import {
  persistOperationTerminalExecution,
  prepareOperationTerminalExecution,
  type PreparedOperationTerminalExecution,
} from '@/lib/operations/terminal-execution-client';

type State = 'connecting' | 'connected' | 'disconnected' | 'error';
type SessionResponse = { sessionId: string; bridgePath: string; tokenValue: string };
type ActiveAiRun = {
  request: OperationAiTerminalRunRequest;
  receipt: PreparedOperationTerminalExecution;
  startMarker: string;
  endMarkerBase: string;
  buffer: string;
  started: boolean;
  finalizing: boolean;
  timeout: ReturnType<typeof setTimeout> | null;
};

function bridgeWebSocketUrl(path: string) {
  const url = new URL(path, window.location.origin);
  url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function utf8Base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}

function cleanTerminalEvidence(value: string) {
  return value
    .replace(/\x1B(?:[@-_][0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g, '')
    .replace(/\r/g, '')
    .trim();
}

function isWindows(osFamily: string) {
  return osFamily.toLowerCase().includes('windows');
}

function executionLine(osFamily: string, markerId: string, command: string) {
  const commandBase64 = utf8Base64(command);
  const startMarker = `__OXSIG_AI_BEGIN_${markerId}__`;
  const endMarkerBase = `__OXSIG_AI_END_${markerId}__:`;
  if (isWindows(osFamily)) {
    return `$__oxsig_cmd=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${commandBase64}')); Write-Output '${startMarker}'; $global:LASTEXITCODE=$null; try { Invoke-Expression $__oxsig_cmd; $__oxsig_rc=if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } elseif ($?) { 0 } else { 1 } } catch { Write-Error $_; $__oxsig_rc=1 }; Write-Output ('${endMarkerBase}' + $__oxsig_rc)\r`;
  }
  return `__oxsig_id='${markerId}'; __oxsig_cmd="$(printf '%s' '${commandBase64}' | base64 -d)"; printf '\\n__OXSIG_AI_BEGIN_%s__\\n' "$__oxsig_id"; eval "$__oxsig_cmd"; __oxsig_rc=$?; printf '\\n__OXSIG_AI_END_%s__:%s\\n' "$__oxsig_id" "$__oxsig_rc"\r`;
}

export default function OperationNodeTerminal({
  runId,
  nodeId,
  machineLabel,
  osFamily,
}: {
  runId: string;
  nodeId: string;
  machineLabel: string;
  osFamily: string;
}) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const terminalRef = React.useRef<XTermTerminal | null>(null);
  const fitRef = React.useRef<FitAddon | null>(null);
  const channelRef = React.useRef<SsmBrowserDataChannel | null>(null);
  const sessionIdRef = React.useRef<string | null>(null);
  const csrfRef = React.useRef<string | null>(null);
  const generationRef = React.useRef(0);
  const retryRef = React.useRef(0);
  const retryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposedRef = React.useRef(false);
  const connectRef = React.useRef<(recovery?: boolean) => Promise<void>>(async () => undefined);
  const activeAiRunRef = React.useRef<ActiveAiRun | null>(null);
  const aiRunStartingRef = React.useRef(false);
  const outputDecoderRef = React.useRef(new TextDecoder());
  const [terminalReady, setTerminalReady] = React.useState(false);
  const [state, setState] = React.useState<State>('connecting');
  const [detail, setDetail] = React.useState('Preparing secure terminal access.');
  const [error, setError] = React.useState<string | null>(null);

  const endpoint = `/api/operations/runs/${encodeURIComponent(runId)}/nodes/${encodeURIComponent(nodeId)}/session`;

  const emitTerminalState = React.useCallback((connected: boolean) => {
    window.dispatchEvent(new CustomEvent<OperationAiTerminalState>(OPERATION_AI_TERMINAL_STATE_EVENT, {
      detail: { runId, nodeId, connected, sessionId: connected ? sessionIdRef.current : null },
    }));
  }, [nodeId, runId]);

  const clearRetry = React.useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }, []);

  const finishAiRun = React.useCallback((result: OperationAiTerminalRunResult) => {
    const active = activeAiRunRef.current;
    if (active?.timeout) clearTimeout(active.timeout);
    activeAiRunRef.current = null;
    window.dispatchEvent(new CustomEvent<OperationAiTerminalRunResult>(OPERATION_AI_TERMINAL_RESULT_EVENT, { detail: result }));
  }, []);

  const failActiveAiRun = React.useCallback((message: string) => {
    const active = activeAiRunRef.current;
    if (!active) return;
    finishAiRun({
      requestId: active.request.requestId,
      runId,
      nodeId,
      command: active.request.command,
      stdout: cleanTerminalEvidence(active.buffer),
      stderr: message,
      exitCode: -1,
      executionId: active.receipt.executionId,
      evidenceId: active.receipt.evidenceId,
      provenance: active.receipt.provenance,
      executionReceiptId: active.receipt.executionReceiptId,
      terminalSessionId: active.receipt.sessionId,
      surface: 'ai-practitioner',
      error: message,
    });
  }, [finishAiRun, nodeId, runId]);

  const persistAndFinishAiRun = React.useCallback(async (active: ActiveAiRun, stdout: string, stderr: string, exitCode: number) => {
    if (active.finalizing || activeAiRunRef.current !== active) return;
    active.finalizing = true;
    if (active.timeout) clearTimeout(active.timeout);
    active.timeout = null;
    try {
      const execution = await persistOperationTerminalExecution({
        runId,
        nodeId,
        receipt: active.receipt,
        command: active.request.command,
        stdout,
        stderr,
        exitCode,
      });
      setDetail(`AI Practitioner command completed with exit ${execution.exitCode}; session-bound evidence was recorded.`);
      finishAiRun({
        requestId: active.request.requestId,
        runId,
        nodeId,
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
      const message = persistError instanceof Error ? persistError.message : 'The command ran, but its Operation evidence could not be persisted.';
      setDetail(message);
      finishAiRun({
        requestId: active.request.requestId,
        runId,
        nodeId,
        command: active.request.command,
        stdout,
        stderr: stderr || message,
        exitCode,
        executionId: active.receipt.executionId,
        evidenceId: active.receipt.evidenceId,
        provenance: active.receipt.provenance,
        executionReceiptId: active.receipt.executionReceiptId,
        terminalSessionId: active.receipt.sessionId,
        surface: 'ai-practitioner',
        error: message,
      });
    }
  }, [finishAiRun, nodeId, runId]);

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
      active.buffer = active.buffer.slice(startIndex + active.startMarker.length).replace(/^[\r\n]+/, '');
    }
    if (active.finalizing) return;
    const endIndex = active.buffer.indexOf(active.endMarkerBase);
    if (endIndex < 0) return;
    const afterMarker = active.buffer.slice(endIndex + active.endMarkerBase.length);
    const exitMatch = afterMarker.match(/^(-?\d+)/);
    if (!exitMatch) return;
    const rawOutput = active.buffer.slice(0, endIndex).replace(/[\r\n]+$/, '');
    const remainder = afterMarker.slice(exitMatch[0].length).replace(/^[\r\n]+/, '');
    if (rawOutput) terminalRef.current?.write(`${rawOutput}\r\n`);
    if (remainder) terminalRef.current?.write(remainder);
    const exitCode = Number.parseInt(exitMatch[1], 10);
    setDetail(`AI Practitioner command completed with exit ${exitCode}; recording evidence…`);
    void persistAndFinishAiRun(active, cleanTerminalEvidence(rawOutput), '', Number.isFinite(exitCode) ? exitCode : -1);
  }, [persistAndFinishAiRun]);

  const endServerSession = React.useCallback(async (keepalive = false) => {
    const sessionId = sessionIdRef.current;
    const csrf = csrfRef.current;
    sessionIdRef.current = null;
    if (!sessionId || !csrf) return;
    try {
      await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ sessionId }),
        keepalive,
      });
    } catch {
      // The private bridge also closes its SSM session when the browser channel disappears.
    }
  }, [endpoint]);

  const closeChannel = React.useCallback(() => {
    channelRef.current?.close();
    channelRef.current = null;
  }, []);

  const connect = React.useCallback(async (recovery = false) => {
    if (!terminalRef.current || !fitRef.current || disposedRef.current) return;
    clearRetry();
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    aiRunStartingRef.current = false;
    failActiveAiRun('The Operation terminal changed before the approved command completed.');
    emitTerminalState(false);
    closeChannel();
    await endServerSession(false);
    if (generation !== generationRef.current || disposedRef.current) return;

    setState('connecting');
    setError(null);
    setDetail(recovery ? 'Recovering the secure terminal.' : 'Opening a secure terminal through Systems Manager.');
    terminalRef.current.writeln(`\r\n[${recovery ? 'Recovering' : 'Connecting'} ${machineLabel}…]`);

    try {
      const csrf = await getCsrfToken();
      if (generation !== generationRef.current || disposedRef.current) return;
      csrfRef.current = csrf;
      const response = await fetch(endpoint, { method: 'POST', headers: { 'x-csrf-token': csrf }, cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not start the Operation terminal');
      if (!body.sessionId || !body.bridgePath || !body.tokenValue) throw new Error('OXSIG did not return a complete terminal session');
      if (generation !== generationRef.current || disposedRef.current) {
        await fetch(endpoint, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
          body: JSON.stringify({ sessionId: body.sessionId }),
          keepalive: true,
        }).catch(() => undefined);
        return;
      }

      const session = body as SessionResponse;
      sessionIdRef.current = session.sessionId;
      const channel = new SsmBrowserDataChannel({
        onOutput: handleChannelOutput,
        onReady: (message) => {
          if (generation !== generationRef.current) return;
          retryRef.current = 0;
          setState('connected');
          setError(null);
          setDetail('Terminal ready. AI Practitioner follows this exact machine and session.');
          emitTerminalState(true);
          if (message) terminalRef.current?.writeln(`\r\n${message}`);
          requestAnimationFrame(() => {
            fitRef.current?.fit();
            const terminal = terminalRef.current;
            if (terminal) channelRef.current?.resize(terminal.cols, terminal.rows);
            terminal?.focus();
          });
        },
        onError: (message) => {
          if (generation !== generationRef.current) return;
          setError(message);
        },
        onClose: (reason) => {
          if (generation !== generationRef.current || disposedRef.current) return;
          failActiveAiRun('The Operation terminal disconnected before the approved command completed.');
          emitTerminalState(false);
          void endServerSession(true);
          const nextAttempt = retryRef.current + 1;
          if (nextAttempt <= 3) {
            retryRef.current = nextAttempt;
            const delay = [1000, 2500, 5000][nextAttempt - 1] ?? 5000;
            setState('connecting');
            setError(null);
            setDetail(`Terminal connection interrupted. Recovering automatically (${nextAttempt}/3)…`);
            retryTimerRef.current = setTimeout(() => void connectRef.current(true), delay);
          } else {
            setState('disconnected');
            setDetail(reason ? `Session closed: ${reason}` : 'Terminal session closed.');
          }
        },
      });
      channelRef.current = channel;
      channel.connect({ sessionId: session.sessionId, streamUrl: bridgeWebSocketUrl(session.bridgePath), tokenValue: session.tokenValue });
    } catch (connectError) {
      if (generation !== generationRef.current || disposedRef.current) return;
      emitTerminalState(false);
      await endServerSession(false);
      const message = connectError instanceof Error ? connectError.message : 'Operation terminal connection failed';
      const nextAttempt = retryRef.current + 1;
      if (nextAttempt <= 3) {
        retryRef.current = nextAttempt;
        setState('connecting');
        setError(null);
        setDetail(`${message} Retrying automatically (${nextAttempt}/3)…`);
        const delay = [1500, 3000, 5000][nextAttempt - 1] ?? 5000;
        retryTimerRef.current = setTimeout(() => void connectRef.current(true), delay);
      } else {
        setState('error');
        setError(message);
        setDetail('Automatic retries are exhausted. Use Reconnect to try again.');
      }
    }
  }, [clearRetry, closeChannel, emitTerminalState, endServerSession, endpoint, failActiveAiRun, handleChannelOutput, machineLabel]);

  React.useEffect(() => { connectRef.current = connect; }, [connect]);

  const disconnect = React.useCallback(async () => {
    generationRef.current += 1;
    clearRetry();
    retryRef.current = 0;
    aiRunStartingRef.current = false;
    failActiveAiRun('The Operation terminal disconnected before the approved command completed.');
    emitTerminalState(false);
    closeChannel();
    await endServerSession(false);
    setState('disconnected');
    setError(null);
    setDetail('Disconnected from the Operation terminal.');
  }, [clearRetry, closeChannel, emitTerminalState, endServerSession, failActiveAiRun]);

  React.useEffect(() => {
    const answerStateQuery = () => emitTerminalState(state === 'connected' && Boolean(channelRef.current?.isReady()));
    const emitRunError = (request: OperationAiTerminalRunRequest, message: string) => {
      window.dispatchEvent(new CustomEvent<OperationAiTerminalRunResult>(OPERATION_AI_TERMINAL_RESULT_EVENT, {
        detail: { requestId: request.requestId, runId, nodeId, command: request.command, stdout: '', stderr: message, exitCode: -1, surface: 'ai-practitioner', error: message },
      }));
    };
    const runApprovedCommand = (event: Event) => {
      const request = (event as CustomEvent<OperationAiTerminalRunRequest>).detail;
      if (!request || request.runId !== runId || request.nodeId !== nodeId || request.surface !== 'ai-practitioner') return;
      void (async () => {
        const channel = channelRef.current;
        const currentSessionId = sessionIdRef.current;
        if (state !== 'connected' || !channel?.isReady() || !currentSessionId) {
          emitRunError(request, 'Open and connect the selected Operation terminal before approving the command.');
          return;
        }
        if (activeAiRunRef.current || aiRunStartingRef.current) {
          emitRunError(request, 'Another approved AI command is already running in this Operation terminal.');
          return;
        }
        aiRunStartingRef.current = true;
        try {
          setDetail('Binding the approved AI command to this exact Operation terminal session…');
          const receipt = await prepareOperationTerminalExecution({ runId, nodeId, command: request.command, sessionId: currentSessionId });
          const liveChannel = channelRef.current;
          if (state !== 'connected' || !liveChannel?.isReady() || sessionIdRef.current !== currentSessionId || receipt.sessionId !== currentSessionId) {
            throw new Error('The Operation terminal session changed while the command was being bound. Approve it again on the current session.');
          }
          const markerId = receipt.executionReceiptId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80);
          const startMarker = `__OXSIG_AI_BEGIN_${markerId}__`;
          const endMarkerBase = `__OXSIG_AI_END_${markerId}__:`;
          terminalRef.current?.writeln(`\r\n[AI Practitioner command approved for ${machineLabel}] ${isWindows(osFamily) ? 'PS>' : '$'} ${request.command}`);
          setDetail('AI Practitioner command is running visibly in this machine’s active terminal…');
          const active: ActiveAiRun = { request, receipt, startMarker, endMarkerBase, buffer: '', started: false, finalizing: false, timeout: null };
          active.timeout = setTimeout(() => {
            if (activeAiRunRef.current !== active || active.finalizing) return;
            channelRef.current?.sendInput('\x03');
            terminalRef.current?.writeln('\r\n[AI Practitioner command timed out after 45 seconds]');
            setDetail('Command timed out; recording the browser-observed output against its bound receipt…');
            void persistAndFinishAiRun(active, cleanTerminalEvidence(active.buffer), 'The interactive command timed out or required further input.', -1);
          }, 45_000);
          activeAiRunRef.current = active;
          liveChannel.sendInput(executionLine(osFamily, markerId, request.command));
        } catch (runError) {
          const message = runError instanceof Error ? runError.message : 'Oxsig could not start the approved Operation command.';
          setDetail(message);
          emitRunError(request, message);
        } finally {
          aiRunStartingRef.current = false;
        }
      })();
    };
    window.addEventListener(OPERATION_AI_TERMINAL_QUERY_EVENT, answerStateQuery);
    window.addEventListener(OPERATION_AI_TERMINAL_RUN_EVENT, runApprovedCommand);
    return () => {
      window.removeEventListener(OPERATION_AI_TERMINAL_QUERY_EVENT, answerStateQuery);
      window.removeEventListener(OPERATION_AI_TERMINAL_RUN_EVENT, runApprovedCommand);
    };
  }, [emitTerminalState, machineLabel, nodeId, osFamily, persistAndFinishAiRun, runId, state]);

  React.useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let dataDisposable: { dispose(): void } | null = null;
    disposedRef.current = false;

    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]);
      if (disposed || !hostRef.current) return;
      const terminal = new Terminal({ cursorBlink: true, cursorStyle: 'block', fontSize: 13, scrollback: 5000, convertEol: false });
      const fit = new FitAddon();
      terminal.loadAddon(fit);
      terminal.open(hostRef.current);
      terminalRef.current = terminal;
      fitRef.current = fit;
      fit.fit();
      terminal.writeln(`OXSIG Operation terminal — ${machineLabel}`);
      terminal.writeln('Secure Session Manager shell. No inbound SSH/RDP port is exposed.\r\n');
      dataDisposable = terminal.onData((data) => {
        if ((activeAiRunRef.current || aiRunStartingRef.current) && data !== '\x03') return;
        channelRef.current?.sendInput(data);
      });
      resizeObserver = new ResizeObserver(() => requestAnimationFrame(() => {
        if (!terminalRef.current || !fitRef.current) return;
        fitRef.current.fit();
        channelRef.current?.resize(terminalRef.current.cols, terminalRef.current.rows);
      }));
      resizeObserver.observe(hostRef.current);
      setTerminalReady(true);
    })();

    return () => {
      disposed = true;
      disposedRef.current = true;
      setTerminalReady(false);
      resizeObserver?.disconnect();
      dataDisposable?.dispose();
      clearRetry();
      retryRef.current = 0;
      aiRunStartingRef.current = false;
      failActiveAiRun('The Operation terminal closed before the approved command completed.');
      emitTerminalState(false);
      generationRef.current += 1;
      closeChannel();
      void endServerSession(true);
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [clearRetry, closeChannel, emitTerminalState, endServerSession, failActiveAiRun, machineLabel]);

  React.useEffect(() => {
    if (!terminalReady) return;
    retryRef.current = 0;
    void connectRef.current(false);
  }, [terminalReady]);

  const status = state === 'connected' ? 'Connected' : state === 'connecting' ? 'Connecting' : state === 'error' ? 'Error' : 'Disconnected';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold">Interactive terminal — {machineLabel}</span>
          <Badge variant={state === 'connected' ? 'default' : 'outline'} className="text-[9px]">
            {state === 'connecting' ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CircleDot className="mr-1 h-3 w-3" />}{status}
          </Badge>
        </div>
        <div className="flex gap-2">
          {state !== 'connected' && <Button size="sm" variant="outline" disabled={state === 'connecting'} onClick={() => { retryRef.current = 0; void connectRef.current(false); }}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Reconnect</Button>}
          {(state === 'connected' || state === 'connecting') && <Button size="sm" variant="outline" onClick={() => void disconnect()}><Unplug className="mr-1.5 h-3.5 w-3.5" />Disconnect</Button>}
        </div>
      </div>
      <div className={`rounded-lg border px-3 py-2 text-[11px] ${error ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'bg-muted/20 text-muted-foreground'}`}>{error || detail}</div>
      <div ref={hostRef} className="min-h-[420px] overflow-hidden rounded-xl border bg-black p-2" />
      <p className="text-[10px] text-muted-foreground">Approved Practitioner commands are bound to this exact Operation run, machine, and live Session Manager shell before they execute. Their browser-observed output is persisted before AI explanation.</p>
    </div>
  );
}
