const HEADER_LENGTH = 116;
const PAYLOAD_OFFSET = 120;
const MESSAGE_TYPE_LENGTH = 32;
const DIGEST_LENGTH = 32;
const CLIENT_VERSION = "1.0.0";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const SSM_PAYLOAD = {
  OUTPUT: 1,
  ERROR: 2,
  SIZE: 3,
  PARAMETER: 4,
  HANDSHAKE_REQUEST: 5,
  HANDSHAKE_RESPONSE: 6,
  HANDSHAKE_COMPLETE: 7,
  ENC_CHALLENGE_REQUEST: 8,
  ENC_CHALLENGE_RESPONSE: 9,
  FLAG: 10,
  STDERR: 11,
  EXIT_CODE: 12,
} as const;

export type SsmAgentMessage = {
  headerLength: number;
  messageType: string;
  schemaVersion: number;
  createdDate: number;
  sequenceNumber: number;
  flags: number;
  messageId: string;
  payloadDigest: Uint8Array;
  payloadType: number;
  payloadLength: number;
  payload: Uint8Array;
};

type SsmHandshakeRequest = {
  AgentVersion?: string;
  RequestedClientActions?: Array<{
    ActionType?: string;
    ActionParameters?: unknown;
  }>;
};

type SsmSessionStart = {
  streamUrl: string;
  tokenValue: string;
  sessionId: string;
};

type ChannelCallbacks = {
  onOutput: (data: Uint8Array, payloadType: number) => void;
  onReady: (customerMessage?: string) => void;
  onError: (message: string) => void;
  onClose: (reason?: string) => void;
};

type OutgoingFrame = {
  data: ArrayBuffer;
  lastSentAt: number;
  retries: number;
  sent: boolean;
};

type BufferedIncoming = {
  message: SsmAgentMessage;
  acknowledged: boolean;
};

