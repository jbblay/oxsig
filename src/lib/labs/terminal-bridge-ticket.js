import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const VERSION = 1;
const DEFAULT_TTL_MS = 30_000;
const MAX_TTL_MS = 60_000;
const AAD = Buffer.from('oxsig-terminal-bridge-v1', 'utf8');
const BASE64URL = /^[A-Za-z0-9_-]+$/;

function bridgeKey() {
  const secret = process.env.OXSIG_TERMINAL_BRIDGE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('OXSIG_TERMINAL_BRIDGE_SECRET is unavailable. Start Oxsig through its server entrypoint.');
  }
  return createHash('sha256').update(secret, 'utf8').digest();
}

function resolveTicketTtlMs(ttlMs = DEFAULT_TTL_MS) {
  return Math.max(1_000, Math.min(Number(ttlMs) || DEFAULT_TTL_MS, MAX_TTL_MS));
}

function decodeBase64UrlStrict(part, label) {
  if (typeof part !== 'string' || part.length === 0 || !BASE64URL.test(part)) {
    throw new Error(`Malformed ${label}.`);
  }
  const decoded = Buffer.from(part, 'base64url');
  if (decoded.toString('base64url') !== part) {
    throw new Error(`Malformed ${label}.`);
  }
  return decoded;
}

function validWorkspaceControl(value) {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return (
    typeof value.collaborationId === 'string' && value.collaborationId.length > 0 &&
    typeof value.participantId === 'string' && value.participantId.length > 0 &&
    typeof value.bindingId === 'string' && value.bindingId.length > 0 &&
    typeof value.labInstanceId === 'string' && value.labInstanceId.length > 0 &&
    typeof value.leaseId === 'string' && value.leaseId.length > 0 &&
    value.surface === 'terminal'
  );
}

export function terminalBridgeTicketTtlMs(ttlMs = DEFAULT_TTL_MS) {
  return resolveTicketTtlMs(ttlMs);
}

export function createTerminalBridgeTicket({ streamUrl, region, sessionId, target, workspaceControl, ttlMs = DEFAULT_TTL_MS }) {
  if (!streamUrl || !region || !sessionId || !target) {
    throw new Error('A complete Session Manager session is required for a terminal bridge ticket.');
  }
  if (!validWorkspaceControl(workspaceControl)) {
    throw new Error('Invalid Live Workspace terminal control binding.');
  }

  const ttl = resolveTicketTtlMs(ttlMs);
  const payload = Buffer.from(JSON.stringify({
    v: VERSION,
    streamUrl,
    region,
    sessionId,
    target,
    workspaceControl,
    nonce: randomBytes(18).toString('base64url'),
    exp: Date.now() + ttl,
  }), 'utf8');

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', bridgeKey(), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}.${iv.toString('base64url')}.${ciphertext.toString('base64url')}.${tag.toString('base64url')}`;
}

export function verifyTerminalBridgeTicket(ticket) {
  if (typeof ticket !== 'string' || ticket.length < 40 || ticket.length > 8_192) {
    throw new Error('Invalid terminal bridge ticket.');
  }

  const parts = ticket.split('.');
  if (parts.length !== 4 || Number(parts[0]) !== VERSION) {
    throw new Error('Invalid terminal bridge ticket version.');
  }

  let payload;
  try {
    const iv = decodeBase64UrlStrict(parts[1], 'ticket iv');
    const ciphertext = decodeBase64UrlStrict(parts[2], 'ticket ciphertext');
    const tag = decodeBase64UrlStrict(parts[3], 'ticket auth tag');
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length < 1) {
      throw new Error('Malformed encrypted ticket.');
    }
    const decipher = createDecipheriv('aes-256-gcm', bridgeKey(), iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    payload = JSON.parse(plaintext.toString('utf8'));
  } catch {
    throw new Error('Invalid terminal bridge ticket.');
  }

  if (
    payload?.v !== VERSION ||
    typeof payload.streamUrl !== 'string' ||
    typeof payload.region !== 'string' ||
    typeof payload.sessionId !== 'string' ||
    typeof payload.target !== 'string' ||
    typeof payload.nonce !== 'string' ||
    typeof payload.exp !== 'number' ||
    !validWorkspaceControl(payload.workspaceControl)
  ) {
    throw new Error('Incomplete terminal bridge ticket.');
  }
  if (payload.exp <= Date.now()) {
    throw new Error('Terminal bridge ticket expired.');
  }

  return payload;
}
