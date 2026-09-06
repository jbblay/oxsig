import type { WebSocketData } from '@vercel/functions';

function dataBuffer(data: WebSocketData): Buffer | null {
  if (typeof data === 'string') return null;
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data.map((part) => Buffer.from(part)));
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  const unknownData: unknown = data;
  if (ArrayBuffer.isView(unknownData)) {
    return Buffer.from(unknownData.buffer, unknownData.byteOffset, unknownData.byteLength);
  }
  return null;
}

/**
 * The browser's only non-input SSM binary frame is a protocol acknowledgement.
 * Everything else, including unknown or malformed binary frames, requires live
 * shared-control authorization before it may be queued or forwarded.
 */
export function terminalFrameRequiresControlRevalidation(data: WebSocketData): boolean {
  const buffer = dataBuffer(data);
  if (!buffer) return false;
  if (buffer.byteLength < 120) return true;
  const messageType = buffer.subarray(4, 36).toString('utf8').replace(/\0/g, '').trim();
  return messageType !== 'acknowledge';
}
