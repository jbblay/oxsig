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
 * Shared-control authorization applies to terminal input frames. Initial
 * Session Manager open-channel JSON and protocol acknowledgements do not carry
 * user terminal input. Unknown/malformed binary frames fail closed.
 */
export function terminalFrameRequiresControlRevalidation(data: WebSocketData): boolean {
  const buffer = dataBuffer(data);
  if (!buffer) return false;
  if (buffer.byteLength < 120) return true;
  const messageType = buffer.subarray(4, 36).toString('utf8').replace(/\0/g, '').trim();
  return messageType === 'input_stream_data';
}
