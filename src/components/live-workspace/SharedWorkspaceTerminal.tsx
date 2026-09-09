'use client';

import * as React from 'react';
import { Circle, Loader2, PlugZap, TerminalSquare, Unplug } from 'lucide-react';
import type { Terminal as XTermTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SsmBrowserDataChannel } from '@/lib/labs/ssm-browser-channel';
import { LiveTerminalOutputPublisher } from '@/lib/live-workspace/terminal-realtime-client';
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
  leaseId: string;
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

function stateLabel(state: ConnectionState) {
  if (state === 'idle') return 'Ready';
  if (state === 'connecting') return 'Connecting';
  if (state === 'connected') return 'Connected';
  if (state === 'closed') return 'Disconnected';
  return 'Needs attention';
}

function leaseTime(expiresAt: string, now: number) {
  const seconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export function SharedWorkspaceTerminal({
  workspaceId,
  bindingId,
  labInstanceId,
  machineLabel,
  leaseId,
  leaseExpiresAt,
  onAuthorizationChanged,
}: Props) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const terminalRef = React.useRef<XTermTerminal | null>(null);
  const fitRef = React.useRef<FitAddon | null>(null);
  const channelRef = React.useRef<SsmBrowserDataChannel | null>(null);
  const publisherRef = React.useRef<LiveTerminalOutputPublisher | null>(null);
  const sessionRef = React.useRef<SessionResponse | null>(null);
  const csrfRef = React.useRef<string | null>(null);
  const inputBufferRef = React.useRef('');
  const inputTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = React.useRef(false);
  const [terminalReady, setTerminalReady] = React.useState(false);
  const [state, setState] = React.useState<ConnectionState>('idle');
  const [detail, setDetail] = React.useState('Ready to connect while your terminal control lease is active.');
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  React.useEffect(() => {
    const publisher = new LiveTerminalOutputPublisher({ workspaceId, bindingId, leaseId });
    publisherRef.current = publisher;
    return () => {
      publisher.close();
      if (publisherRef.current === publisher) publisherRef.current = null;
    };
  }, [bindingId, leaseId, workspaceId]);

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
    setDetail('Terminal disconnected. Your control lease remains active until you release it, it is revoked, or it expires.');
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
    setDetail('Checking your current control permission and connecting to the lab…');
    terminalRef.current.writeln(`\r\n[Connecting to ${machineLabel}…]`);

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
        session.leaseId !== leaseId || session.bindingId !== bindingId || session.labInstanceId !== labInstanceId
      ) {
        throw new Error('Oxsig returned an incomplete or mismatched shared terminal session.');
      }
      sessionRef.current = session;

      const channel = new SsmBrowserDataChannel({
        onOutput: (data, payloadType) => {
          terminalRef.current?.write(data);
          publisherRef.current?.publish(data, payloadType);
        },
        onReady: (customerMessage) => {
          setState('connected');
          setDetail('Connected. Authorized workspace participants can observe output; only your active control lease can send input.');
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
          terminalRef.current?.writeln(`\r\n[Terminal error: ${message}]\r\n`);
          void endServerSession();
        },
        onClose: (reason) => {
          if (intentionalCloseRef.current) return;
          setState('closed');
          setDetail(reason || 'The terminal connection closed. If your control lease is still active, you can reconnect.');
          terminalRef.current?.writeln(`\r\n[Terminal closed${reason ? `: ${reason}` : ''}]\r\n`);
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
      terminalRef.current?.writeln(`\r\n[Terminal error: ${message}]\r\n`);
      await endServerSession();
      void onAuthorizationChanged();
    }
  }, [bindingId, endServerSession, flushInput, labInstanceId, leaseId, machineLabel, onAuthorizationChanged, state, terminalReady, workspaceId]);

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
      terminal.writeln('Connect when you are ready. Input stops when your control permission ends.\r\n');

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
      if (state === 'connected' || state === 'connecting') void disconnect('[Control lease expired; terminal closed]');
      return;
    }
    const timer = window.setTimeout(() => {
      if (state === 'connected' || state === 'connecting') void disconnect('[Control lease expired; terminal closed]');
      void onAuthorizationChanged();
    }, remaining + 250);
    return () => window.clearTimeout(timer);
  }, [disconnect, leaseExpiresAt, onAuthorizationChanged, state]);

  const connected = state === 'connected';
  const reconnecting = state === 'closed' || state === 'error';

  return (
    <div className="mt-3 overflow-hidden rounded-xl border bg-black/95">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5 text-white">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
            <TerminalSquare className="h-4 w-4" />
            <span className="truncate">{machineLabel}</span>
            <Badge variant="outline" className="gap-1 border-white/20 text-[10px] text-white"><Circle className={`h-2 w-2 ${connected ? 'fill-current' : ''}`} />{stateLabel(state)}</Badge>
          </div>
          <p className="mt-1 text-[10px] text-white/55">Control lease · {leaseTime(leaseExpiresAt, now)} remaining</p>
        </div>
        <div className="flex items-center gap-2">
          {!connected ? (
            <Button size="sm" variant="secondary" onClick={() => void connect()} disabled={!terminalReady || state === 'connecting'}>
              {state === 'connecting' ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlugZap className="h-3 w-3" />}
              {state === 'connecting' ? 'Connecting…' : reconnecting ? 'Reconnect' : 'Connect terminal'}
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => void disconnect()}>
              <Unplug className="h-3 w-3" /> Disconnect
            </Button>
          )}
        </div>
      </div>
      <div ref={hostRef} className="h-[300px] w-full p-2 sm:h-[360px] lg:h-[420px]" />
      <p aria-live="polite" className="border-t border-white/10 px-3 py-2 text-[11px] leading-5 text-white/60">{detail}</p>
    </div>
  );
}
