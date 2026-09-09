'use client';

import {
  loadAblyBrowser,
  type RealtimeChannel,
  type RealtimeClient,
  type RealtimeMessage,
} from '@/lib/collab/use-realtime';
import { liveTerminalChannelName } from '@/lib/realtime/channel-names';

export type LiveTerminalRealtimeState = 'connecting' | 'connected' | 'disconnected' | 'disabled';

export type LiveTerminalOutputPacket = {
  bindingId: string;
  leaseId: string;
  publisherId: string;
  sequence: number;
  payloadType: number;
  data: string;
  at: number;
};

type TerminalRealtimeArgs = {
  workspaceId: string;
  bindingId: string;
  leaseId: string;
};

function terminalAuthUrl(args: TerminalRealtimeArgs, mode: 'publish' | 'subscribe') {
  const query = new URLSearchParams({
    collaborationId: args.workspaceId,
    terminalBindingId: args.bindingId,
    terminalLeaseId: args.leaseId,
    terminalMode: mode,
  });
  return `/api/realtime/ably/token?${query.toString()}`;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize));
    binary += String.fromCharCode(...chunk);
  }
  return window.btoa(binary);
}

export function base64ToBytes(value: string) {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function newPublisherId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parsePacket(message: RealtimeMessage, args: TerminalRealtimeArgs): LiveTerminalOutputPacket | null {
  const packet = message.data as Partial<LiveTerminalOutputPacket> | null | undefined;
  if (!packet || typeof packet !== 'object') return null;
  if (packet.bindingId !== args.bindingId || packet.leaseId !== args.leaseId) return null;
  if (typeof packet.publisherId !== 'string' || packet.publisherId.length < 1 || packet.publisherId.length > 160) return null;
  if (!Number.isSafeInteger(packet.sequence) || Number(packet.sequence) < 0) return null;
  if (!Number.isSafeInteger(packet.payloadType) || Number(packet.payloadType) < 0) return null;
  if (typeof packet.data !== 'string' || packet.data.length > 2_800_000) return null;
  if (!Number.isFinite(packet.at)) return null;
  return packet as LiveTerminalOutputPacket;
}

export class LiveTerminalOutputPublisher {
  private client: RealtimeClient | null = null;
  private channel: RealtimeChannel | null = null;
  private sequence = 0;
  private readonly publisherId = newPublisherId();
  private closed = false;
  private connectPromise: Promise<RealtimeChannel> | null = null;
  private publishChain: Promise<void> = Promise.resolve();

  constructor(private readonly args: TerminalRealtimeArgs) {}

  private ensureChannel() {
    if (this.channel) return Promise.resolve(this.channel);
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = loadAblyBrowser().then((Ably) => {
      if (this.closed) throw new Error('Terminal output publisher is closed');
      this.client = new Ably.Realtime({
        authUrl: terminalAuthUrl(this.args, 'publish'),
        useTokenAuth: true,
        closeOnUnload: true,
        echoMessages: false,
      });
      this.channel = this.client.channels.get(liveTerminalChannelName(
        this.args.workspaceId,
        this.args.bindingId,
        this.args.leaseId
      ));
      return this.channel;
    });
    return this.connectPromise;
  }

  publish(data: Uint8Array, payloadType: number) {
    if (this.closed || data.byteLength === 0) return;
    const packet: LiveTerminalOutputPacket = {
      bindingId: this.args.bindingId,
      leaseId: this.args.leaseId,
      publisherId: this.publisherId,
      sequence: this.sequence,
      payloadType,
      data: bytesToBase64(data),
      at: Date.now(),
    };
    this.sequence += 1;

    this.publishChain = this.publishChain
      .then(async () => {
        const channel = await this.ensureChannel();
        if (!this.closed) await channel.publish('terminal.output', packet);
      })
      .catch(() => undefined);
  }

  close() {
    this.closed = true;
    this.channel = null;
    this.connectPromise = null;
    this.client?.close();
    this.client = null;
  }
}

export class LiveTerminalOutputObserver {
  private client: RealtimeClient | null = null;
  private channel: RealtimeChannel | null = null;
  private listener: ((message: RealtimeMessage) => void) | null = null;
  private connectionListener: (() => void) | null = null;
  private closed = false;
  private publisherId: string | null = null;
  private lastSequence = -1;

  constructor(
    private readonly args: TerminalRealtimeArgs,
    private readonly onOutput: (packet: LiveTerminalOutputPacket) => void,
    private readonly onState: (state: LiveTerminalRealtimeState) => void
  ) {}

  async connect() {
    if (this.closed || this.client) return;
    this.onState('connecting');
    try {
      const Ably = await loadAblyBrowser();
      if (this.closed) return;
      this.client = new Ably.Realtime({
        authUrl: terminalAuthUrl(this.args, 'subscribe'),
        useTokenAuth: true,
        closeOnUnload: true,
        echoMessages: false,
      });
      this.channel = this.client.channels.get(liveTerminalChannelName(
        this.args.workspaceId,
        this.args.bindingId,
        this.args.leaseId
      ));
      this.connectionListener = () => {
        if (this.closed || !this.client) return;
        const state = this.client.connection.state;
        if (state === 'connected') this.onState('connected');
        else if (state === 'connecting') this.onState('connecting');
        else if (state === 'failed') this.onState('disabled');
        else this.onState('disconnected');
      };
      this.listener = (message) => {
        const packet = parsePacket(message, this.args);
        if (!packet) return;
        if (this.publisherId !== packet.publisherId) {
          this.publisherId = packet.publisherId;
          this.lastSequence = -1;
        }
        if (packet.sequence <= this.lastSequence) return;
        this.lastSequence = packet.sequence;
        this.onOutput(packet);
      };
      this.client.connection.on(this.connectionListener);
      await this.channel.subscribe('terminal.output', this.listener);
      this.connectionListener();
    } catch {
      if (!this.closed) this.onState('disabled');
      this.close();
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.channel?.unsubscribe();
    if (this.client && this.connectionListener) this.client.connection.off(this.connectionListener);
    this.client?.close();
    this.channel = null;
    this.client = null;
    this.listener = null;
    this.connectionListener = null;
  }
}
