import { verifyAsync } from '@noble/ed25519';

function decodeBase64(value: string, expectedLength: number): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length !== expectedLength) return null;
  const canonical = bytes.toString('base64').replace(/=+$/g, '');
  if (canonical !== value.replace(/=+$/g, '')) return null;
  return bytes;
}

function decodeSha256(value: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(value)) return null;
  return Buffer.from(value, 'hex');
}

export async function verifyEd25519DocumentSignature(input: {
  signatureData: string;
  publicKey: string;
  contentHash: string;
}): Promise<boolean> {
  const signature = decodeBase64(input.signatureData, 64);
  const publicKey = decodeBase64(input.publicKey, 32);
  const contentHash = decodeSha256(input.contentHash);
  if (!signature || !publicKey || !contentHash) return false;

  try {
    return await verifyAsync(signature, contentHash, publicKey, { zip215: false });
  } catch {
    return false;
  }
}
