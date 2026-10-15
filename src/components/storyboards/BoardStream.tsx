'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { getCsrfToken } from '@/lib/security/csrf-client';

class StreamRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

type Signal = { id: string; sender: string; kind: 'offer' | 'answer' | 'ice'; payload: Record<string, unknown> };
type Peer = { pc: RTCPeerConnection; pending: RTCIceCandidateInit[] };
type Run = {
  closed: boolean; session?: string; csrf: string; presenter: boolean;
  peers: Map<string, Peer>; tracks: MediaStreamTrack[]; timers: ReturnType<typeof setTimeout>[];
  frame?: number; stop: () => void;
};

export default function BoardStream({ boardId, owner, canvas }: {
  boardId: string; owner: boolean; canvas: HTMLCanvasElement | null;
}) {
  const runRef = React.useRef<Run | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [camera, setCamera] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [active, setActive] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [muted, setMuted] = React.useState(false);
  const [preview, setPreview] = React.useState<MediaStream | null>(null);
  const [presenting, setPresenting] = React.useState(false);
  const endpoint = `/api/storyboards/${boardId}/stream`;

  React.useEffect(() => () => runRef.current?.stop(), [boardId]);
  React.useEffect(() => {
    const video = videoRef.current;
    if (video) { video.srcObject = preview; void video.play().catch(() => undefined); }
  }, [preview]);

  async function start(presenter: boolean) {
    if (runRef.current) return;
    setBusy(true); setStatus('Connecting…'); setPresenting(presenter); setMuted(false);
    const run: Run = { closed: false, csrf: '', presenter, peers: new Map(), tracks: [], timers: [], stop: () => {} };
    const post = async (body: Record<string, unknown>) => {
      const response = await fetch(endpoint, { method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': run.csrf },
        body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
      const result = await response.json();
      if (!response.ok) throw new StreamRequestError(result.error || 'Streaming connection failed', response.status);
      return result;
    };
    run.stop = () => {
      if (run.closed) return;
      run.closed = true;
      run.timers.forEach(clearTimeout);
      if (run.frame !== undefined) cancelAnimationFrame(run.frame);
      run.tracks.forEach(track => track.stop());
      run.peers.forEach(peer => peer.pc.close());
      if (run.session) void fetch(endpoint, { method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': run.csrf },
        body: JSON.stringify({ action: 'leave', session: run.session }) }).catch(() => undefined);
      window.removeEventListener('pagehide', run.stop);
      if (runRef.current === run) {
        runRef.current = null; setPreview(null); setActive(false); setBusy(false); setStatus('Stream ended');
      }
    };
    runRef.current = run;
    window.addEventListener('pagehide', run.stop);
    const fail = (error: unknown) => {
      if (run.closed) return;
      run.stop(); setStatus(error instanceof Error ? error.message : 'Stream failed');
    };
    try {
      if (!window.RTCPeerConnection || !navigator.mediaDevices) throw new Error('Use a browser with WebRTC over HTTPS.');
      run.csrf = await getCsrfToken();
      if (run.closed) return;
      const joined = await post({ action: 'join', presenter });
      run.session = joined.session;
      if (run.closed) {
        void post({ action: 'leave', session: joined.session }).catch(() => undefined);
        return;
      }
      // Keep the lease alive while the user responds to a permission prompt.
      let preparing = true;
      const heartbeat = async () => {
        if (run.closed || !preparing) return;
        try { await post({ action: 'poll', session: run.session, after: '0' }); }
        catch (error) { fail(error); return; }
        if (!run.closed && preparing) run.timers.push(setTimeout(() => void heartbeat(), 5000));
      };
      run.timers.push(setTimeout(() => void heartbeat(), 5000));
      let outgoing: MediaStream | null = null;
      if (presenter) {
        if (!canvas || !canvas.captureStream) throw new Error('Open a drawing Board before presenting.');
        const input = await navigator.mediaDevices.getUserMedia({ audio: true, video: camera ? { width: 320, height: 240 } : false });
        if (run.closed) { input.getTracks().forEach(track => track.stop()); return; }
        run.tracks.push(...input.getTracks());
        const composite = document.createElement('canvas');
        composite.width = 1280; composite.height = 720;
        const ctx = composite.getContext('2d');
        if (!ctx) throw new Error('Could not capture the Board');
        const webcam = document.createElement('video');
        webcam.muted = true; webcam.playsInline = true; webcam.srcObject = input;
        if (camera) await webcam.play();
        if (run.closed) { webcam.srcObject = null; return; }
        const draw = () => {
          if (run.closed) { webcam.srcObject = null; return; }
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1280, 720);
          const scale = Math.min(1280 / Math.max(canvas.width, 1), 720 / Math.max(canvas.height, 1));
          const w = canvas.width * scale, h = canvas.height * scale;
          ctx.drawImage(canvas, (1280-w)/2, (720-h)/2, w, h);
          if (camera && webcam.readyState >= 2) ctx.drawImage(webcam, 1024, 528, 240, 180);
          run.frame = requestAnimationFrame(draw);
        };
        draw();
        outgoing = composite.captureStream(15);
        input.getAudioTracks().forEach(track => outgoing!.addTrack(track));
        run.tracks.push(...outgoing.getVideoTracks());
        input.getTracks().forEach(track => { track.onended = () => fail(new Error('Camera or microphone disconnected')); });
        setPreview(outgoing);
      }
      const send = async (recipient: string, kind: Signal['kind'], payload: unknown) => {
        try { return await post({ action: 'signal', session: run.session, recipient, kind, payload }); }
        catch (error) {
          // A viewer leaving during ICE negotiation must not end everyone's broadcast.
          if (error instanceof StreamRequestError && error.status === 410) {
            run.peers.get(recipient)?.pc.close(); run.peers.delete(recipient);
            return;
          }
          throw error;
        }
      };
      const makePeer = (id: string) => {
        const pc = new RTCPeerConnection({ iceServers: joined.iceServers });
        const peer: Peer = { pc, pending: [] };
        run.peers.set(id, peer);
        if (outgoing) outgoing.getTracks().forEach(track => pc.addTrack(track, outgoing!));
        pc.onicecandidate = event => {
          if (event.candidate && !run.closed) void send(id, 'ice', event.candidate.toJSON()).catch(fail);
        };
        pc.ontrack = event => {
          if (!run.closed && !presenter) { setPreview(event.streams[0] || new MediaStream([event.track])); setStatus('Watching live'); }
        };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed') {
            if (!presenter) fail(new Error('Media connection failed. Leave and join again.'));
            else { pc.close(); run.peers.delete(id); }
          }
        };
        return peer;
      };
      let cursor = '0';
      const poll = async () => {
        if (run.closed) return;
        try {
          const result = await post({ action: 'poll', session: run.session, after: cursor });
          if (run.closed) return;
          const peers = result.peers as Array<{ id: string }>;
          const ids = new Set(peers.map(peer => peer.id));
          for (const [id, peer] of run.peers) if (!ids.has(id)) {
            peer.pc.close(); run.peers.delete(id);
            if (!presenter) { setPreview(null); setStatus('Waiting for the presenter…'); }
          }
          if (presenter) {
            setStatus(`Live · ${peers.length} viewer${peers.length === 1 ? '' : 's'}`);
            for (const { id } of peers) if (!run.peers.has(id)) {
              const { pc } = makePeer(id);
              await pc.setLocalDescription(await pc.createOffer());
              if (run.closed) return;
              await send(id, 'offer', pc.localDescription!.toJSON());
            }
          }
          for (const signal of result.signals as Signal[]) {
            if (run.closed) return;
            cursor = signal.id;
            if (!ids.has(signal.sender)) continue;
            let peer = run.peers.get(signal.sender);
            if (!peer && !presenter) peer = makePeer(signal.sender);
            if (!peer) continue;
            const { pc } = peer;
            if (signal.kind === 'ice') {
              if (pc.remoteDescription) await pc.addIceCandidate(signal.payload as RTCIceCandidateInit);
              else peer.pending.push(signal.payload as RTCIceCandidateInit);
            } else {
              await pc.setRemoteDescription(signal.payload as unknown as RTCSessionDescriptionInit);
              for (const candidate of peer.pending.splice(0)) await pc.addIceCandidate(candidate);
              if (signal.kind === 'offer') {
                await pc.setLocalDescription(await pc.createAnswer());
                await send(signal.sender, 'answer', pc.localDescription!.toJSON());
              }
            }
          }
          if (!run.closed) run.timers.push(setTimeout(() => void poll(), 1500));
        } catch (error) { fail(error); }
      };
      preparing = false;
      if (run.closed) return;
      setActive(true); setBusy(false);
      setStatus(presenter ? 'Live · waiting for viewers' : 'Waiting for the presenter…');
      // End before the short-lived relay credential expires.
      run.timers.push(setTimeout(() => fail(new Error('Stream time limit reached. Start a new stream to continue.')), 45 * 60_000));
      void poll();
    } catch (error) { fail(error); }
  }

  return <section className="mb-3 rounded-lg border p-3" aria-label="Board live stream">
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold">Live video & voice</span>
      {!active && !busy && <>
        {owner && <><label className="text-xs"><input type="checkbox" checked={camera} onChange={e => setCamera(e.target.checked)} /> Include camera</label>
          <Button size="sm" disabled={!canvas} onClick={() => void start(true)}>Present Board</Button></>}
        <Button size="sm" variant="outline" onClick={() => void start(false)}>Watch live</Button>
      </>}
      {(active || busy) && <Button size="sm" variant="outline" onClick={() => runRef.current?.stop()}>Leave stream</Button>}
      {active && presenting && <Button size="sm" variant="outline" onClick={() => {
        runRef.current?.tracks.filter(track => track.kind === 'audio').forEach(track => { track.enabled = muted; });
        setMuted(!muted);
      }}>{muted ? 'Unmute microphone' : 'Mute microphone'}</Button>}
      <span className="text-xs text-muted-foreground" role="status">{status}</span>
    </div>
    {preview && <video ref={videoRef} autoPlay playsInline controls muted={presenting}
      className="mt-3 max-h-[480px] w-full rounded bg-black" aria-label={presenting ? 'Your live Board preview' : 'Live Board broadcast'} />}
    <p className="mt-2 text-[11px] text-muted-foreground">Share this Board with viewers first. Live streams are not recorded. Up to 8 viewers; sessions last up to 45 minutes.</p>
  </section>;
}
