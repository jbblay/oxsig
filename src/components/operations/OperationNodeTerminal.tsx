'use client';

import * as React from 'react';
import { CircleDot, Loader2, RefreshCw, Unplug } from 'lucide-react';
import type { Terminal as XTermTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SsmBrowserDataChannel } from '@/lib/labs/ssm-browser-channel';
import { getCsrfToken } from '@/lib/security/csrf-client';

type State = 'connecting' | 'connected' | 'disconnected' | 'error';
type SessionResponse = { sessionId: string; bridgePath: string; tokenValue: string };

function bridgeWebSocketUrl(path: string) {
  const url = new URL(path, window.location.origin);
  url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export default function OperationNodeTerminal({ runId, nodeId, machineLabel }: { runId: string; nodeId: string; machineLabel: string }) {
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
  const [terminalReady, setTerminalReady] = React.useState(false);
  const [state, setState] = React.useState<State>('connecting');
  const [detail, setDetail] = React.useState('Preparing secure terminal access.');
  const [error, setError] = React.useState<string | null>(null);

  const endpoint = `/api/operations/runs/${encodeURIComponent(runId)}/nodes/${encodeURIComponent(nodeId)}/session`;

  const clearRetry = React.useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }, []);

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
      if (generation !== generationRef.current || disposedRef.current) return;

      const session = body as SessionResponse;
      sessionIdRef.current = session.sessionId;
      const channel = new SsmBrowserDataChannel({
        onOutput: (data) => terminalRef.current?.write(data),
        onReady: (message) => {
          if (generation !== generationRef.current) return;
          retryRef.current = 0;
          setState('connected');
          setError(null);
          setDetail('Terminal ready. Input is connected directly to this Operation machine.');
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
          void endServerSession(true);
          const nextAttempt = retryRef.current + 1;
          if (nextAttempt <= 3) {
            retryRef.current = nextAttempt;
            const delay = [1000, 2500, 5000][nextAttempt - 1];
            setState('connecting');
            setError(null);
            setDetail(`Terminal connection interrupted. Recovering automatically (${nextAttempt}/3)…`);
            retryTimerRef.current = setTimeout(() => void connect(true), delay);
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
      await endServerSession(false);
      const message = connectError instanceof Error ? connectError.message : 'Operation terminal connection failed';
      const nextAttempt = retryRef.current + 1;
      if (nextAttempt <= 3) {
        retryRef.current = nextAttempt;
        setState('connecting');
        setError(null);
        setDetail(`${message} Retrying automatically (${nextAttempt}/3)…`);
        retryTimerRef.current = setTimeout(() => void connect(true), [1500, 3000, 5000][nextAttempt - 1]);
      } else {
        setState('error');
        setError(message);
        setDetail('Automatic retries are exhausted. Use Reconnect to try again.');
      }
    }
  }, [clearRetry, closeChannel, endServerSession, endpoint, machineLabel]);

  const disconnect = React.useCallback(async () => {
    generationRef.current += 1;
    clearRetry();
    retryRef.current = 0;
    closeChannel();
    await endServerSession(false);
    setState('disconnected');
    setError(null);
    setDetail('Disconnected from the Operation terminal.');
  }, [clearRetry, closeChannel, endServerSession]);

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
      dataDisposable = terminal.onData((data) => channelRef.current?.sendInput(data));
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
      generationRef.current += 1;
      closeChannel();
      void endServerSession(true);
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [clearRetry, closeChannel, endServerSession, machineLabel]);

  React.useEffect(() => {
    if (!terminalReady) return;
    retryRef.current = 0;
    void connect(false);
  }, [connect, terminalReady]);

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
          {state !== 'connected' && <Button size="sm" variant="outline" disabled={state === 'connecting'} onClick={() => { retryRef.current = 0; void connect(false); }}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Reconnect</Button>}
          {(state === 'connected' || state === 'connecting') && <Button size="sm" variant="outline" onClick={() => void disconnect()}><Unplug className="mr-1.5 h-3.5 w-3.5" />Disconnect</Button>}
        </div>
      </div>
      <div className={`rounded-lg border px-3 py-2 text-[11px] ${error ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'bg-muted/20 text-muted-foreground'}`}>{error || detail}</div>
      <div ref={hostRef} className="min-h-[420px] overflow-hidden rounded-xl border bg-black p-2" />
    </div>
  );
}
