import 'server-only';

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';

const VERSION = 1;
const DEFAULT_TTL_MS = 120_000;
const MAX_TTL_MS = 300_000;
const AAD = Buffer.from('oxsig-desktop-access-evidence-v1', 'utf8');
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const PLAN_HASH = /^[0-9a-f]{64}$/;

export type DesktopAccessEvidenceTicketClaims = {
  v: 1;
  ownerId: string;
  labInstanceId: string;
  deploymentAuthorizationId: string;
  deploymentExecutionId: string;
  planId: string;
  planHash: string;
  prerequisiteGuestEvidenceId: string;
  sessionId: string;
  target: string;
  platform: 'linux' | 'windows';
  port: number;
  evidenceExecutionId: string;
  nonce: string;
  iat: number;
  exp: number;
};

function ticketKey() {
  const secret = process.env.OXSIG_TERMINAL_BRIDGE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('OXSIG_TERMINAL_BRIDGE_SECRET is unavailable. Start Oxsig through its server entrypoint.');
  }
  return createHash('sha256').update('oxsig-desktop-access-evidence\0', 'utf8').update(secret, 'utf8').digest();
}

function resolveTtlMs(ttlMs = DEFAULT_TTL_MS) {
  return Math.max(5_000, Math.min(Number(ttlMs) || DEFAULT_TTL_MS, MAX_TTL_MS));
}

function decodeBase64UrlStrict(part: string, label: string) {
  if (!part || !BASE64URL.test(part)) throw new Error(`Malformed ${label}.`);
  const decoded = Buffer.from(part, 'base64url');
  if (decoded.toString('base64url') !== part) throw new Error(`Malformed ${label}.`);
  return decoded;
}

function assertInput(input: Omit<DesktopAccessEvidenceTicketClaims, 'v' | 'evidenceExecutionId' | 'nonce' | 'iat' | 'exp'>) {
  for (const [label, value] of Object.entries({
    ownerId: input.ownerId,
    labInstanceId: input.labInstanceId,
    deploymentAuthorizationId: input.deploymentAuthorizationId,
    deploymentExecutionId: input.deploymentExecutionId,
    planId: input.planId,
    prerequisiteGuestEvidenceId: input.prerequisiteGuestEvidenceId,
    sessionId: input.sessionId,
    target: input.target,
  })) {
    if (typeof value !== 'string' || value.length < 1 || value.length > 512) {
      throw new Error(`Invalid desktop access evidence ${label}.`);
    }
  }
  if (!PLAN_HASH.test(input.planHash)) throw new Error('Invalid desktop access evidence plan hash.');
  if (input.platform !== 'linux' && input.platform !== 'windows') {
    throw new Error('Invalid desktop access evidence platform.');
  }
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw new Error('Invalid desktop access evidence port.');
  }
}

export function desktopAccessEvidenceTicketTtlMs(ttlMs = DEFAULT_TTL_MS) {
  return resolveTtlMs(ttlMs);
}

export function createDesktopAccessEvidenceTicket(
  input: Omit<DesktopAccessEvidenceTicketClaims, 'v' | 'evidenceExecutionId' | 'nonce' | 'iat' | 'exp'>,
  ttlMs = DEFAULT_TTL_MS
) {
  assertInput(input);
  const ttl = resolveTtlMs(ttlMs);
  const now = Date.now();
  const claims: DesktopAccessEvidenceTicketClaims = {
    v: VERSION,
    ...input,
    evidenceExecutionId: randomUUID(),
    nonce: randomBytes(18).toString('base64url'),
    iat: now,
    exp: now + ttl,
  };

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', ticketKey(), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(claims), 'utf8')),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    ticket: `${VERSION}.${iv.toString('base64url')}.${ciphertext.toString('base64url')}.${tag.toString('base64url')}`,
    evidenceExecutionId: claims.evidenceExecutionId,
    expiresAt: new Date(claims.exp).toISOString(),
    ttlMs: ttl,
  };
}

export function verifyDesktopAccessEvidenceTicket(ticket: string): DesktopAccessEvidenceTicketClaims {
  if (typeof ticket !== 'string' || ticket.length < 40 || ticket.length > 16_384) {
    throw new Error('Invalid desktop access evidence ticket.');
  }
  const parts = ticket.split('.');
  if (parts.length !== 4 || Number(parts[0]) !== VERSION) {
    throw new Error('Invalid desktop access evidence ticket version.');
  }

  let claims: unknown;
  try {
    const iv = decodeBase64UrlStrict(parts[1], 'ticket iv');
    const ciphertext = decodeBase64UrlStrict(parts[2], 'ticket ciphertext');
    const tag = decodeBase64UrlStrict(parts[3], 'ticket auth tag');
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length < 1) {
      throw new Error('Malformed encrypted ticket.');
    }
    const decipher = createDecipheriv('aes-256-gcm', ticketKey(), iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    claims = JSON.parse(plaintext.toString('utf8'));
  } catch {
    throw new Error('Invalid desktop access evidence ticket.');
  }

  const value = claims as Partial<DesktopAccessEvidenceTicketClaims>;
  if (
    value.v !== VERSION ||
    typeof value.ownerId !== 'string' ||
    typeof value.labInstanceId !== 'string' ||
    typeof value.deploymentAuthorizationId !== 'string' ||
    typeof value.deploymentExecutionId !== 'string' ||
    typeof value.planId !== 'string' ||
    typeof value.planHash !== 'string' ||
    !PLAN_HASH.test(value.planHash) ||
    typeof value.prerequisiteGuestEvidenceId !== 'string' ||
    typeof value.sessionId !== 'string' ||
    typeof value.target !== 'string' ||
    (value.platform !== 'linux' && value.platform !== 'windows') ||
    !Number.isInteger(value.port) ||
    (value.port as number) < 1 ||
    (value.port as number) > 65535 ||
    typeof value.evidenceExecutionId !== 'string' ||
    typeof value.nonce !== 'string' ||
    typeof value.iat !== 'number' ||
    typeof value.exp !== 'number'
  ) {
    throw new Error('Incomplete desktop access evidence ticket.');
  }
  if ((value.exp as number) <= Date.now()) throw new Error('Desktop access evidence ticket expired.');
  if ((value.iat as number) > Date.now() + 5_000 || (value.exp as number) - (value.iat as number) > MAX_TTL_MS) {
    throw new Error('Desktop access evidence ticket has an invalid lifetime.');
  }

  return value as DesktopAccessEvidenceTicketClaims;
}
