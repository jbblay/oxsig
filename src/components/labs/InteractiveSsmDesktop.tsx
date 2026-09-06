"use client";

import * as React from "react";
import { CircleDot, Keyboard, Loader2, Monitor, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SsmBrowserPortChannel } from "@/lib/labs/ssm-port-browser-channel";
import { RfbClient } from "@/lib/labs/vnc-client";
import { getCsrfToken } from "@/lib/security/csrf-client";

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";
type AccessEvidenceState = "pending" | "recording" | "recorded" | "unavailable" | "error";

type DesktopSession = {
  sessionId: string;
  bridgePath: string;
  tokenValue: string;
  platform: "linux" | "windows";
  accessEvidence?:
    | {
        eligible: true;
        ticket: string;
        evidenceExecutionId: string;
        expiresAt: string;
        ttlMs: number;
        prerequisiteGuestEvidenceId: string;
      }
    | {
        eligible: false;
        reason: string;
      };
};

class DesktopRequestError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

function bridgeWebSocketUrl(path: string) {
  const url = new URL(path, window.location.origin);
  url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function rfbButtons(buttons: number) {
  let mask = 0;
  if (buttons & 1) mask |= 1;
  if (buttons & 4) mask |= 2;
  if (buttons & 2) mask |= 4;
  return mask;
}

export default function InteractiveSsmDesktop({
  labInstanceId,
  machineLabel,
  focusMode = false,
}: {
  labInstanceId: string;
  machineLabel: string;
  focusMode?: boolean;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const channelRef = React.useRef<SsmBrowserPortChannel | null>(null);
  const rfbRef = React.useRef<RfbClient | null>(null);
  const sessionIdRef = React.useRef<string | null>(null);
  const csrfRef = React.useRef<string | null>(null);
  const generationRef = React.useRef(0);
  const intentionalCloseRef = React.useRef(false);
  const retryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const transportRetriesRef = React.useRef(0);
  const bootstrapRetriesRef = React.useRef(0);
  const disposedRef = React.useRef(false);
  const connectRef = React.useRef<(recovery?: boolean) => Promise<void>>(async () => undefined);

  const [state, setState] = React.useState<ConnectionState>("connecting");
  const [error, setError] = React.useState<string | null>(null);
  const [statusDetail, setStatusDetail] = React.useState("Preparing the private browser desktop.");
  const [platform, setPlatform] = React.useState<"linux" | "windows" | null>(null);
  const [desktopSize, setDesktopSize] = React.useState<string | null>(null);
  const [accessEvidenceState, setAccessEvidenceState] = React.useState<AccessEvidenceState>("pending");

  const clearRetryTimer = React.useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }, []);

  const endServerSession = React.useCallback(async (keepalive = false) => {
    const sessionId = sessionIdRef.current;
    const csrf = csrfRef.current;
    sessionIdRef.current = null;
    if (!sessionId || !csrf) return;
    try {
      await fetch(`/api/labs/instances/${labInstanceId}/desktop/session`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ sessionId }),
        keepalive,
      });
    } catch {
      // Session Manager also closes the port session when the data channel disappears.
    }
  }, [labInstanceId]);

  const closeLocalChannel = React.useCallback(() => {
    rfbRef.current?.close();
    rfbRef.current = null;
    channelRef.current?.close();
    channelRef.current = null;
  }, []);

  const scheduleTransportRecovery = React.useCallback((reason?: string) => {
    if (disposedRef.current || intentionalCloseRef.current) return;
    if (transportRetriesRef.current >= 3) {
      setState("error");
      setError(reason || "The private desktop tunnel closed repeatedly.");
      setStatusDetail("Automatic recovery stopped after three attempts. Use Reconnect to start a fresh desktop tunnel.");
      return;
    }
    transportRetriesRef.current += 1;
    const delay = Math.min(6000, 1000 * (2 ** (transportRetriesRef.current - 1)));
    setState("connecting");
    setError(null);
    setStatusDetail(`Desktop transport interrupted. Recovering with a fresh SSM tunnel (${transportRetriesRef.current}/3)…`);
    clearRetryTimer();
    retryTimerRef.current = setTimeout(() => void connectRef.current(true), delay);
  }, [clearRetryTimer]);

  const connect = React.useCallback(async (recovery = false) => {
    const canvas = canvasRef.current;
    if (!canvas || disposedRef.current) return;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    clearRetryTimer();

    intentionalCloseRef.current = true;
    closeLocalChannel();
    await endServerSession(false);
    intentionalCloseRef.current = false;

    if (!recovery) {
      transportRetriesRef.current = 0;
      bootstrapRetriesRef.current = 0;
    }
    setState("connecting");
    setError(null);
    setAccessEvidenceState("pending");
    setStatusDetail(recovery ? "Requesting a fresh private desktop tunnel." : "Checking the desktop service on the lab VM.");

    try {
      const csrf = await getCsrfToken();
      if (generation !== generationRef.current || disposedRef.current) return;
      csrfRef.current = csrf;

      const response = await fetch(`/api/labs/instances/${labInstanceId}/desktop/session`, {
        method: "POST",
        headers: { "x-csrf-token": csrf },
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new DesktopRequestError(body.error || "Could not start the browser desktop", body.code);
      if (!body.sessionId || !body.bridgePath || !body.tokenValue) throw new Error("Oxsig did not return a complete desktop tunnel session");
      if (generation !== generationRef.current || disposedRef.current) return;

      const session = body as DesktopSession;
      setPlatform(session.platform);
      sessionIdRef.current = session.sessionId;
      let ssmChannelReady = false;

      const channel = new SsmBrowserPortChannel({
        onData: (data) => rfbRef.current?.feed(data),
        onReady: () => {
          if (generation !== generationRef.current) return;
          ssmChannelReady = true;
          setStatusDetail("Private SSM tunnel connected. Negotiating the browser desktop display.");
        },
        onError: (message) => {
          if (generation !== generationRef.current) return;
          setError(message);
        },
        onClose: (reason) => {
          if (generation !== generationRef.current || intentionalCloseRef.current) return;
          void endServerSession(true);
          scheduleTransportRecovery(reason);
        },
      });

      const rfb = new RfbClient(canvas, (bytes) => channel.send(bytes), {
        onConnected: ({ width, height, name }) => {
          if (generation !== generationRef.current) return;
          transportRetriesRef.current = 0;
          bootstrapRetriesRef.current = 0;
          setDesktopSize(`${width}×${height}`);
          setState("connected");
          setError(null);
          setStatusDetail("Connected through AWS Systems Manager. No inbound VNC or RDP port is exposed.");
          canvas.focus();

          const offer = session.accessEvidence;
          if (!offer?.eligible || !ssmChannelReady) {
            setAccessEvidenceState("unavailable");
            return;
          }

          setAccessEvidenceState("recording");
          void fetch(`/api/labs/instances/${labInstanceId}/access-path-evidence`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-csrf-token": csrf,
            },
            body: JSON.stringify({
              ticket: offer.ticket,
              observation: {
                ssmChannelReady: true,
                rfbHandshakeComplete: true,
                rfbProtocolVersion: "RFB 003.008",
                desktopName: name.slice(0, 255),
                framebuffer: { width, height },
              },
            }),
            cache: "no-store",
          }).then(async (evidenceResponse) => {
            if (generation !== generationRef.current) return;
            if (!evidenceResponse.ok) {
              setAccessEvidenceState("error");
              return;
            }
            setAccessEvidenceState("recorded");
          }).catch(() => {
            if (generation === generationRef.current) setAccessEvidenceState("error");
          });
        },
        onResize: (width, height) => setDesktopSize(`${width}×${height}`),
        onError: (message) => {
          if (generation !== generationRef.current) return;
          setState("error");
          setError(message);
          setStatusDetail("The private tunnel is open, but the desktop protocol failed.");
          channel.close();
        },
      });

      channelRef.current = channel;
      rfbRef.current = rfb;
      channel.connect({
        sessionId: session.sessionId,
        streamUrl: bridgeWebSocketUrl(session.bridgePath),
        tokenValue: session.tokenValue,
      });
    } catch (connectError) {
      if (generation !== generationRef.current || disposedRef.current) return;
      const failure = connectError instanceof DesktopRequestError ? connectError : new DesktopRequestError(connectError instanceof Error ? connectError.message : "Browser desktop connection failed");
      await endServerSession(false);

      if (failure.code === "DESKTOP_BOOTSTRAP_PENDING" && bootstrapRetriesRef.current < 24) {
        bootstrapRetriesRef.current += 1;
        setState("connecting");
        setError(null);
        setStatusDetail(`Preparing the desktop environment on ${machineLabel}… (${bootstrapRetriesRef.current}/24)`);
        retryTimerRef.current = setTimeout(() => void connectRef.current(true), 5000);
        return;
      }

      setState("error");
      setError(failure.message);
      setStatusDetail("Desktop connection attempt failed.");
    }
  }, [clearRetryTimer, closeLocalChannel, endServerSession, labInstanceId, machineLabel, scheduleTransportRecovery]);

  connectRef.current = connect;

  const disconnect = React.useCallback(async () => {
    generationRef.current += 1;
    intentionalCloseRef.current = true;
    clearRetryTimer();
    closeLocalChannel();
    await endServerSession(false);
    setState("disconnected");
    setError(null);
    setStatusDetail("Disconnected from the private browser desktop.");
    intentionalCloseRef.current = false;
  }, [clearRetryTimer, closeLocalChannel, endServerSession]);

  React.useEffect(() => {
    disposedRef.current = false;
    void connectRef.current(false);
    return () => {
      disposedRef.current = true;
      generationRef.current += 1;
      intentionalCloseRef.current = true;
      clearRetryTimer();
      closeLocalChannel();
      void endServerSession(true);
    };
  }, [clearRetryTimer, closeLocalChannel, endServerSession]);

  const pointerPosition = (event: React.PointerEvent<HTMLCanvasElement> | React.WheelEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height,
    };
  };

  const statusLabel = state === "connected" ? "Connected" : state === "connecting" ? "Connecting" : state === "error" ? "Error" : "Disconnected";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold">Browser desktop — {machineLabel}</span>
          <Badge variant={state === "connected" ? "default" : "outline"} className="text-[9px]">
            {state === "connecting" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CircleDot className="mr-1 h-3 w-3" />}
            {statusLabel}
          </Badge>
          {desktopSize && <Badge variant="outline" className="text-[9px]">{desktopSize}</Badge>}
          {accessEvidenceState === "recorded" && (
            <Badge variant="secondary" className="text-[9px]"><ShieldCheck className="mr-1 h-3 w-3" />Access evidence recorded</Badge>
          )}
          {accessEvidenceState === "recording" && (
            <Badge variant="outline" className="text-[9px]"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Recording evidence</Badge>
          )}
          {accessEvidenceState === "error" && <Badge variant="outline" className="text-[9px]">Evidence retry on next session</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          {platform === "windows" && state === "connected" && (
            <Button size="sm" variant="outline" onClick={() => rfbRef.current?.sendCtrlAltDelete()}>
              <Keyboard className="mr-1.5 h-3.5 w-3.5" />Ctrl+Alt+Del
            </Button>
          )}
          {state !== "connected" && (
            <Button size="sm" variant="outline" onClick={() => void connect(false)} disabled={state === "connecting"}>
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

      {(statusDetail || error) && (
        <div className={`rounded-lg border px-3 py-2 text-[11px] ${error ? "border-destructive/30 bg-destructive/5 text-destructive" : "bg-muted/20 text-muted-foreground"}`}>
          {error || statusDetail}
        </div>
      )}

      <div className="relative overflow-auto rounded-xl border bg-black p-2">
        <div className={`flex items-center justify-center ${focusMode ? "min-h-[calc(100vh-220px)]" : "min-h-[460px]"}`}>
          <canvas
            ref={canvasRef}
            tabIndex={0}
            aria-label={`Interactive browser desktop for ${machineLabel}`}
            className="max-h-[calc(100vh-250px)] max-w-full cursor-default outline-none"
            style={{ imageRendering: "auto" }}
            onKeyDown={(event) => { event.preventDefault(); rfbRef.current?.key(event.key, true); }}
            onKeyUp={(event) => { event.preventDefault(); rfbRef.current?.key(event.key, false); }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              event.currentTarget.focus();
              const point = pointerPosition(event);
              rfbRef.current?.pointer(point.x, point.y, rfbButtons(event.buttons));
            }}
            onPointerMove={(event) => {
              const point = pointerPosition(event);
              rfbRef.current?.pointer(point.x, point.y, rfbButtons(event.buttons));
            }}
            onPointerUp={(event) => {
              event.preventDefault();
              const point = pointerPosition(event);
              rfbRef.current?.pointer(point.x, point.y, rfbButtons(event.buttons));
            }}
            onContextMenu={(event) => event.preventDefault()}
            onWheel={(event) => {
              event.preventDefault();
              const point = pointerPosition(event);
              rfbRef.current?.wheel(event.deltaY, point.x, point.y);
            }}
          />
          {state !== "connected" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50 text-center text-white">
              <div>
                {state === "connecting" ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : <Monitor className="mx-auto h-8 w-8 opacity-70" />}
                <p className="mt-3 text-sm font-medium">{state === "connecting" ? "Preparing secure desktop" : "Desktop not connected"}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="text-[10px] leading-4 text-muted-foreground">
        Desktop pixels, keyboard, and pointer events travel through the authenticated same-origin Oxsig WebSocket bridge and AWS Systems Manager port forwarding. The VNC service is loopback-only on the lab VM. When prior guest-service evidence is ready, Oxsig records the successful browser RFB handshake as browser-observed access-path evidence.
      </p>
    </div>
  );
}
