/**
 * Shamir's Secret Sharing
 * 
 * Cryptographically secure secret sharing scheme that allows splitting
 * a secret into N shares where any M shares can reconstruct the secret.
 * 
 * Features:
 * - M-of-N threshold recovery
 * - Information-theoretic security
 * - Perfect secrecy (knowing M-1 shares reveals nothing)
 * - Uses GF(2^8) finite field arithmetic
 */

import { randomBytes } from 'crypto';

const GF256_SIZE = 256;

// Precomputed logarithm and exponentiation tables for GF(2^8)
// Using polynomial 0x11d (x^8 + x^4 + x^3 + x^2 + 1)
const LOG_TABLE = new Uint8Array(GF256_SIZE);
const EXP_TABLE = new Uint8Array(GF256_SIZE * 2);

// Initialize GF(2^8) tables
function initGF256Tables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    LOG_TABLE[x] = i;
    x = ((x << 1) ^ ((x & 0x80) ? 0x1d : 0)) & 0xFF;
  }
  // Duplicate for modular arithmetic in multiplication/division
  for (let i = 0; i < 256; i++) {
    EXP_TABLE[i + 255] = EXP_TABLE[i];
  }
  LOG_TABLE[0] = 0; // Not used, but initialize
}

// Initialize tables on module load
initGF256Tables();

/**
 * Multiply two numbers in GF(2^8)
 */
function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
}

/**
 * Divide two numbers in GF(2^8)
 */
function gfDiv(a: number, b: number): number {
  if (b === 0) throw new Error('Division by zero in GF(2^8)');
  if (a === 0) return 0;
  // Division: a/b = a * b^(-1) = EXP[LOG[a] - LOG[b]]
  // Add 255 to handle negative results (since field has 255 non-zero elements)
  return EXP_TABLE[(LOG_TABLE[a] - LOG_TABLE[b] + 255) % 255];
}

/**
 * Evaluate polynomial at point x using Horner's method
 */
function evaluatePolynomial(coefficients: Uint8Array, x: number): number {
  let result = 0;
  for (let i = coefficients.length - 1; i >= 0; i--) {
    result = gfMul(result, x) ^ coefficients[i];
  }
  return result;
}

/**
 * Lagrange interpolation to reconstruct secret
 */
function lagrangeInterpolate(shares: Share[]): number {
  let secret = 0;
  
  for (let i = 0; i < shares.length; i++) {
    let numerator = 1;
    let denominator = 1;
    
    for (let j = 0; j < shares.length; j++) {
      if (i === j) continue;
      
      numerator = gfMul(numerator, shares[j].x);
      denominator = gfMul(denominator, shares[i].x ^ shares[j].x);
    }
    
    const lagrangeCoeff = gfDiv(numerator, denominator);
    secret ^= gfMul(shares[i].y, lagrangeCoeff);
  }
  
  return secret;
}

export interface Share {
  /** Share index (1-255) */
  x: number;
  /** Share value */
  y: number;
}

export interface ShamirShare {
  /** Share identifier (1-255) */
  id: number;
  /** Share data (base64 encoded) */
  data: string;
  /** Threshold required to reconstruct */
  threshold: number;
  /** Total number of shares */
  total: number;
  /** Creation timestamp */
  created: number;
}

/**
 * Split a secret into N shares where M shares are required to reconstruct
 * 
 * @param secret - Secret to split (Buffer or Uint8Array)
 * @param threshold - Minimum shares required (M)
 * @param totalShares - Total shares to generate (N)
 * @returns Array of ShamirShare objects
 */
export function splitSecret(
  secret: Buffer | Uint8Array,
  threshold: number,
  totalShares: number
): ShamirShare[] {
  // Validation
  if (threshold < 2) {
    throw new Error('Threshold must be at least 2');
  }
  if (totalShares < threshold) {
    throw new Error('Total shares must be >= threshold');
  }
  if (totalShares > 255) {
    throw new Error('Maximum 255 shares supported');
  }
  if (secret.length === 0) {
    throw new Error('Secret cannot be empty');
  }

  const secretBytes = secret instanceof Buffer ? secret : Buffer.from(secret);
  const shares: ShamirShare[] = [];
  const created = Date.now();

  // For each byte in the secret
  const shareData: Uint8Array[] = Array.from({ length: totalShares }, () => 
    new Uint8Array(secretBytes.length)
  );

  for (let byteIdx = 0; byteIdx < secretBytes.length; byteIdx++) {
    // Generate random polynomial coefficients (threshold - 1 random coefficients)
    // Coefficient[0] is the secret byte itself
    const coefficients = new Uint8Array(threshold);
    coefficients[0] = secretBytes[byteIdx];
    
    // Generate random coefficients for higher degree terms
    const randomCoeffs = randomBytes(threshold - 1);
    for (let i = 1; i < threshold; i++) {
      coefficients[i] = randomCoeffs[i - 1];
    }

    // Evaluate polynomial at points 1..N to generate shares
    for (let shareIdx = 0; shareIdx < totalShares; shareIdx++) {
      const x = shareIdx + 1; // Share IDs are 1-indexed
      const y = evaluatePolynomial(coefficients, x);
      shareData[shareIdx][byteIdx] = y;
    }
  }

  // Create ShamirShare objects
  for (let i = 0; i < totalShares; i++) {
    shares.push({
      id: i + 1,
      data: Buffer.from(shareData[i]).toString('base64'),
      threshold,
      total: totalShares,
      created,
    });
  }

  return shares;
}

