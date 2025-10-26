/**
 * JWT Authentication with Ed25519 Signatures
 * 
 * Implements secure JWT token generation and verification using
 * Ed25519 cryptographic signatures instead of HMAC.
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
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
  email?: string;
  role?: string;
  iat: number; // Issued at
  exp: number; // Expiration
  type: 'access' | 'refresh';
}

// Ed25519 key pair for JWT signing (loaded from environment)
let signingKeyPair: CryptoKeyPair | null = null;

/**
 * Initialize JWT signing keys from environment or generate new ones
 * Keys are persisted in environment variables to survive server restarts
 */
export async function initializeJWTKeys(): Promise<void> {
  if (signingKeyPair) return;

  const privateKeyEnv = process.env.JWT_PRIVATE_KEY;
  const publicKeyEnv = process.env.JWT_PUBLIC_KEY;

  if (privateKeyEnv && publicKeyEnv) {
    // Load existing keys from environment
    try {
      const privateKeyBytes = hexToBytes(privateKeyEnv);
      const publicKeyBytes = hexToBytes(publicKeyEnv);

      // Convert to proper ArrayBuffer type
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
      console.log('✅ JWT signing keys loaded from environment');
    } catch (error) {
      console.error('Failed to load JWT keys from environment, generating new ones:', error);
      await generateNewKeys();
    }
  } else {
    // Generate new keys and display them for environment configuration
    await generateNewKeys();
  }
}

async function generateNewKeys(): Promise<void> {
  signingKeyPair = await crypto.subtle.generateKey(
    'Ed25519',
    true,
    ['sign', 'verify']
  );

  // Export keys to display for environment configuration
  const privateKeyBytes = new Uint8Array(
    await crypto.subtle.exportKey('pkcs8', signingKeyPair.privateKey)
  );
  const publicKeyBytes = new Uint8Array(
    await crypto.subtle.exportKey('spki', signingKeyPair.publicKey)
  );

  const privateKeyHex = bytesToHex(privateKeyBytes);
  const publicKeyHex = bytesToHex(publicKeyBytes);

  console.log('⚠️  NEW JWT SIGNING KEYS GENERATED');
  console.log('⚠️  Add these to your .env.local to persist across restarts:');
  console.log(`JWT_PRIVATE_KEY=${privateKeyHex}`);
  console.log(`JWT_PUBLIC_KEY=${publicKeyHex}`);
  console.log('⚠️  All existing tokens will be invalid after restart unless you save these keys!');
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
  
  // Create header and payload
  const header = createJWTHeader();
  const payload = createJWTPayload(userId, type, email, role);
  
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
  
  // Generate new access token
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
 * Hash password with bcrypt (production-grade)
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
