type RfbCallbacks = {
  onConnected?: (info: { width: number; height: number; name: string }) => void;
  onResize?: (width: number, height: number) => void;
  onError?: (message: string) => void;
};

type RawRect = { x: number; y: number; width: number; height: number };

type QueueChunk = { bytes: Uint8Array; offset: number };

class ByteQueue {
  private chunks: QueueChunk[] = [];
  private length = 0;

  get available() { return this.length; }

  push(bytes: Uint8Array) {
    if (!bytes.byteLength) return;
    this.chunks.push({ bytes, offset: 0 });
    this.length += bytes.byteLength;
  }

  peek(length: number) {
    if (length > this.length) throw new Error('RFB buffer underflow');
    const output = new Uint8Array(length);
    let written = 0;
    for (const chunk of this.chunks) {
      const count = Math.min(length - written, chunk.bytes.byteLength - chunk.offset);
      output.set(chunk.bytes.subarray(chunk.offset, chunk.offset + count), written);
      written += count;
      if (written === length) break;
    }
    return output;
  }

  read(length: number) {
    const output = this.peek(length);
    let remaining = length;
    while (remaining > 0) {
      const chunk = this.chunks[0];
      const count = Math.min(remaining, chunk.bytes.byteLength - chunk.offset);
      chunk.offset += count;
      remaining -= count;
      this.length -= count;
      if (chunk.offset >= chunk.bytes.byteLength) this.chunks.shift();
    }
    return output;
  }
}

function u16(bytes: Uint8Array, offset = 0) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function u32(bytes: Uint8Array, offset = 0) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false);
}

function i32(bytes: Uint8Array, offset = 0) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getInt32(0, false);
}

function setU16(bytes: Uint8Array, offset: number, value: number) {
  new DataView(bytes.buffer).setUint16(offset, value, false);
}

function setU32(bytes: Uint8Array, offset: number, value: number) {
  new DataView(bytes.buffer).setUint32(offset, value >>> 0, false);
}

function setI32(bytes: Uint8Array, offset: number, value: number) {
  new DataView(bytes.buffer).setInt32(offset, value, false);
}

function keysymForKey(key: string) {
  const special: Record<string, number> = {
    Backspace: 0xff08,
    Tab: 0xff09,
    Enter: 0xff0d,
    Escape: 0xff1b,
    Home: 0xff50,
    ArrowLeft: 0xff51,
    ArrowUp: 0xff52,
    ArrowRight: 0xff53,
    ArrowDown: 0xff54,
    PageUp: 0xff55,
    PageDown: 0xff56,
    End: 0xff57,
    Insert: 0xff63,
    Delete: 0xffff,
    Shift: 0xffe1,
    Control: 0xffe3,
    Meta: 0xffeb,
    Alt: 0xffe9,
  };
  if (special[key]) return special[key];
  if (/^F(?:[1-9]|1[0-2])$/.test(key)) return 0xffbd + Number(key.slice(1));
  const codePoint = Array.from(key)[0]?.codePointAt(0);
  if (codePoint === undefined) return null;
  if (codePoint <= 0xff) return codePoint;
  return 0x01000000 | codePoint;
}

export class RfbClient {
  private queue = new ByteQueue();
  private state: 'version' | 'security' | 'security-result' | 'server-init' | 'normal' | 'closed' = 'version';
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sendBytes: (bytes: Uint8Array) => void;
  private callbacks: RfbCallbacks;
  private width = 0;
  private height = 0;
  private rectanglesRemaining = 0;
  private rawRect: RawRect | null = null;
  private name = '';
  private pointerMask = 0;