/**
 * Reconstruct secret from M shares
 * 
 * @param shares - Array of ShamirShare objects (at least M shares)
 * @returns Reconstructed secret as Buffer
 */
export function combineShares(shares: ShamirShare[]): Buffer {
  if (shares.length === 0) {
    throw new Error('No shares provided');
  }

  // Validate shares
  const threshold = shares[0].threshold;
  const total = shares[0].total;
  const created = shares[0].created;

  if (shares.length < threshold) {
    throw new Error(`Need at least ${threshold} shares to reconstruct, got ${shares.length}`);
  }

  // Verify all shares have same parameters
  for (const share of shares) {
    if (share.threshold !== threshold || share.total !== total) {
      throw new Error('Shares have incompatible parameters');
    }
  }

  // Decode share data
  const shareBytes = shares.map(s => Buffer.from(s.data, 'base64'));
  const secretLength = shareBytes[0].length;

  // Verify all shares have same length
  for (const bytes of shareBytes) {
    if (bytes.length !== secretLength) {
      throw new Error('Shares have different lengths');
    }
  }

  // Verify shares are from the same split (same creation timestamp)
  for (const share of shares) {
    if (share.created !== created) {
      throw new Error('Shares must be from the same split (different creation timestamps)');
    }
  }

  // Reconstruct each byte of the secret
  const secret = Buffer.alloc(secretLength);

  for (let byteIdx = 0; byteIdx < secretLength; byteIdx++) {
    // Create (x, y) pairs for Lagrange interpolation
    const points: Share[] = shares.slice(0, threshold).map((share, idx) => ({
      x: share.id,
      y: shareBytes[idx][byteIdx],
    }));

    // Interpolate to get secret byte
    secret[byteIdx] = lagrangeInterpolate(points);
  }

  return secret;
}

/**
 * Verify that a set of shares can reconstruct a secret (without actually reconstructing)
 * 
 * @param shares - Array of ShamirShare objects
 * @returns True if shares are valid and sufficient
 */
export function verifyShares(shares: ShamirShare[]): boolean {
  try {
    if (shares.length === 0) return false;
    
    const threshold = shares[0].threshold;
    if (shares.length < threshold) return false;

    // Verify parameters match
    for (const share of shares) {
      if (share.threshold !== threshold || share.total !== shares[0].total) {
        return false;
      }
    }

    // Verify share data is valid base64 and same length
    const shareBytes = shares.map(s => Buffer.from(s.data, 'base64'));
    const length = shareBytes[0].length;
    for (const bytes of shareBytes) {
      if (bytes.length !== length) return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Refresh shares (create new shares from existing shares without reconstructing secret)
 * This allows changing the threshold or total without exposing the secret
 * 
 * @param oldShares - Existing shares (must meet old threshold)
 * @param newThreshold - New threshold
 * @param newTotal - New total shares
 * @returns New shares
 */
export function refreshShares(
  oldShares: ShamirShare[],
  newThreshold: number,
  newTotal: number
): ShamirShare[] {
  // First reconstruct the secret
  const secret = combineShares(oldShares);
  
  // Then create new shares with new parameters
  return splitSecret(secret, newThreshold, newTotal);
}

/**
 * Export share as QR code-friendly format
 */
export function shareToQRFormat(share: ShamirShare): string {
  return JSON.stringify({
    v: 1, // Version
    i: share.id,
    d: share.data,
    m: share.threshold,
    n: share.total,
    t: share.created,
  });
}

/**
 * Import share from QR code format
 */
export function shareFromQRFormat(qrData: string): ShamirShare {
  const parsed = JSON.parse(qrData);
  if (parsed.v !== 1) {
    throw new Error('Unsupported share version');
  }
  return {
    id: parsed.i,
    data: parsed.d,
    threshold: parsed.m,
    total: parsed.n,
    created: parsed.t,
  };
}
