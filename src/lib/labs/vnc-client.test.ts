import { describe, expect, it, vi } from 'vitest';
import { RfbClient } from './vnc-client';

const encoder = new TextEncoder();

function serverInit(width: number, height: number, name: string) {
  const nameBytes = encoder.encode(name);
  const bytes = new Uint8Array(24 + nameBytes.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, width, false);
  view.setUint16(2, height, false);
  bytes[4] = 32;
  bytes[5] = 24;
  bytes[6] = 0;
  bytes[7] = 1;
  view.setUint16(8, 255, false);
  view.setUint16(10, 255, false);
  view.setUint16(12, 255, false);
  bytes[14] = 16;
  bytes[15] = 8;
  bytes[16] = 0;
  view.setUint32(20, nameBytes.byteLength, false);
  bytes.set(nameBytes, 24);
  return bytes;
}

function framebufferRaw(bgra: [number, number, number, number]) {
  const bytes = new Uint8Array(4 + 12 + 4);
  const view = new DataView(bytes.buffer);
  bytes[0] = 0;
  bytes[1] = 0;
  view.setUint16(2, 1, false);
  view.setUint16(4, 0, false);
  view.setUint16(6, 0, false);
  view.setUint16(8, 1, false);
  view.setUint16(10, 1, false);
  view.setInt32(12, 0, false);
  bytes.set(bgra, 16);
  return bytes;
}

describe('RFB browser desktop client', () => {
  it('negotiates RFB 3.8, requests raw truecolor frames, and renders BGRX pixels as RGBA', () => {
    const sent: Uint8Array[] = [];
    let rendered: Uint8ClampedArray | null = null;
    const putImageData = vi.fn((image: ImageData) => {
      rendered = new Uint8ClampedArray(image.data);
    });
    const context = {
      fillStyle: '',
      fillRect: vi.fn(),
      createImageData: (width: number, height: number) => ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
      }),
      putImageData,
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
    } as unknown as HTMLCanvasElement;
    const connected = vi.fn();

    const client = new RfbClient(canvas, (bytes) => sent.push(new Uint8Array(bytes)), { onConnected: connected });

    client.feed(encoder.encode('RFB 003.008\n'));
    expect(new TextDecoder().decode(sent.shift())).toBe('RFB 003.008\n');

    client.feed(Uint8Array.of(1, 1));
    expect(Array.from(sent.shift() || [])).toEqual([1]);

    client.feed(Uint8Array.of(0, 0, 0, 0));
    expect(Array.from(sent.shift() || [])).toEqual([1]);

    client.feed(serverInit(2, 1, 'Oxsig Test Desktop'));
    expect(canvas.width).toBe(2);
    expect(canvas.height).toBe(1);
    expect(connected).toHaveBeenCalledWith({ width: 2, height: 1, name: 'Oxsig Test Desktop' });

    const pixelFormat = sent.shift();
    const encodings = sent.shift();
    const fullUpdate = sent.shift();
    expect(pixelFormat?.[0]).toBe(0);
    expect(pixelFormat?.[4]).toBe(32);
    expect(pixelFormat?.[7]).toBe(1);
    expect(encodings?.[0]).toBe(2);
    expect(new DataView(encodings!.buffer, encodings!.byteOffset, encodings!.byteLength).getInt32(4, false)).toBe(0);
    expect(new DataView(encodings!.buffer, encodings!.byteOffset, encodings!.byteLength).getInt32(8, false)).toBe(-223);
    expect(fullUpdate?.[0]).toBe(3);
    expect(fullUpdate?.[1]).toBe(0);

    client.feed(framebufferRaw([0x11, 0x22, 0x33, 0x00]));
    expect(putImageData).toHaveBeenCalledTimes(1);
    expect(Array.from(rendered || [])).toEqual([0x33, 0x22, 0x11, 0xff]);

    const incremental = sent.shift();
    expect(incremental?.[0]).toBe(3);
    expect(incremental?.[1]).toBe(1);
  });

  it('sends keyboard and pointer input only after the desktop is ready', () => {
    const sent: Uint8Array[] = [];
    const context = {
      fillStyle: '',
      fillRect: vi.fn(),
      createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: vi.fn(),
    };
    const canvas = { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
    const client = new RfbClient(canvas, (bytes) => sent.push(new Uint8Array(bytes)));

    client.key('Enter', true);
    client.pointer(1, 1, 1);
    expect(sent).toHaveLength(0);

    client.feed(encoder.encode('RFB 003.008\n'));
    client.feed(Uint8Array.of(1, 1));
    client.feed(Uint8Array.of(0, 0, 0, 0));
    client.feed(serverInit(100, 50, 'Desktop'));
    sent.length = 0;

    client.key('Enter', true);
    client.pointer(25, 10, 1);

    expect(sent).toHaveLength(2);
    expect(sent[0][0]).toBe(4);
    expect(sent[0][1]).toBe(1);
    expect(new DataView(sent[0].buffer, sent[0].byteOffset, sent[0].byteLength).getUint32(4, false)).toBe(0xff0d);
    expect(sent[1][0]).toBe(5);
    expect(sent[1][1]).toBe(1);
    expect(new DataView(sent[1].buffer, sent[1].byteOffset, sent[1].byteLength).getUint16(2, false)).toBe(25);
    expect(new DataView(sent[1].buffer, sent[1].byteOffset, sent[1].byteLength).getUint16(4, false)).toBe(10);
  });
});
