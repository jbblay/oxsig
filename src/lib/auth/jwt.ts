/**
 * Ed25519-signed access and refresh tokens.
 *
 * Keys are PKCS#8/SPKI DER values encoded as hex. Run `pnpm setup` once to
 * create a persistent development key pair in .env.local.
 */

export const TOKEN_EXPIRY = {
  ACCESS: 15 * 60,
  REFRESH: 7 * 24 * 60 * 60,
} as const;

export interface JWTPayload {
  sub: string;
  did?: string;
  email?: string;
  role?: string;
  jti: string;
  iat: number;
  exp: number;
  type: 'access' | 'refresh';
}

let signingKeyPair: CryptoKeyPair | null = null;
let keyInitialization: Promise<CryptoKeyPair> | null = null;

function hexToBytes(value: string): Uint8Array {
  if (value.length === 0 || value.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(value)) {
    throw new Error('JWT key must be a non-empty, even-length hexadecimal value');
  }

  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

async function initializeJWTKeys(): Promise<void> {
  if (signingKeyPair) return;
  if (!keyInitialization) {
    keyInitialization = (async () => {
      const privateKeyValue = process.env.JWT_PRIVATE_KEY?.trim();
      const publicKeyValue = process.env.JWT_PUBLIC_KEY?.trim();

      if (Boolean(privateKeyValue) !== Boolean(publicKeyValue)) {
        throw new Error('JWT_PRIVATE_KEY and JWT_PUBLIC_KEY must be configured together');
      }

      if (privateKeyValue && publicKeyValue) {
        try {
          const [privateKey, publicKey] = await Promise.all([
            crypto.subtle.importKey(
              'pkcs8',
              asArrayBuffer(hexToBytes(privateKeyValue)),
              'Ed25519',
              false,
              ['sign'],
            ),
            crypto.subtle.importKey(
              'spki',
              asArrayBuffer(hexToBytes(publicKeyValue)),
              'Ed25519',
              false,
              ['verify'],
            ),
          ]);
          return { privateKey, publicKey };
        } catch (error) {
          throw new Error('JWT signing keys are invalid', { cause: error });
        }
      }

      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT signing keys are required in production');
      }

      console.warn('JWT keys are ephemeral. Run `pnpm setup` before signing in to persist sessions.');
      return crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']);
    })();
  }

  try {
    signingKeyPair = await keyInitialization;
  } finally {
    keyInitialization = null;
  }
}

async function getSigningKeys(): Promise<CryptoKeyPair> {
  await initializeJWTKeys();
  return signingKeyPair!;
}

function base64UrlEncode(data: Uint8Array): string {
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid base64url value');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeJson(value: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

function decodeJson(value: string): unknown {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(value)));
}

function isPayload(value: unknown): value is JWTPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<JWTPayload>;
  return (
    typeof payload.sub === 'string' &&
    payload.sub.length > 0 &&
    typeof payload.jti === 'string' &&
    payload.jti.length > 0 &&
    typeof payload.iat === 'number' &&
    typeof payload.exp === 'number' &&
    (payload.type === 'access' || payload.type === 'refresh') &&
    (payload.email === undefined || typeof payload.email === 'string') &&
    (payload.role === undefined || typeof payload.role === 'string')
  );
}

export async function signJWT(
  userId: string,
  type: 'access' | 'refresh' = 'access',
  email?: string,
  role?: string,
): Promise<string> {
  const keys = await getSigningKeys();
  const now = Math.floor(Date.now() / 1000);
  const expiry = type === 'access' ? TOKEN_EXPIRY.ACCESS : TOKEN_EXPIRY.REFRESH;
  const header = encodeJson({ alg: 'EdDSA', typ: 'JWT' });
  const payload = encodeJson({
    sub: userId,
    ...(email ? { email } : {}),
    ...(role ? { role } : {}),
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + expiry,
    type,
  } satisfies JWTPayload);
  const signingInput = new TextEncoder().encode(`${header}.${payload}`);
  const signature = await crypto.subtle.sign('Ed25519', keys.privateKey, asArrayBuffer(signingInput));
  return `${header}.${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerValue, payloadValue, signatureValue] = parts;
    const header = decodeJson(headerValue) as { alg?: unknown; typ?: unknown };
    if (header?.alg !== 'EdDSA' || header?.typ !== 'JWT') return null;

    const keys = await getSigningKeys();
    const signingInput = new TextEncoder().encode(`${headerValue}.${payloadValue}`);
    const signature = base64UrlDecode(signatureValue);
    const valid = await crypto.subtle.verify(
      'Ed25519',
      keys.publicKey,
      asArrayBuffer(signature),
      asArrayBuffer(signingInput),
    );
    if (!valid) return null;

    const payload = decodeJson(payloadValue);
    if (!isPayload(payload)) return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now || payload.iat > now + 60) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function generateTokenPair(
  userId: string,
  email?: string,
  role?: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const [accessToken, refreshToken] = await Promise.all([
    signJWT(userId, 'access', email, role),
    signJWT(userId, 'refresh', email, role),
  ]);
  return { accessToken, refreshToken };
}

export function extractBearerToken(authHeader?: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}
