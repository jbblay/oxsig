import * as ed25519 from '@noble/ed25519';

/**
 * Lightweight P2P networking over WebRTC DataChannels (no backend signup)
 * - Manual signaling (copy/paste or QR) to bootstrap
 * - Neighbor exchange (IDs) and heartbeats with RTT
 * - Simple multi-hop forwarding (best-effort) via application-level routing
 *
 * Notes:
 * - Uses public STUN servers for ICE (no TURN/relay). Some NATs may fail.
 * - Manual signaling flows: createOffer -> paste to peer -> createAnswer -> paste back
 */

export type PeerId = string;

export type LinkStatus = 'healthy' | 'degraded' | 'offline';

export type P2PEventMap = {
  peer: (peerId: PeerId) => void;
  peerDisconnected: (peerId: PeerId) => void;
  message: (from: PeerId, payload: any) => void;
  topology: (peers: PeerId[]) => void;
  metrics: (stats: {
    peerId: PeerId;
    rttMs?: number;
    lastSeen: number;
    missedHeartbeats: number;
    status: LinkStatus;
    spike?: boolean;
    verified?: boolean;
  }) => void;
};

type EventKey = keyof P2PEventMap;

export interface P2PNodeOptions {
  id?: PeerId;
  // Optionally provide identity keys (hex). If omitted, a local identity will be generated and cached.
  publicKeyHex?: string;
  secretKeyHex?: string;
  iceServers?: RTCIceServer[];
  heartbeatMs?: number;
}

export interface P2PCodec {
  encode: (obj: any) => Promise<any> | any;
  decode: (obj: any) => Promise<any> | any;
}

interface ChannelInfo {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  lastPing?: number;
  lastSeen: number;
  rttMs?: number;
  missedHeartbeats: number;
  awaitingPong?: boolean;
  lastRtt?: number;
  peerPkHex?: string;
  verified?: boolean;
}

type WireMessage =
  | { type: 'hello'; id: PeerId; ts: number; pk: string; sig: string }
  | { type: 'ping'; t: number }
  | { type: 'pong'; t: number }
  | { type: 'neighbors'; ids: PeerId[] }
  | { type: 'route'; to: PeerId; from: PeerId; ttl: number; payload: any }
  | { type: 'payload'; from: PeerId; payload: any };

export class P2PNode {
  readonly id: PeerId;
  readonly heartbeatMs: number;
  private iceServers: RTCIceServer[];
  private events = new Map<EventKey, Set<Function>>();
  private channels = new Map<PeerId, ChannelInfo>();
  private heartbeatTimer: number | null = null;
  private secretKeyHex: string;
  private publicKeyHex: string;
  private codec: P2PCodec = { encode: (x) => x, decode: (x) => x };

