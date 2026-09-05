import {
  SSM_PAYLOAD,
  buildHandshakeResponse,
  buildOpenDataChannelMessage,
  buildSsmAcknowledge,
  decodeSsmAgentMessage,
  encodeSsmAgentMessage,
  validateSsmAgentMessage,
  type SsmAgentMessage,
} from './ssm-browser-channel';

type PortSessionStart = {
  streamUrl: string;
  tokenValue: string;
  sessionId: string;
};

type PortCallbacks = {
  onData: (data: Uint8Array) => void;
  onReady: () => void;
  onError: (message: string) => void;
  onClose: (reason?: string) => void;
};

type OutgoingFrame = {
  data: ArrayBuffer;
  lastSentAt: number;
  retries: number;
  sent: boolean;
};

export class SsmBrowserPortChannel {
  private socket: WebSocket | null = null;
  private callbacks: PortCallbacks;
  private outgoingSequence = 0;
  private expectedIncomingSequence = 0;
  private incoming = new Map<number, SsmAgentMessage>();
  private outgoing = new Map<number, OutgoingFrame>();
  private paused = false;
  private ready = false;
  private intentionallyClosed = false;
  private receiveChain: Promise<void> = Promise.resolve();
  private sendChain: Promise<void> = Promise.resolve();
  private resendTimer: ReturnType<typeof setInterval> | null = null;

  constructor(callbacks: PortCallbacks) {
    this.callbacks = callbacks;
  }

  connect(session: PortSessionStart) {
    if (this.socket) throw new Error('SSM browser port channel is already open');
    this.intentionallyClosed = false;
    const socket = new WebSocket(session.streamUrl);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;

    socket.onopen = () => {
      socket.send(buildOpenDataChannelMessage(session.tokenValue));
      this.startResendScheduler();
    };
    socket.onmessage = (event) => {
      this.receiveChain = this.receiveChain
        .then(() => this.handleSocketMessage(event.data))
        .catch((error) => this.fail(error));
    };
    socket.onerror = () => this.fail(new Error('The AWS Session Manager desktop tunnel reported a connection error.'));
    socket.onclose = (event) => {
      this.stopResendScheduler();
      this.socket = null;
      this.ready = false;
      this.callbacks.onClose(this.intentionallyClosed ? undefined : event.reason || 'The private desktop tunnel closed.');
    };
  }

  isReady() {
    return this.ready && this.socket?.readyState === WebSocket.OPEN;
  }

  send(data: Uint8Array) {
    if (!this.isReady() || !data.byteLength) return;
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    const task = this.sendChain.then(() => this.sendNow(copy));
    this.sendChain = task.catch((error) => this.fail(error));
  }