  constructor(canvas: HTMLCanvasElement, sendBytes: (bytes: Uint8Array) => void, callbacks: RfbCallbacks = {}) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is unavailable for the browser desktop');
    this.canvas = canvas;
    this.ctx = ctx;
    this.sendBytes = sendBytes;
    this.callbacks = callbacks;
  }

  feed(bytes: Uint8Array) {
    if (this.state === 'closed') return;
    this.queue.push(bytes);
    try {
      while (this.processOne()) {
        // Continue while at least one complete protocol unit was consumed.
      }
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'The VNC protocol stream is invalid');
    }
  }

  close() {
    this.state = 'closed';
  }

  key(key: string, down: boolean) {
    if (this.state !== 'normal') return;
    const keysym = keysymForKey(key);
    if (keysym === null) return;
    const message = new Uint8Array(8);
    message[0] = 4;
    message[1] = down ? 1 : 0;
    setU32(message, 4, keysym);
    this.sendBytes(message);
  }

  sendCtrlAltDelete() {
    for (const key of ['Control', 'Alt', 'Delete']) this.key(key, true);
    for (const key of ['Delete', 'Alt', 'Control']) this.key(key, false);
  }

  pointer(x: number, y: number, buttons: number) {
    if (this.state !== 'normal' || !this.width || !this.height) return;
    const message = new Uint8Array(6);
    message[0] = 5;
    message[1] = buttons & 0xff;
    setU16(message, 2, Math.max(0, Math.min(this.width - 1, Math.round(x))));
    setU16(message, 4, Math.max(0, Math.min(this.height - 1, Math.round(y))));
    this.sendBytes(message);
  }

  setPointerButton(button: number, down: boolean, x: number, y: number) {
    const mask = button === 0 ? 1 : button === 1 ? 2 : button === 2 ? 4 : 0;
    this.pointerMask = down ? this.pointerMask | mask : this.pointerMask & ~mask;
    this.pointer(x, y, this.pointerMask);
  }

  wheel(deltaY: number, x: number, y: number) {
    const mask = deltaY < 0 ? 8 : 16;
    this.pointer(x, y, this.pointerMask | mask);
    this.pointer(x, y, this.pointerMask);
  }

  private processOne(): boolean {
    if (this.state === 'version') return this.processVersion();
    if (this.state === 'security') return this.processSecurity();
    if (this.state === 'security-result') return this.processSecurityResult();
    if (this.state === 'server-init') return this.processServerInit();
    if (this.state === 'normal') return this.processNormal();
    return false;
  }

  private processVersion() {
    if (this.queue.available < 12) return false;
    const version = new TextDecoder().decode(this.queue.read(12));
    if (!/^RFB 003\.\d{3}\n$/.test(version)) throw new Error('The remote desktop did not speak a supported RFB protocol');
    this.sendBytes(new TextEncoder().encode('RFB 003.008\n'));
    this.state = 'security';
    return true;
  }

  private processSecurity() {
    if (this.queue.available < 1) return false;
    const count = this.queue.peek(1)[0];
    if (count === 0) {
      if (this.queue.available < 5) return false;
      const header = this.queue.peek(5);
      const length = u32(header, 1);
      if (this.queue.available < 5 + length) return false;
      this.queue.read(1);
      this.queue.read(4);
      const reason = new TextDecoder().decode(this.queue.read(length));
      throw new Error(reason || 'The desktop server rejected RFB security negotiation');
    }
    if (this.queue.available < 1 + count) return false;
    this.queue.read(1);
    const types = this.queue.read(count);
    if (!types.includes(1)) throw new Error('The private desktop requires an unsupported VNC authentication mode');
    this.sendBytes(Uint8Array.of(1));
    this.state = 'security-result';
    return true;
  }

  private processSecurityResult() {
    if (this.queue.available < 4) return false;
    const status = u32(this.queue.peek(4));
    if (status !== 0) {
      if (this.queue.available < 8) return false;
      const length = u32(this.queue.peek(8), 4);
      if (this.queue.available < 8 + length) return false;
      this.queue.read(4);
      this.queue.read(4);
      const reason = new TextDecoder().decode(this.queue.read(length));
      throw new Error(reason || 'The VNC server rejected the private desktop session');
    }
    this.queue.read(4);
    this.sendBytes(Uint8Array.of(1));
    this.state = 'server-init';
    return true;
  }

  private processServerInit() {
    if (this.queue.available < 24) return false;
    const header = this.queue.peek(24);
    const nameLength = u32(header, 20);
    if (nameLength > 64 * 1024) throw new Error('The VNC desktop name is unexpectedly large');
    if (this.queue.available < 24 + nameLength) return false;
    const init = this.queue.read(24);
    this.width = u16(init, 0);
    this.height = u16(init, 2);
    this.name = new TextDecoder().decode(this.queue.read(nameLength));
    if (!this.width || !this.height || this.width > 8192 || this.height > 8192) throw new Error('The VNC framebuffer dimensions are invalid');
    this.resizeCanvas(this.width, this.height);
    this.sendPixelFormat();
    this.sendEncodings();
    this.requestUpdate(false);
    this.state = 'normal';
    this.callbacks.onConnected?.({ width: this.width, height: this.height, name: this.name });
    return true;
  }

  private processNormal() {
    if (this.rawRect) {
      const byteLength = this.rawRect.width * this.rawRect.height * 4;
      if (this.queue.available < byteLength) return false;
      this.drawRaw(this.rawRect, this.queue.read(byteLength));
      this.rawRect = null;
      this.rectanglesRemaining -= 1;
      if (this.rectanglesRemaining === 0) this.requestUpdate(true);
      return true;
    }

    if (this.rectanglesRemaining > 0) {
      if (this.queue.available < 12) return false;
      const header = this.queue.read(12);
      const rect = { x: u16(header, 0), y: u16(header, 2), width: u16(header, 4), height: u16(header, 6) };
      const encoding = i32(header, 8);
      if (encoding === 0) {
        this.rawRect = rect;
        return true;
      }
      if (encoding === -223) {
        this.width = rect.width;
        this.height = rect.height;
        this.resizeCanvas(this.width, this.height);
        this.rectanglesRemaining -= 1;
        if (this.rectanglesRemaining === 0) this.requestUpdate(false);
        return true;
      }
      throw new Error(`The VNC server selected unsupported framebuffer encoding ${encoding}`);
    }

    if (this.queue.available < 1) return false;
    const messageType = this.queue.peek(1)[0];
    if (messageType === 0) {
      if (this.queue.available < 4) return false;
      const header = this.queue.read(4);
      this.rectanglesRemaining = u16(header, 2);
      if (this.rectanglesRemaining === 0) this.requestUpdate(true);
      return true;
    }
    if (messageType === 2) {
      this.queue.read(1);
      return true;
    }
    if (messageType === 3) {
      if (this.queue.available < 8) return false;
      const header = this.queue.peek(8);
      const length = u32(header, 4);
      if (length > 4 * 1024 * 1024) throw new Error('The VNC clipboard payload is unexpectedly large');
      if (this.queue.available < 8 + length) return false;
      this.queue.read(8 + length);
      return true;
    }
    throw new Error(`Unsupported VNC server message type ${messageType}`);
  }

  private sendPixelFormat() {
    const message = new Uint8Array(20);
    message[0] = 0;
    message[4] = 32;
    message[5] = 24;
    message[6] = 0;
    message[7] = 1;
    setU16(message, 8, 255);
    setU16(message, 10, 255);
    setU16(message, 12, 255);
    message[14] = 16;
    message[15] = 8;
    message[16] = 0;
    this.sendBytes(message);
  }

  private sendEncodings() {
    const message = new Uint8Array(12);
    message[0] = 2;
    setU16(message, 2, 2);
    setI32(message, 4, 0);
    setI32(message, 8, -223);
    this.sendBytes(message);
  }

  private requestUpdate(incremental: boolean) {
    if (!this.width || !this.height) return;
    const message = new Uint8Array(10);
    message[0] = 3;
    message[1] = incremental ? 1 : 0;
    setU16(message, 6, this.width);
    setU16(message, 8, this.height);
    this.sendBytes(message);
  }

  private resizeCanvas(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, width, height);
    this.callbacks.onResize?.(width, height);
  }

  private drawRaw(rect: RawRect, raw: Uint8Array) {
    const image = this.ctx.createImageData(rect.width, rect.height);
    for (let source = 0, target = 0; source < raw.byteLength; source += 4, target += 4) {
      image.data[target] = raw[source + 2];
      image.data[target + 1] = raw[source + 1];
      image.data[target + 2] = raw[source];
      image.data[target + 3] = 255;
    }
    this.ctx.putImageData(image, rect.x, rect.y);
  }

  private fail(message: string) {
    this.state = 'closed';
    this.callbacks.onError?.(message);
  }
}
