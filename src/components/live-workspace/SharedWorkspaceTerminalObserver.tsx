'use client';

import * as React from 'react';
import { Circle, Eye, TerminalSquare } from 'lucide-react';
import type { Terminal as XTermTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { Badge } from '@/components/ui/badge';
import {
  base64ToBytes,
  LiveTerminalOutputObserver,
  type LiveTerminalRealtimeState,
} from '@/lib/live-workspace/terminal-realtime-client';

type Props = {
  workspaceId: string;
  bindingId: string;
  machineLabel: string;
  controllerName: string;
  leaseId: string;
  leaseExpiresAt: string;
  onAuthorizationChanged: () => Promise<void>;
};

function stateLabel(state: LiveTerminalRealtimeState) {
  if (state === 'connecting') return 'Joining';
  if (state === 'connected') return 'Live';
  if (state === 'disconnected') return 'Reconnecting';
  return 'Unavailable';
}

export function SharedWorkspaceTerminalObserver({
  workspaceId,
  bindingId,
  machineLabel,
  controllerName,
  leaseId,
  leaseExpiresAt,
  onAuthorizationChanged,
}: Props) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const terminalRef = React.useRef<XTermTerminal | null>(null);
  const fitRef = React.useRef<FitAddon | null>(null);
  const observerRef = React.useRef<LiveTerminalOutputObserver | null>(null);
  const [terminalReady, setTerminalReady] = React.useState(false);
  const [state, setState] = React.useState<LiveTerminalRealtimeState>('connecting');

  React.useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ]);
      if (disposed || !hostRef.current) return;
      const terminal = new Terminal({
        cursorBlink: false,
        cursorStyle: 'block',
        disableStdin: true,
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
      terminal.writeln(`OXSIG observer terminal — ${machineLabel}`);
      terminal.writeln(`Watching ${controllerName}. This view is read-only.\r\n`);

      resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          if (!terminalRef.current || !fitRef.current) return;
          fitRef.current.fit();
        });
      });
      resizeObserver.observe(hostRef.current);
      setTerminalReady(true);
    })();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitRef.current = null;
      setTerminalReady(false);
    };
  }, [controllerName, machineLabel]);

  React.useEffect(() => {
    if (!terminalReady) return;
    const observer = new LiveTerminalOutputObserver(
      { workspaceId, bindingId, leaseId },
      (packet) => {
        try {
          terminalRef.current?.write(base64ToBytes(packet.data));
        } catch {
          // Ignore an invalid realtime payload; authorization remains unchanged.
        }
      },
      setState
    );
    observerRef.current = observer;
    void observer.connect();
    return () => {
      observer.close();
      if (observerRef.current === observer) observerRef.current = null;
    };
  }, [bindingId, leaseId, terminalReady, workspaceId]);

  React.useEffect(() => {
    const remaining = new Date(leaseExpiresAt).getTime() - Date.now();
    if (remaining <= 0) {
      void onAuthorizationChanged();
      return;
    }
    const timer = window.setTimeout(() => void onAuthorizationChanged(), remaining + 250);
    return () => window.clearTimeout(timer);
  }, [leaseExpiresAt, onAuthorizationChanged]);

  return (
    <div className="mt-3 overflow-hidden rounded-xl border bg-black/95">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5 text-white">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
            <TerminalSquare className="h-4 w-4" />
            <span className="truncate">{machineLabel}</span>
            <Badge variant="outline" className="gap-1 border-white/20 text-[10px] text-white">
              <Circle className={`h-2 w-2 ${state === 'connected' ? 'fill-current' : ''}`} />{stateLabel(state)}
            </Badge>
          </div>
          <p className="mt-1 flex items-center gap-1 text-[10px] text-white/55"><Eye className="h-3 w-3" /> Read-only · controller {controllerName}</p>
        </div>
      </div>
      <div ref={hostRef} className="h-[300px] w-full p-2 sm:h-[360px] lg:h-[420px]" />
      <p aria-live="polite" className="border-t border-white/10 px-3 py-2 text-[11px] leading-5 text-white/60">
        {state === 'disabled'
          ? 'Live observation is unavailable. The realtime provider may not be configured or this lease is no longer authorized.'
          : 'Output is mirrored from the active controller. This terminal has no input channel.'}
      </p>
    </div>
  );
}
