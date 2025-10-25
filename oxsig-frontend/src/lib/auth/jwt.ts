/**
 * JWT Authentication with Ed25519 Signatures
 * 
 * Implements secure JWT token generation and verification using
 * Ed25519 cryptographic signatures instead of HMAC.
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha256';

// JWT token expiration times
export const TOKEN_EXPIRY = {
  ACCESS: 15 * 60, // 15 minutes
  REFRESH: 7 * 24 * 60 * 60, // 7 days
} as const;

// JWT payload interface
export interface JWTPayload {
  sub: string; // User ID
  email?: string;
  iat: number; // Issued at
  exp: number; // Expiration
  type: 'access' | 'refresh';
}

// Ed25519 key pair for JWT signing
let signingKeyPair: CryptoKeyPair | null = null;

/**
 * Initialize JWT signing keys
 * Should be called once at startup
 */
export async function initializeJWTKeys(): Promise<void> {
  if (signingKeyPair) return;

  // Generate Ed25519 key pair
  signingKeyPair = await crypto.subtle.generateKey(
    'Ed25519',
    true, // extractable
    ['sign', 'verify']
  );

  console.log('✅ JWT signing keys initialized with Ed25519');
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
  // Add padding back
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
  // If the Uint8Array is a view on a larger buffer, create a copy
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
  email?: string
): string {
  const now = Math.floor(Date.now() / 1000);
  const expiry = type === 'access' ? TOKEN_EXPIRY.ACCESS : TOKEN_EXPIRY.REFRESH;
  
  const payload: JWTPayload = {
    sub: userId,
    ...(email && { email }),
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
  email?: string
): Promise<string> {
  const keys = await getSigningKeys();
  
  // Create header and payload
  const header = createJWTHeader();
  const payload = createJWTPayload(userId, type, email);
  
  // Create signing input
  const signingInput = `${header}.${payload}`;
  const signingInputBytes = new TextEncoder().encode(signingInput);
  
  // Sign with Ed25519
  const signatureBuffer = await crypto.subtle.sign(
    'Ed25519',
    keys.privateKey,
    signingInputBytes
  );
  
  const signature = new Uint8Array(signatureBuffer);
  const signatureB64 = base64URLEncode(signature);
  
  // Return complete JWT
  return `${signingInput}.${signatureB64}`;
}

/**
 * Verify JWT token signature and decode payload
 */
export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const keys = await getSigningKeys();
    
    // Split token into parts
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    
    const [headerB64, payloadB64, signatureB64] = parts;
    
    // Verify signature
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
    
    // Decode payload
    const payloadBytes = base64URLDecode(payloadB64);
    const payloadJSON = new TextDecoder().decode(payloadBytes);
    const payload: JWTPayload = JSON.parse(payloadJSON);
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null; // Token expired
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
  email?: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const [accessToken, refreshToken] = await Promise.all([
    signJWT(userId, 'access', email),
    signJWT(userId, 'refresh', email),
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
  
  // Generate new access token
  return signJWT(payload.sub, 'access', payload.email);
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
 * Hash password with SHA-256 (for simple demo - use bcrypt/argon2 in production)
 */
export async function hashPassword(password: string): Promise<string> {
  const passwordBytes = new TextEncoder().encode(password);
  const hash = sha256(passwordBytes);
  return bytesToHex(hash);
}

/**
 * Verify password against hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  const computedHash = await hashPassword(password);
  return computedHash === hash;
}
