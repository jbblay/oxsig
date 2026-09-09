import 'server-only';

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const VERSION = 1;
const PREFIX = `v${VERSION}`;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

function secretKey() {
  const secret = process.env.OXSIG_TERMINAL_BRIDGE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('OXSIG_TERMINAL_BRIDGE_SECRET is unavailable for Operation credential protection.');
  }
  return createHash('sha256')
    .update('oxsig-operation-access\0', 'utf8')
    .update(secret, 'utf8')
    .digest();
}

function aad(ownerId: string, runId: string) {
  if (!ownerId || ownerId.length > 512 || !runId || runId.length > 512) {
    throw new Error('Invalid Operation credential binding.');
  }
  return Buffer.from(`oxsig-operation-access-v${VERSION}\0${ownerId}\0${runId}`, 'utf8');
}

function decodePart(value: string, label: string) {
  if (!value || !BASE64URL.test(value)) throw new Error(`Malformed Operation credential ${label}.`);
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) throw new Error(`Malformed Operation credential ${label}.`);
  return decoded;
}

export function sealOperationAccessSecret(args: { ownerId: string; runId: string; password: string }) {
  if (!args.password || args.password.length > 512 || args.password.includes('\0')) {
    throw new Error('Invalid Operation starting credential.');
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey(), iv);
  cipher.setAAD(aad(args.ownerId, args.runId));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(args.password, 'utf8')),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}.${iv.toString('base64url')}.${ciphertext.toString('base64url')}.${tag.toString('base64url')}`;
}

export function openOperationAccessSecret(args: { ownerId: string; runId: string; sealed: string }) {
  if (typeof args.sealed !== 'string' || args.sealed.length < 30 || args.sealed.length > 4096) {
    throw new Error('Invalid Operation starting credential.');
  }
  const parts = args.sealed.split('.');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error('Unsupported Operation credential version.');
  }

  try {
    const iv = decodePart(parts[1], 'iv');
    const ciphertext = decodePart(parts[2], 'ciphertext');
    const tag = decodePart(parts[3], 'auth tag');
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length < 1) {
      throw new Error('Malformed Operation credential payload.');
    }
    const decipher = createDecipheriv('aes-256-gcm', secretKey(), iv);
    decipher.setAAD(aad(args.ownerId, args.runId));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Invalid Operation starting credential.');
  }
}
