/**
 * JWT Authentication with Ed25519 Signatures
 *
 * Implements secure JWT token generation and verification using
 * Ed25519 cryptographic signatures instead of HMAC.
 */

import { hexToBytes } from '@noble/hashes/utils';
import bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 10;

// JWT token expiration times
export const TOKEN_EXPIRY = {
  ACCESS: 15 * 60, // 15 minutes
  REFRESH: 7 * 24 * 60 * 60, // 7 days
} as const;

// JWT payload interface
export interface JWTPayload {
  sub: string; // User ID
  did?: string; // Decentralized Identifier
  email?: string;
  role?: string;
  iat: number; // Issued at
  exp: number; // Expiration
  type: 'access' | 'refresh';
}

// Ed25519 key pair for JWT signing (loaded from environment)
let signingKeyPair: CryptoKeyPair | null = null;

/**
 * Initialize JWT signing keys.
 *
 * Production must provide persistent keys through environment variables.
 * Development may use an ephemeral key pair, but private key material is
 * never written to logs.
 */
export async function initializeJWTKeys(): Promise<void> {
  if (signingKeyPair) return;

  const privateKeyEnv = process.env.JWT_PRIVATE_KEY;
  const publicKeyEnv = process.env.JWT_PUBLIC_KEY;
  const isProduction = process.env.NODE_ENV === 'production';

  if (privateKeyEnv && publicKeyEnv) {
    try {
      const privateKeyBytes = hexToBytes(privateKeyEnv);
      const publicKeyBytes = hexToBytes(publicKeyEnv);

      const privateKeyBuffer = new Uint8Array(privateKeyBytes).buffer as ArrayBuffer;
      const publicKeyBuffer = new Uint8Array(publicKeyBytes).buffer as ArrayBuffer;

      const privateKey = await crypto.subtle.importKey(
        'pkcs8',
        privateKeyBuffer,
        'Ed25519',
        true,
        ['sign']
      );

      const publicKey = await crypto.subtle.importKey(
        'spki',
        publicKeyBuffer,
        'Ed25519',
        true,
        ['verify']
      );

      signingKeyPair = { privateKey, publicKey };
      console.log('JWT signing keys loaded');
      return;
    } catch (error) {
      if (isProduction) {
        console.error('Failed to load configured JWT signing keys');
        throw new Error('Invalid JWT signing key configuration');
      }

      console.warn('Configured JWT keys are invalid; using an ephemeral development key pair');
      await generateEphemeralKeys();
      return;
    }
  }

  if (isProduction) {
    throw new Error(
      'JWT_PRIVATE_KEY and JWT_PUBLIC_KEY are required in production. Refusing to start with ephemeral signing keys.'
    );
  }

  console.warn('JWT signing keys are not configured; using an ephemeral development key pair');
  await generateEphemeralKeys();
}

async function generateEphemeralKeys(): Promise<void> {
  signingKeyPair = await crypto.subtle.generateKey(
    'Ed25519',
    true,
    ['sign', 'verify']
  );

  console.warn('Ephemeral JWT signing keys generated for development. Existing tokens will be invalid after restart.');
}

/**
 * Get or create signing key pair
 */
async function getSigningKeys(): Promise<CryptoKeyPair> {
  if (!signingKeyPair) {
    await initializeJWTKeys();
  }
  return signingKeyPair!;
}

/**
 * Base64URL encode (without padding)
 */
function base64URLEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Base64URL decode
 */
function base64URLDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }

  const binaryString = atob(base64);
  const buffer = new ArrayBuffer(binaryString.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Ensure proper ArrayBuffer type for Web Crypto API
 */
function ensureArrayBuffer(data: Uint8Array): ArrayBuffer {
  if (data.buffer.byteLength === data.byteLength) {
    return data.buffer as ArrayBuffer;
  }
  return data.slice().buffer as ArrayBuffer;
}

/**
 * Create JWT header
 */
function createJWTHeader(): string {
  const header = {
    alg: 'EdDSA',
    typ: 'JWT',
  };

  const headerJSON = JSON.stringify(header);
  const headerBytes = new TextEncoder().encode(headerJSON);
  return base64URLEncode(headerBytes);
}

/**
 * Create JWT payload
 */
function createJWTPayload(
  userId: string,
  type: 'access' | 'refresh',
  email?: string,
  role?: string
): string {
  const now = Math.floor(Date.now() / 1000);
  const expiry = type === 'access' ? TOKEN_EXPIRY.ACCESS : TOKEN_EXPIRY.REFRESH;

  const payload: JWTPayload = {
    sub: userId,
    ...(email && { email }),
    ...(role && { role }),
    iat: now,
    exp: now + expiry,
    type,
  };

  const payloadJSON = JSON.stringify(payload);
  const payloadBytes = new TextEncoder().encode(payloadJSON);
  return base64URLEncode(payloadBytes);
}

/**
 * Sign JWT token with Ed25519
 */
export async function signJWT(
  userId: string,
  type: 'access' | 'refresh' = 'access',
  email?: string,
  role?: string
): Promise<string> {
  const keys = await getSigningKeys();

  const header = createJWTHeader();
  const payload = createJWTPayload(userId, type, email, role);

  const signingInput = `${header}.${payload}`;
  const signingInputBytes = new TextEncoder().encode(signingInput);

  const signatureBuffer = await crypto.subtle.sign(
    'Ed25519',
    keys.privateKey,
    signingInputBytes
  );

  const signature = new Uint8Array(signatureBuffer);
  const signatureB64 = base64URLEncode(signature);

  return `${signingInput}.${signatureB64}`;
}

/**
 * Verify JWT token signature and decode payload
 */
export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const keys = await getSigningKeys();

    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    const signingInput = `${headerB64}.${payloadB64}`;
    const signingInputBytes = new TextEncoder().encode(signingInput);
    const signatureBytes = base64URLDecode(signatureB64);

    const isValid = await crypto.subtle.verify(
      'Ed25519',
      keys.publicKey,
      signatureBytes as BufferSource,
      ensureArrayBuffer(signingInputBytes)
    );

    if (!isValid) {
      return null;
    }

    const payloadBytes = base64URLDecode(payloadB64);
    const payloadJSON = new TextDecoder().decode(payloadBytes);
    const payload: JWTPayload = JSON.parse(payloadJSON);

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null;
    }

    return payload;
  } catch (error) {
    console.error('JWT verification error:', error);
    return null;
  }
}

/**
 * Generate both access and refresh tokens
 */
export async function generateTokenPair(
  userId: string,
  email?: string,
  role?: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const [accessToken, refreshToken] = await Promise.all([
    signJWT(userId, 'access', email, role),
    signJWT(userId, 'refresh', email, role),
  ]);

  return { accessToken, refreshToken };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<string | null> {
  const payload = await verifyJWT(refreshToken);

  if (!payload || payload.type !== 'refresh') {
    return null;
  }

  return signJWT(payload.sub, 'access', payload.email, payload.role);
}

/**
 * Extract token from Authorization header
 */
export function extractBearerToken(authHeader?: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.substring(7);
}

/**
 * Hash password with bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify password against bcrypt hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}