  constructor(opts: P2PNodeOptions = {}) {
    const ident = this.loadOrCreateIdentity(opts);
    this.id = opts.id || ident.id;
    this.publicKeyHex = ident.publicKeyHex;
    this.secretKeyHex = ident.secretKeyHex;
    this.heartbeatMs = opts.heartbeatMs ?? 5_000;
    // Base ICE servers
    const defaults: RTCIceServer[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478?transport=udp' },
    ];
    // Optional TURN via env
    const turnUrl = (typeof process !== 'undefined' && (process as any).env?.NEXT_PUBLIC_TURN_URL) || undefined;
    const turnUser = (typeof process !== 'undefined' && (process as any).env?.NEXT_PUBLIC_TURN_USERNAME) || undefined;
    const turnCred = (typeof process !== 'undefined' && (process as any).env?.NEXT_PUBLIC_TURN_CREDENTIAL) || undefined;
    // Optional TURN via localStorage settings
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('p2p_settings_v1') : null;
      if (raw) {
        const cfg = JSON.parse(raw);
        if (cfg.turnUrl) {
          (defaults as any).push({ urls: cfg.turnUrl, username: cfg.turnUsername || undefined, credential: cfg.turnCredential || undefined });
        }
      } else if (typeof localStorage !== 'undefined') {
        const lsUrl = localStorage.getItem('p2p_turn_url');
        const lsUser = localStorage.getItem('p2p_turn_username');
        const lsCred = localStorage.getItem('p2p_turn_credential');
        if (lsUrl) (defaults as any).push({ urls: lsUrl, username: lsUser || undefined, credential: lsCred || undefined });
      }
    } catch {}
    if (turnUrl) {
      defaults.push({ urls: turnUrl, username: turnUser, credential: turnCred } as any);
    }
    this.iceServers = opts.iceServers ? [...defaults, ...opts.iceServers] : defaults;
    // Finalize identity (derive public key, persist) asynchronously
    void this.finalizeIdentityIfNeeded();
  }

  on<K extends EventKey>(event: K, cb: P2PEventMap[K]) {
    if (!this.events.has(event)) this.events.set(event, new Set());
    this.events.get(event)!.add(cb);
  }
  off<K extends EventKey>(event: K, cb: P2PEventMap[K]) {
    this.events.get(event)?.delete(cb);
  }
  private emit<K extends EventKey>(event: K, ...args: Parameters<P2PEventMap[K]>) {
    this.events.get(event)?.forEach((cb) => (cb as any)(...args));
  }

  listPeers(): PeerId[] {
    return Array.from(this.channels.keys());
  }

  // --- Signaling (manual) ---
  async createOffer(): Promise<string> {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const dc = pc.createDataChannel('data', { negotiated: false });
    this.attachChannelHandlers('pending', pc, dc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sdpReady = await this.waitForIceGathering(pc);
    return JSON.stringify({ kind: 'offer', sdp: sdpReady.sdp, type: sdpReady.type });
  }

  async acceptAnswer(answerStr: string): Promise<void> {
    const latestPending = this.findPendingPc();
    if (!latestPending) throw new Error('No pending connection to apply answer');
    const answer = JSON.parse(answerStr);
    await latestPending.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async receiveOfferCreateAnswer(offerStr: string): Promise<string> {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    pc.ondatachannel = (ev) => {
      const dc = ev.channel;
      this.attachChannelHandlers('pending', pc, dc);
    };
    const offer = JSON.parse(offerStr);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    const sdpReady = await this.waitForIceGathering(pc);
    return JSON.stringify({ kind: 'answer', sdp: sdpReady.sdp, type: sdpReady.type });
  }

  // --- Messaging ---
  send(to: PeerId, payload: any): boolean {
    const ch = this.channels.get(to);
    if (!ch) return false;
    const out = this.codec ? this.codec.encode(payload) : payload;
    const msg: WireMessage = { type: 'payload', from: this.id, payload: out };
    ch.dc.send(JSON.stringify(msg));
    return true;
  }

  broadcast(payload: any): void {
    for (const [pid, ch] of this.channels) {
      const out = this.codec ? this.codec.encode(payload) : payload;
      const msg: WireMessage = { type: 'payload', from: this.id, payload: out };
      try { ch.dc.send(JSON.stringify(msg)); } catch {}
    }
  }

  // Best-effort multi-hop routing (simple flood with TTL)
  route(to: PeerId, payload: any, ttl = 4) {
    if (to === this.id) {
      this.emit('message', this.id, payload);
      return;
    }
    const out = this.codec ? this.codec.encode(payload) : payload;
    const wire: WireMessage = { type: 'route', to, from: this.id, ttl, payload: out };
    for (const [, ch] of this.channels) {
      try { ch.dc.send(JSON.stringify(wire)); } catch {}
    }
  }

  // --- Internals ---
  private attachChannelHandlers(stateKey: 'pending' | PeerId, pc: RTCPeerConnection, dc: RTCDataChannel) {
    dc.onopen = () => {
      // Identify self to peer
      const ts = Date.now();
      const msgToSign = this.encodeText(`${this.id}:${ts}`);
      this.sign(msgToSign).then((sigHex) => {
        const hello: WireMessage = { type: 'hello', id: this.id, ts, pk: this.publicKeyHex, sig: sigHex };
        try { dc.send(JSON.stringify(hello)); } catch {}
      });
    };

    dc.onmessage = (ev) => this.handleWireMessage(pc, dc, ev.data);
    dc.onclose = () => {
      const peerId = this.findPeerByChannel(dc);
      if (peerId) {
        this.channels.delete(peerId);
        this.emit('peerDisconnected', peerId);
        this.emit('topology', this.listPeers());
      }
    };

    // Track candidates done to avoid leaks
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed' || pc.iceConnectionState === 'disconnected') {
        const peerId = this.findPeerByChannel(dc);
        if (peerId) {
          this.channels.delete(peerId);
          this.emit('peerDisconnected', peerId);
          this.emit('topology', this.listPeers());
        }
      }
    };
  }

  private async handleWireMessage(pc: RTCPeerConnection, dc: RTCDataChannel, raw: any) {
    let msg: WireMessage;
    try { msg = JSON.parse(String(raw)); } catch { return; }

    switch (msg.type) {
      case 'hello': {
        const peerId = msg.id as PeerId;
        const ts = (msg as any).ts as number;
        const pkHex = (msg as any).pk as string;
        const sigHex = (msg as any).sig as string;
        let verified = false;
        try {
          const data = this.encodeText(`${peerId}:${ts}`);
          const pk = pkHex ? this.hexToBytes(pkHex) : undefined;
          const sig = sigHex ? this.hexToBytes(sigHex) : undefined;
          verified = pk && sig ? await ed25519.verify(sig, data, pk) : false;
        } catch {}
        if (!this.channels.has(peerId)) {
          this.channels.set(peerId, { pc, dc, lastSeen: Date.now(), missedHeartbeats: 0, peerPkHex: pkHex, verified });
          this.emit('peer', peerId);
          this.emit('topology', this.listPeers());
          // Share neighbors list
          this.sendNeighbors(peerId);
          this.ensureHeartbeat();
          // Emit initial metrics with verification status
          const ch = this.channels.get(peerId)!;
          this.emit('metrics', {
            peerId,
            rttMs: ch.rttMs,
            lastSeen: ch.lastSeen,
            missedHeartbeats: ch.missedHeartbeats,
            status: this.deriveStatus(ch),
            verified: ch.verified,
          });
        } else {
          const ch = this.channels.get(peerId)!;
          ch.peerPkHex = pkHex;
          ch.verified = verified;
          this.emit('metrics', {
            peerId,
            rttMs: ch.rttMs,
            lastSeen: ch.lastSeen,
            missedHeartbeats: ch.missedHeartbeats,
            status: this.deriveStatus(ch),
            verified: ch.verified,
          });
        }
        break;
      }
      case 'ping': {
        const reply: WireMessage = { type: 'pong', t: msg.t };
        dc.send(JSON.stringify(reply));
        break;
      }
      case 'pong': {
        const peerId = this.findPeerByChannel(dc);
        if (!peerId) break;
        const ch = this.channels.get(peerId)!;
        ch.lastSeen = Date.now();
        const rtt = Math.max(0, ch.lastPing ? Date.now() - ch.lastPing : 0);
        const spike = ch.lastRtt !== undefined ? rtt > Math.max(150, ch.lastRtt * 2) : false;
        ch.rttMs = rtt;
        ch.lastRtt = rtt;
        ch.awaitingPong = false;
        // Successful pong resets missed heartbeats
        ch.missedHeartbeats = 0;
        this.emit('metrics', {
          peerId,
          rttMs: ch.rttMs,
          lastSeen: ch.lastSeen,
          missedHeartbeats: ch.missedHeartbeats,
          status: this.deriveStatus(ch),
          spike,
          verified: ch.verified,
        });
        break;
      }
      case 'neighbors': {
        // In future we can auto-attempt introductions via existing peers
        break;
      }
      case 'payload': {
        const from = msg.from as PeerId;
        const decoded = this.codec ? this.codec.decode(msg.payload) : msg.payload;
        this.emit('message', from, decoded);
        break;
      }
      case 'route': {
        const { to, from, ttl, payload } = msg;
        if (to === this.id) {
          const decoded = this.codec ? this.codec.decode(payload) : payload;
          this.emit('message', from as PeerId, decoded);
        } else if (ttl > 0) {
          const fwd: WireMessage = { type: 'route', to, from, ttl: ttl - 1, payload };
          for (const [, ch] of this.channels) {
            try { ch.dc.send(JSON.stringify(fwd)); } catch {}
          }
        }
        break;
      }
    }
  }

  private sendNeighbors(to: PeerId) {
    const ch = this.channels.get(to);
    if (!ch) return;
    const msg: WireMessage = { type: 'neighbors', ids: this.listPeers() };
    ch.dc.send(JSON.stringify(msg));
  }

  private ensureHeartbeat() {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = (setInterval(() => {
      for (const [peerId, ch] of this.channels) {
        try {
          ch.lastPing = Date.now();
          ch.awaitingPong = true;
          const sentAt = ch.lastPing;
          const ping: WireMessage = { type: 'ping', t: sentAt };
          ch.dc.send(JSON.stringify(ping));
          // Timeout check for missed heartbeat
          setTimeout(() => {
            const stillWaiting = ch.awaitingPong && ch.lastPing === sentAt;
            if (stillWaiting) {
              ch.missedHeartbeats = (ch.missedHeartbeats || 0) + 1;
              this.emit('metrics', {
                peerId,
                rttMs: ch.rttMs,
                lastSeen: ch.lastSeen,
                missedHeartbeats: ch.missedHeartbeats,
                status: this.deriveStatus(ch),
                verified: ch.verified,
              });
            }
          }, this.heartbeatMs * 1.25);
        } catch {}
      }
    }, this.heartbeatMs) as unknown) as number;
  }

  private findPendingPc(): RTCPeerConnection | null {
    // Heuristic: most recent RTCPeerConnection that isn’t bound to a known peer yet
    for (const [, ch] of this.channels) {
      if (!ch) continue;
    }
    // We don’t track pending explicitly; instead, keep last created via closure
    // To keep it simple, we capture the most recent RTCPeerConnection by scanning global RTCPeerConnection instances is not feasible.
    // Simplify: store last created pc on instance.
    return (this as any)._lastPc ?? null;
  }

  private async waitForIceGathering(pc: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
    (this as any)._lastPc = pc; // store for acceptAnswer()
    if (pc.iceGatheringState === 'complete') return pc.localDescription!;
    await new Promise<void>((resolve) => {
      const check = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', check);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', check);
      // Fallback timeout
      setTimeout(resolve, 2000);
    });
    return pc.localDescription!;
  }

  private findPeerByChannel(dc: RTCDataChannel): PeerId | null {
    for (const [pid, ch] of this.channels) {
      if (ch.dc === dc) return pid;
    }
    return null;
  }

  private deriveStatus(ch: ChannelInfo): LinkStatus {
    const now = Date.now();
    const staleness = now - (ch.lastSeen || 0);
    if (ch.missedHeartbeats >= 3 || staleness > this.heartbeatMs * 4) return 'offline';
    if ((ch.rttMs && ch.rttMs > 300) || ch.missedHeartbeats >= 1 || staleness > this.heartbeatMs * 2) return 'degraded';
    return 'healthy';
  }

  // --- Identity helpers ---
  private loadOrCreateIdentity(opts: P2PNodeOptions): { id: string; publicKeyHex: string; secretKeyHex: string } {
    // Prefer provided keys
    let publicKeyHex = opts.publicKeyHex;
    let secretKeyHex = opts.secretKeyHex;
    if (!publicKeyHex || !secretKeyHex) {
      try {
        const cached = localStorage.getItem('p2p_identity_v1');
        if (cached) {
          const parsed = JSON.parse(cached);
          publicKeyHex = parsed.publicKeyHex;
          secretKeyHex = parsed.secretKeyHex;
        }
      } catch {}
    }
    if (!publicKeyHex || !secretKeyHex) {
      // Generate new ed25519 private key seed (32 bytes)
      const sk = new Uint8Array(32);
      if (globalThis.crypto && crypto.getRandomValues) crypto.getRandomValues(sk);
      secretKeyHex = this.hexFromBytes(sk);
      // publicKey will be derived in finalizeIdentityIfNeeded
      return { id: 'temp', publicKeyHex: '', secretKeyHex };
    }
    // Derive id from public key fingerprint
    const id = publicKeyHex.slice(0, 16);
    return { id, publicKeyHex, secretKeyHex };
  }

  private async finalizeIdentityIfNeeded() {
    if (!this.publicKeyHex || this.publicKeyHex.length === 0) {
      // Derive public key from secret
      const skBytes = this.hexToBytes(this.secretKeyHex);
      const pkBytes = await ed25519.getPublicKey(skBytes);
      const pkHex = typeof pkBytes === 'string' ? pkBytes : this.hexFromBytes(pkBytes as unknown as Uint8Array);
      this.publicKeyHex = pkHex;
      const id = pkHex.slice(0, 16);
      if (!this.id || this.id === 'temp') (this as any).id = id;
      try {
        localStorage.setItem('p2p_identity_v1', JSON.stringify({ publicKeyHex: pkHex, secretKeyHex: this.secretKeyHex }));
      } catch {}
    }
  }

  private encodeText(str: string): Uint8Array {
    return new TextEncoder().encode(str);
  }

  private async sign(msg: Uint8Array): Promise<string> {
    const skBytes = this.hexToBytes(this.secretKeyHex);
    const sigBytes = await ed25519.sign(msg, skBytes);
    return typeof sigBytes === 'string' ? sigBytes : this.hexFromBytes(sigBytes as unknown as Uint8Array);
  }

  private hexFromBytes(bytes: Uint8Array): string {
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  private hexToBytes(hex: string): Uint8Array {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    const len = clean.length;
    const out = new Uint8Array(len / 2);
    for (let i = 0; i < len; i += 2) {
      out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
    }
    return out;
  }

  // Close timers and tear down all peer connections
  shutdown() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer as any);
      this.heartbeatTimer = null;
    }
    for (const [, ch] of this.channels) {
      try { ch.dc.close(); } catch {}
      try { ch.pc.close(); } catch {}
    }
    this.channels.clear();
  }

  // Install a message codec (e.g., app-layer encryption). Defaults to identity.
  setCodec(codec: P2PCodec) {
    this.codec = codec || { encode: (x: any) => x, decode: (x: any) => x };
  }

  private generateId(): PeerId {
    const rand = (globalThis.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint8Array(16)) : new Uint8Array(16);
    return Array.from(rand).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  }
}