function bytesEqual(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function uuidToBytes(value: string) {
  const compact = value.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(compact)) throw new Error("Invalid UUID");
  const bytes = new Uint8Array(16);
  for (let index = 0; index < 16; index += 1) {
    bytes[index] = Number.parseInt(compact.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToUuid(value: Uint8Array) {
  const hex = Array.from(value, (item) => item.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function putPaddedString(target: Uint8Array, offset: number, length: number, value: string) {
  const encoded = encoder.encode(value);
  if (encoded.byteLength > length) throw new Error("SSM message type is too long");
  target.fill(0x20, offset, offset + length);
  target.set(encoded, offset);
}

async function sha256(payload: Uint8Array) {
  const copy = new Uint8Array(payload.byteLength);
  copy.set(payload);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", copy.buffer));
}

export async function encodeSsmAgentMessage(input: {
  messageType: string;
  sequenceNumber?: number;
  flags?: number;
  payloadType?: number;
  payload?: Uint8Array;
  messageId?: string;
  createdDate?: number;
}) {
  const payload = input.payload || new Uint8Array();
  const bytes = new Uint8Array(PAYLOAD_OFFSET + payload.byteLength);
  const view = new DataView(bytes.buffer);
  const messageId = input.messageId || crypto.randomUUID();
  const uuid = uuidToBytes(messageId);
  const digest = await sha256(payload);

  view.setUint32(0, HEADER_LENGTH, false);
  putPaddedString(bytes, 4, MESSAGE_TYPE_LENGTH, input.messageType);
  view.setUint32(36, 1, false);
  view.setBigUint64(40, BigInt(input.createdDate ?? Date.now()), false);
  view.setBigInt64(48, BigInt(input.sequenceNumber ?? 0), false);
  view.setBigUint64(56, BigInt(input.flags ?? 0), false);

  // AWS serializes the UUID's least-significant 8 bytes before its most-significant 8 bytes.
  bytes.set(uuid.slice(8, 16), 64);
  bytes.set(uuid.slice(0, 8), 72);
  bytes.set(digest, 80);
  view.setUint32(112, input.payloadType ?? 0, false);
  view.setUint32(116, payload.byteLength, false);
  bytes.set(payload, PAYLOAD_OFFSET);

  return bytes.buffer;
}

export function decodeSsmAgentMessage(buffer: ArrayBuffer): SsmAgentMessage {
  if (buffer.byteLength < PAYLOAD_OFFSET) throw new Error("SSM message is shorter than its header");
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const headerLength = view.getUint32(0, false);
  const payloadLength = view.getUint32(116, false);
  const payloadStart = headerLength + 4;
  const payloadEnd = payloadStart + payloadLength;

  if (headerLength !== HEADER_LENGTH || payloadStart !== PAYLOAD_OFFSET || payloadEnd > bytes.byteLength) {
    throw new Error("SSM message header or payload length is invalid");
  }

  const serializedUuid = bytes.slice(64, 80);
  const uuid = new Uint8Array(16);
  uuid.set(serializedUuid.slice(8, 16), 0);
  uuid.set(serializedUuid.slice(0, 8), 8);

  const sequence = view.getBigInt64(48, false);
  if (sequence > BigInt(Number.MAX_SAFE_INTEGER) || sequence < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error("SSM sequence number is outside the browser safe-integer range");
  }

  return {
    headerLength,
    messageType: decoder.decode(bytes.slice(4, 36)).replace(/\0/g, "").trim(),
    schemaVersion: view.getUint32(36, false),
    createdDate: Number(view.getBigUint64(40, false)),
    sequenceNumber: Number(sequence),
    flags: Number(view.getBigUint64(56, false)),
    messageId: bytesToUuid(uuid),
    payloadDigest: bytes.slice(80, 112),
    payloadType: view.getUint32(112, false),
    payloadLength,
    payload: bytes.slice(payloadStart, payloadEnd),
  };
}

export async function validateSsmAgentMessage(message: SsmAgentMessage) {
  return bytesEqual(await sha256(message.payload), message.payloadDigest);
}

export async function buildSsmAcknowledge(message: SsmAgentMessage) {
  const payload = encoder.encode(JSON.stringify({
    AcknowledgedMessageType: message.messageType,
    AcknowledgedMessageId: message.messageId,
    AcknowledgedMessageSequenceNumber: message.sequenceNumber,
    IsSequentialMessage: true,
  }));

  return encodeSsmAgentMessage({
    messageType: "acknowledge",
    sequenceNumber: 0,
    flags: 3,
    payload,
  });
}

export function buildOpenDataChannelMessage(tokenValue: string, clientId = crypto.randomUUID()) {
  return JSON.stringify({
    MessageSchemaVersion: "1.0",
    RequestId: crypto.randomUUID(),
    TokenValue: tokenValue,
    ClientId: clientId,
    ClientVersion: CLIENT_VERSION,
  });
}

export function buildHandshakeResponse(request: SsmHandshakeRequest) {
  const errors: string[] = [];
  let kmsRequested = false;
  const processed = (request.RequestedClientActions || []).map((action) => {
    if (action.ActionType === "SessionType") {
      return { ActionType: "SessionType", ActionStatus: 1, ActionResult: null, Error: "" };
    }
    if (action.ActionType === "KMSEncryption") {
      kmsRequested = true;
      const error = "KMS-encrypted Session Manager streams are not supported by the Oxsig browser terminal MVP.";
      errors.push(error);
      return { ActionType: "KMSEncryption", ActionStatus: 2, ActionResult: null, Error: error };
    }

    const error = `Unsupported Session Manager handshake action: ${action.ActionType || "unknown"}`;
    errors.push(error);
    return { ActionType: action.ActionType || "unknown", ActionStatus: 3, ActionResult: null, Error: error };
  });

  return {
    response: {
      ClientVersion: CLIENT_VERSION,
      ProcessedClientActions: processed,
      Errors: errors,
    },
    kmsRequested,
  };
}

export class SsmBrowserDataChannel {
  private socket: WebSocket | null = null;
  private callbacks: ChannelCallbacks;
  private outgoingSequence = 0;
  private expectedIncomingSequence = 0;
  private incomingBuffer = new Map<number, BufferedIncoming>();
  private outgoingBuffer = new Map<number, OutgoingFrame>();
  private paused = false;
  private ready = false;
  private closed = false;
  private receiveChain: Promise<void> = Promise.resolve();
  private sendChain: Promise<void> = Promise.resolve();
  private resendTimer: ReturnType<typeof setInterval> | null = null;

  constructor(callbacks: ChannelCallbacks) {
    this.callbacks = callbacks;
  }

  connect(session: SsmSessionStart) {
    if (this.socket) throw new Error("SSM browser channel is already open");
    this.closed = false;
    const socket = new WebSocket(session.streamUrl);
    socket.binaryType = "arraybuffer";
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

    socket.onerror = () => this.fail(new Error("The AWS Session Manager WebSocket reported a connection error."));
    socket.onclose = (event) => {
      this.stopResendScheduler();
      this.socket = null;
      const wasClosed = this.closed;
      this.closed = true;
      this.ready = false;
      this.callbacks.onClose(wasClosed ? undefined : event.reason || "The AWS terminal data channel closed.");
    };
  }

  isReady() {
    return this.ready && this.socket?.readyState === WebSocket.OPEN;
  }

  sendInput(data: string) {
    if (!this.isReady()) return;
    const normalized = data === "\n" ? "\r" : data;
    void this.enqueueStream(SSM_PAYLOAD.OUTPUT, encoder.encode(normalized));
  }

  resize(cols: number, rows: number) {
    if (!this.isReady() || cols < 1 || rows < 1) return;
    const payload = encoder.encode(JSON.stringify({ cols, rows }));
    void this.enqueueStream(SSM_PAYLOAD.SIZE, payload);
  }

  close() {
    this.closed = true;
    this.ready = false;
    this.stopResendScheduler();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, "Oxsig terminal closed");
  }

  private async handleSocketMessage(raw: unknown) {
    if (typeof raw === "string") return;
    let buffer: ArrayBuffer;
    if (raw instanceof ArrayBuffer) {
      buffer = raw;
    } else if (typeof Blob !== "undefined" && raw instanceof Blob) {
      buffer = await raw.arrayBuffer();
    } else {
      throw new Error("AWS returned an unsupported terminal message type");
    }

    const message = decodeSsmAgentMessage(buffer);
    if (!(await validateSsmAgentMessage(message))) throw new Error("AWS terminal message digest validation failed");

    if (message.messageType === "acknowledge") {
      this.handleAcknowledge(message);
      return;
    }
    if (message.messageType === "pause_publication") {
      this.paused = true;
      return;
    }
    if (message.messageType === "start_publication") {
      this.paused = false;
      this.flushPausedFrames();
      return;
    }
    if (message.messageType === "channel_closed") {
      let reason = "AWS ended the Session Manager channel.";
      try {
        const body = JSON.parse(decoder.decode(message.payload));
        reason = body.Output || reason;
      } catch {
        // Keep the generic close reason.
      }
      this.callbacks.onClose(reason);
      this.close();
      return;
    }
    if (message.messageType !== "output_stream_data") return;

    await this.handleSequencedIncoming(message);
  }

  private handleAcknowledge(message: SsmAgentMessage) {
    try {
      const body = JSON.parse(decoder.decode(message.payload));
      const sequence = Number(body.AcknowledgedMessageSequenceNumber);
      if (Number.isSafeInteger(sequence)) this.outgoingBuffer.delete(sequence);
    } catch {
      // An invalid ACK cannot corrupt terminal output; retransmission will recover the frame.
    }
  }

  private async handleSequencedIncoming(message: SsmAgentMessage) {
    if (message.sequenceNumber < this.expectedIncomingSequence) {
      await this.sendAcknowledge(message);
      return;
    }

    if (message.sequenceNumber > this.expectedIncomingSequence) {
      if (this.incomingBuffer.size < 1000 && !this.incomingBuffer.has(message.sequenceNumber)) {
        await this.sendAcknowledge(message);
        this.incomingBuffer.set(message.sequenceNumber, { message, acknowledged: true });
      }
      return;
    }

    await this.processIncoming(message, false);
    this.expectedIncomingSequence += 1;

    while (this.incomingBuffer.has(this.expectedIncomingSequence)) {
      const buffered = this.incomingBuffer.get(this.expectedIncomingSequence)!;
      this.incomingBuffer.delete(this.expectedIncomingSequence);
      await this.processIncoming(buffered.message, buffered.acknowledged);
      this.expectedIncomingSequence += 1;
    }
  }

  private async processIncoming(message: SsmAgentMessage, alreadyAcknowledged: boolean) {
    if (!alreadyAcknowledged) await this.sendAcknowledge(message);

    if (message.payloadType === SSM_PAYLOAD.HANDSHAKE_REQUEST) {
      const request = JSON.parse(decoder.decode(message.payload)) as SsmHandshakeRequest;
      const { response, kmsRequested } = buildHandshakeResponse(request);
      await this.enqueueStream(SSM_PAYLOAD.HANDSHAKE_RESPONSE, encoder.encode(JSON.stringify(response)));
      if (kmsRequested) {
        throw new Error("This AWS account requested KMS-encrypted Session Manager traffic, which the browser terminal MVP does not support.");
      }
      return;
    }

    if (message.payloadType === SSM_PAYLOAD.HANDSHAKE_COMPLETE) {
      let customerMessage: string | undefined;
      try {
        const body = JSON.parse(decoder.decode(message.payload));
        customerMessage = typeof body.CustomerMessage === "string" ? body.CustomerMessage : undefined;
      } catch {
        // Handshake completion itself is sufficient.
      }
      this.ready = true;
      this.callbacks.onReady(customerMessage);
      return;
    }

    if (message.payloadType === SSM_PAYLOAD.ENC_CHALLENGE_REQUEST) {
      throw new Error("AWS requested a KMS encryption challenge that the Oxsig browser terminal MVP does not support.");
    }

    if (
      message.payloadType === SSM_PAYLOAD.OUTPUT ||
      message.payloadType === SSM_PAYLOAD.STDERR ||
      message.payloadType === SSM_PAYLOAD.ERROR ||
      message.payloadType === SSM_PAYLOAD.EXIT_CODE
    ) {
      this.callbacks.onOutput(message.payload, message.payloadType);
    }
  }

  private async sendAcknowledge(message: SsmAgentMessage) {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(await buildSsmAcknowledge(message));
  }

  private enqueueStream(payloadType: number, payload: Uint8Array) {
    const task = this.sendChain.then(() => this.sendStreamNow(payloadType, payload));
    this.sendChain = task.catch((error) => this.fail(error));
    return task;
  }

  private async sendStreamNow(payloadType: number, payload: Uint8Array) {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error("AWS terminal WebSocket is not connected");
    const sequence = this.outgoingSequence;
    this.outgoingSequence += 1;
    const data = await encodeSsmAgentMessage({
      messageType: "input_stream_data",
      sequenceNumber: sequence,
      flags: 0,
      payloadType,
      payload,
    });
    const frame: OutgoingFrame = { data, lastSentAt: 0, retries: 0, sent: false };
    this.outgoingBuffer.set(sequence, frame);
    if (!this.paused) this.sendOutgoingFrame(frame);
  }

  private sendOutgoingFrame(frame: OutgoingFrame) {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(frame.data);
    frame.sent = true;
    frame.lastSentAt = Date.now();
  }

  private flushPausedFrames() {
    for (const frame of this.outgoingBuffer.values()) {
      if (!frame.sent) this.sendOutgoingFrame(frame);
    }
  }

  private startResendScheduler() {
    this.stopResendScheduler();
    this.resendTimer = setInterval(() => {
      if (this.paused) return;
      const now = Date.now();
      for (const frame of this.outgoingBuffer.values()) {
        if (!frame.sent) {
          this.sendOutgoingFrame(frame);
          continue;
        }
        if (now - frame.lastSentAt < 3000) continue;
        if (frame.retries >= 5) {
          this.fail(new Error("AWS did not acknowledge terminal input after repeated retries."));
          return;
        }
        frame.retries += 1;
        this.sendOutgoingFrame(frame);
      }
    }, 1000);
  }

  private stopResendScheduler() {
    if (this.resendTimer) clearInterval(this.resendTimer);
    this.resendTimer = null;
  }

  private fail(error: unknown) {
    const message = error instanceof Error ? error.message : "Interactive AWS terminal failed";
    this.callbacks.onError(message);
    this.close();
  }
}
