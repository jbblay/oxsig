'use client';

import * as React from 'react';
import { Loader2, PlugZap, TerminalSquare, Unplug } from 'lucide-react';
import type { Terminal as XTermTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SsmBrowserDataChannel } from '@/lib/labs/ssm-browser-channel';
import { getCsrfToken } from '@/lib/security/csrf-client';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';

type SessionResponse = {
  sessionId: string;
  bridgePath: string;
  tokenValue: string;
  leaseId: string;
  leaseExpiresAt: string;
  labInstanceId: string;
  bindingId: string;
};

type Props = {
  workspaceId: string;
  bindingId: string;
  labInstanceId: string;
  machineLabel: string;
  leaseExpiresAt: string;
  onAuthorizationChanged: () => Promise<void>;
};

function bridgeWebSocketUrl(path: string) {
  const url = new URL(path, window.location.origin);
  url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return body?.error || fallback;
}

export function SharedWorkspaceTerminal({
  workspaceId,
  bindingId,
  labInstanceId,
  machineLabel,
  leaseExpiresAt,
  onAuthorizationChanged,
}: Props) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const terminalRef = React.useRef<XTermTerminal | null>(null);
  const fitRef = React.useRef<FitAddon | null>(null);
  const channelRef = React.useRef<SsmBrowserDataChannel | null>(null);
  const sessionRef = React.useRef<SessionResponse | null>(null);
  const csrfRef = React.useRef<string | null>(null);
  const inputBufferRef = React.useRef('');
  const inputTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = React.useRef(false);
  const [terminalReady, setTerminalReady] = React.useState(false);
  const [state, setState] = React.useState<ConnectionState>('idle');
  const [detail, setDetail] = React.useState('An active terminal lease authorizes you to open this shared shell.');

  const flushInput = React.useCallback(() => {
    if (inputTimerRef.current) clearTimeout(inputTimerRef.current);
    inputTimerRef.current = null;
    const value = inputBufferRef.current;
    inputBufferRef.current = '';
    if (value) channelRef.current?.sendInput(value);
  }, []);

  const endServerSession = React.useCallback(async () => {
    const session = sessionRef.current;
    const csrf = csrfRef.current;
    sessionRef.current = null;
    if (!session || !csrf) return;
    try {
      await fetch(`/api/live-workspaces/${workspaceId}/terminal/session`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({
          bindingId: session.bindingId,
          labInstanceId: session.labInstanceId,
          leaseId: session.leaseId,
          sessionId: session.sessionId,
        }),
        keepalive: true,
      });
    } catch {
      // The bridge also closes the underlying shared SSM session on disconnect.
    }
  }, [workspaceId]);

  const disconnect = React.useCallback(async (message = '[Shared terminal disconnected]') => {
    intentionalCloseRef.current = true;
    flushInput();
    channelRef.current?.close();
    channelRef.current = null;
    await endServerSession();
    setState('closed');
    setDetail('Shared terminal disconnected. The control lease remains separate and can still be revoked or expire.');
    terminalRef.current?.writeln(`\r\n${message}\r\n`);
    intentionalCloseRef.current = false;
  }, [endServerSession, flushInput]);

  const connect = React.useCallback(async () => {
    if (!terminalRef.current || !terminalReady || state === 'connecting' || state === 'connected') return;
    intentionalCloseRef.current = true;
    flushInput();
    channelRef.current?.close();
    channelRef.current = null;
    await endServerSession();
    intentionalCloseRef.current = false;

    setState('connecting');
    setDetail('Validating the active control lease and opening an AWS Systems Manager shell…');
    terminalRef.current.writeln(`\r\n[Validating Live Workspace terminal control for ${machineLabel}…]`);

    try {
      const csrf = await getCsrfToken();
      csrfRef.current = csrf;
      const response = await fetch(`/api/live-workspaces/${workspaceId}/terminal/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ bindingId }),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(await responseError(response, 'Could not start the shared terminal'));
      const session = await response.json() as SessionResponse;
      if (
        !session.sessionId || !session.bridgePath || !session.tokenValue ||
        !session.leaseId || session.bindingId !== bindingId || session.labInstanceId !== labInstanceId
      ) {
        throw new Error('OXSIG returned an incomplete or mismatched shared terminal session.');
      }
      sessionRef.current = session;

      const channel = new SsmBrowserDataChannel({
        onOutput: (data) => terminalRef.current?.write(data),
        onReady: (customerMessage) => {
          setState('connected');
          setDetail('Connected. Every shared input frame is revalidated against the active control lease before AWS receives it.');
          if (customerMessage) terminalRef.current?.writeln(`\r\n${customerMessage}`);
          requestAnimationFrame(() => {
            fitRef.current?.fit();
            const terminal = terminalRef.current;
            if (terminal) channelRef.current?.resize(terminal.cols, terminal.rows);
            terminal?.focus();
          });
        },
        onError: (message) => {
          setState('error');
          setDetail(message);
          terminalRef.current?.writeln(`\r\n[Shared terminal error: ${message}]\r\n`);
          void endServerSession();
        },
        onClose: (reason) => {
          if (intentionalCloseRef.current) return;
          setState('closed');
          setDetail(reason || 'The shared terminal transport closed. If the lease was revoked or expired, request control again.');
          terminalRef.current?.writeln(`\r\n[Shared terminal closed${reason ? `: ${reason}` : ''}]\r\n`);
          sessionRef.current = null;
          void onAuthorizationChanged();
        },
      });
      channelRef.current = channel;
      channel.connect({
        sessionId: session.sessionId,
        streamUrl: bridgeWebSocketUrl(session.bridgePath),
        tokenValue: session.tokenValue,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start the shared terminal.';
      setState('error');
      setDetail(message);
      terminalRef.current?.writeln(`\r\n[Shared terminal error: ${message}]\r\n`);
      await endServerSession();
      void onAuthorizationChanged();
    }
  }, [bindingId, endServerSession, flushInput, labInstanceId, machineLabel, onAuthorizationChanged, state, terminalReady, workspaceId]);

  React.useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let dataDisposable: { dispose(): void } | null = null;

    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ]);
      if (disposed || !hostRef.current) return;
      const terminal = new Terminal({
        cursorBlink: true,
        cursorStyle: 'block',
        fontSize: 13,
        scrollback: 3000,
        convertEol: false,
      });
      const fit = new FitAddon();
      terminal.loadAddon(fit);
      terminal.open(hostRef.current);
      terminalRef.current = terminal;
      fitRef.current = fit;
      fit.fit();
      terminal.writeln(`OXSIG shared terminal — ${machineLabel}`);
      terminal.writeln('Input is allowed only while your Live Workspace terminal lease remains active.\r\n');

      dataDisposable = terminal.onData((data) => {
        if (!channelRef.current?.isReady()) return;
        if (data === '\r' || data === '\n' || data === '\x03' || data === '\x04') {
          flushInput();
          channelRef.current.sendInput(data);
          return;
        }
        inputBufferRef.current += data;
        if (!inputTimerRef.current) {
          inputTimerRef.current = setTimeout(flushInput, 18);
        }
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
      dataDisposable?.dispose();
      resizeObserver?.disconnect();
      flushInput();
      channelRef.current?.close();
      channelRef.current = null;
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitRef.current = null;
      setTerminalReady(false);
      void endServerSession();
    };
  }, [endServerSession, flushInput, machineLabel]);

  React.useEffect(() => {
    const expires = new Date(leaseExpiresAt).getTime();
    const remaining = expires - Date.now();
    if (remaining <= 0) {
      if (state === 'connected' || state === 'connecting') void disconnect('[Control lease expired; shared terminal closed]');
      return;
    }
    const timer = window.setTimeout(() => {
      if (state === 'connected' || state === 'connecting') void disconnect('[Control lease expired; shared terminal closed]');
      void onAuthorizationChanged();
    }, remaining + 250);
    return () => window.clearTimeout(timer);
  }, [disconnect, leaseExpiresAt, onAuthorizationChanged, state]);

  const connected = state === 'connected';

  return (
    <div className="mt-3 overflow-hidden rounded-xl border bg-black/95">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2 text-white">
        <div className="flex items-center gap-2 text-xs font-medium">
          <TerminalSquare className="h-4 w-4" />
          Shared terminal transport
          <Badge variant="outline" className="border-white/20 text-[10px] text-white">{state}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {!connected ? (
            <Button size="sm" variant="secondary" onClick={() => void connect()} disabled={!terminalReady || state === 'connecting'}>
              {state === 'connecting' ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlugZap className="h-3 w-3" />}
              Open terminal
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => void disconnect()}>
              <Unplug className="h-3 w-3" /> Disconnect
            </Button>
          )}
        </div>
      </div>
      <div ref={hostRef} className="h-[340px] w-full p-2" />
      <p className="border-t border-white/10 px-3 py-2 text-[11px] leading-5 text-white/60">{detail}</p>
    </div>
  );
}