  close() {
    this.intentionallyClosed = true;
    this.ready = false;
    this.stopResendScheduler();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'Oxsig desktop closed');
  }

  private markReady() {
    if (this.ready) return;
    this.ready = true;
    this.callbacks.onReady();
  }

  private async handleSocketMessage(raw: unknown) {
    if (typeof raw === 'string') return;
    let buffer: ArrayBuffer;
    if (raw instanceof ArrayBuffer) buffer = raw;
    else if (typeof Blob !== 'undefined' && raw instanceof Blob) buffer = await raw.arrayBuffer();
    else throw new Error('AWS returned an unsupported desktop tunnel message type');

    const message = decodeSsmAgentMessage(buffer);
    if (!(await validateSsmAgentMessage(message))) throw new Error('AWS desktop tunnel message digest validation failed');

    if (message.messageType === 'acknowledge') {
      this.handleAcknowledge(message);
      return;
    }
    if (message.messageType === 'pause_publication') {
      this.paused = true;
      return;
    }
    if (message.messageType === 'start_publication') {
      this.paused = false;
      this.flushPausedFrames();
      return;
    }
    if (message.messageType === 'channel_closed') {
      let reason = 'AWS ended the private desktop tunnel.';
      try {
        const body = JSON.parse(new TextDecoder().decode(message.payload));
        reason = body.Output || reason;
      } catch {
        // Keep generic close reason.
      }
      this.callbacks.onClose(reason);
      this.close();
      return;
    }
    if (message.messageType !== 'output_stream_data') return;
    await this.handleSequencedIncoming(message);
  }

  private handleAcknowledge(message: SsmAgentMessage) {
    try {
      const body = JSON.parse(new TextDecoder().decode(message.payload));
      const sequence = Number(body.AcknowledgedMessageSequenceNumber);
      if (Number.isSafeInteger(sequence)) this.outgoing.delete(sequence);
    } catch {
      // Retransmission handles malformed acknowledgements safely.
    }
  }

  private async handleSequencedIncoming(message: SsmAgentMessage) {
    if (message.sequenceNumber < this.expectedIncomingSequence) {
      await this.sendAcknowledge(message);
      return;
    }
    if (message.sequenceNumber > this.expectedIncomingSequence) {
      if (this.incoming.size < 1000 && !this.incoming.has(message.sequenceNumber)) {
        await this.sendAcknowledge(message);
        this.incoming.set(message.sequenceNumber, message);
      }
      return;
    }

    await this.processIncoming(message, false);
    this.expectedIncomingSequence += 1;
    while (this.incoming.has(this.expectedIncomingSequence)) {
      const buffered = this.incoming.get(this.expectedIncomingSequence)!;
      this.incoming.delete(this.expectedIncomingSequence);
      await this.processIncoming(buffered, true);
      this.expectedIncomingSequence += 1;
    }
  }

  private async processIncoming(message: SsmAgentMessage, alreadyAcknowledged: boolean) {
    if (!alreadyAcknowledged) await this.sendAcknowledge(message);

    if (message.payloadType === SSM_PAYLOAD.HANDSHAKE_REQUEST) {
      const request = JSON.parse(new TextDecoder().decode(message.payload));
      const { response, kmsRequested } = buildHandshakeResponse(request);
      await this.enqueueProtocol(SSM_PAYLOAD.HANDSHAKE_RESPONSE, new TextEncoder().encode(JSON.stringify(response)));
      if (kmsRequested) throw new Error('KMS-encrypted Session Manager streams are not supported by the browser desktop tunnel.');
      return;
    }
    if (message.payloadType === SSM_PAYLOAD.HANDSHAKE_COMPLETE) {
      this.markReady();
      return;
    }
    if (message.payloadType === SSM_PAYLOAD.ENC_CHALLENGE_REQUEST) {
      throw new Error('AWS requested an unsupported KMS encryption challenge for the desktop tunnel.');
    }
    if (message.payloadType === SSM_PAYLOAD.OUTPUT) {
      this.markReady();
      this.callbacks.onData(message.payload);
      return;
    }
    if (message.payloadType === SSM_PAYLOAD.ERROR || message.payloadType === SSM_PAYLOAD.STDERR) {
      const detail = new TextDecoder().decode(message.payload).trim();
      if (detail) throw new Error(detail);
    }
  }

  private async sendAcknowledge(message: SsmAgentMessage) {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(await buildSsmAcknowledge(message));
  }

  private enqueueProtocol(payloadType: number, payload: Uint8Array) {
    const task = this.sendChain.then(() => this.sendNow(payload, payloadType));
    this.sendChain = task.catch((error) => this.fail(error));
    return task;
  }

  private async sendNow(payload: Uint8Array, payloadType: number = SSM_PAYLOAD.OUTPUT) {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('AWS desktop tunnel WebSocket is not connected');
    const sequence = this.outgoingSequence++;
    const data = await encodeSsmAgentMessage({
      messageType: 'input_stream_data',
      sequenceNumber: sequence,
      flags: 0,
      payloadType,
      payload,
    });
    const frame: OutgoingFrame = { data, lastSentAt: 0, retries: 0, sent: false };
    this.outgoing.set(sequence, frame);
    if (!this.paused) this.sendFrame(frame);
  }

  private sendFrame(frame: OutgoingFrame) {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(frame.data);
    frame.sent = true;
    frame.lastSentAt = Date.now();
  }

  private flushPausedFrames() {
    for (const frame of this.outgoing.values()) if (!frame.sent) this.sendFrame(frame);
  }

  private startResendScheduler() {
    this.stopResendScheduler();
    this.resendTimer = setInterval(() => {
      if (this.paused) return;
      const now = Date.now();
      for (const frame of this.outgoing.values()) {
        if (!frame.sent) {
          this.sendFrame(frame);
          continue;
        }
        if (now - frame.lastSentAt < 3000) continue;
        if (frame.retries >= 5) {
          this.fail(new Error('AWS did not acknowledge desktop input after repeated retries.'));
          return;
        }
        frame.retries += 1;
        this.sendFrame(frame);
      }
    }, 1000);
  }

  private stopResendScheduler() {
    if (this.resendTimer) clearInterval(this.resendTimer);
    this.resendTimer = null;
  }

  private fail(error: unknown) {
    const message = error instanceof Error ? error.message : 'Private browser desktop failed';
    this.callbacks.onError(message);
    this.close();
  }
}
