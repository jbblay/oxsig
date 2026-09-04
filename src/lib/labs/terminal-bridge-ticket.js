import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const VERSION = 1;
const DEFAULT_TTL_MS = 30_000;
const MAX_TTL_MS = 60_000;

function bridgeSecret() {
  const secret = process.env.OXSIG_TERMINAL_BRIDGE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('OXSIG_TERMINAL_BRIDGE_SECRET is unavailable. Start Oxsig through its server entrypoint.');
  }
  return secret;
}

function signatureFor(encodedPayload) {
  return createHmac('sha256', bridgeSecret()).update(encodedPayload).digest('base64url');
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createTerminalBridgeTicket({ streamUrl, region, sessionId, target, ttlMs = DEFAULT_TTL_MS }) {
  if (!streamUrl || !region || !sessionId || !target) {
    throw new Error('A complete Session Manager session is required for a terminal bridge ticket.');
  }

  const ttl = Math.max(1_000, Math.min(Number(ttlMs) || DEFAULT_TTL_MS, MAX_TTL_MS));
  const payload = {
    v: VERSION,
    streamUrl,
    region,
    sessionId,
    target,
    nonce: randomBytes(18).toString('base64url'),
    exp: Date.now() + ttl,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encodedPayload}.${signatureFor(encodedPayload)}`;
}

export function verifyTerminalBridgeTicket(ticket) {
  if (typeof ticket !== 'string' || ticket.length < 40 || ticket.length > 8_192) {
    throw new Error('Invalid terminal bridge ticket.');
  }

  const separator = ticket.lastIndexOf('.');
  if (separator <= 0 || separator === ticket.length - 1) {
    throw new Error('Invalid terminal bridge ticket.');
  }

  const encodedPayload = ticket.slice(0, separator);
  const providedSignature = ticket.slice(separator + 1);
  if (!safeEqual(signatureFor(encodedPayload), providedSignature)) {
    throw new Error('Invalid terminal bridge ticket signature.');
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid terminal bridge ticket payload.');
  }

  if (
    payload?.v !== VERSION ||
    typeof payload.streamUrl !== 'string' ||
    typeof payload.region !== 'string' ||
    typeof payload.sessionId !== 'string' ||
    typeof payload.target !== 'string' ||
    typeof payload.nonce !== 'string' ||
    typeof payload.exp !== 'number'
  ) {
    throw new Error('Incomplete terminal bridge ticket.');
  }
  if (payload.exp <= Date.now()) {
    throw new Error('Terminal bridge ticket expired.');
  }

  return payload;
}
