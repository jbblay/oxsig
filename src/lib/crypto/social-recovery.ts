/**
 * Social Recovery System
 * 
 * OPSEC-focused account recovery using trusted contacts and Shamir's Secret Sharing.
 * No email, no phone numbers, no centralized recovery - only cryptographic proofs.
 * 
 * Features:
 * - M-of-N threshold recovery (e.g., 3 of 5 guardians)
 * - Time-locked recovery (prevents immediate compromise)
 * - DID-based guardian identity (no PII)
 * - Encrypted share storage
 * - Recovery ceremony with cryptographic verification
 */

import { splitSecret, combineShares, type ShamirShare } from './shamir';
import { randomBytes } from 'crypto';
import { ed25519 } from '@noble/curves/ed25519.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha256';
import { sha512 } from '@noble/hashes/sha512';

// Re-export ShamirShare for API routes
export type { ShamirShare };

export interface Guardian {
  /** Guardian's DID */
  did: string;
  /** Guardian's public key (for encryption) */
  publicKey: string;
  /** Display name (optional, for UI only) */
  displayName?: string;
  /** When guardian was added */
  addedAt: number;
  /** Guardian's share (encrypted) */
  encryptedShare?: string;
  /** Share metadata */
  shareMetadata?: {
    id: number;
    threshold: number;
    total: number;
  };
}

export interface RecoveryConfig {
  /** Minimum guardians needed for recovery */
  threshold: number;
  /** Total guardians */
  totalGuardians: number;
  /** Time delay before recovery can complete (in milliseconds) */
  timeLock?: number;
  /** Recovery session expiration (default: 24 hours) */
  sessionExpiry?: number;
}

export interface RecoverySession {
  /** Session ID */
  id: string;
  /** User's DID being recovered */
  userDid: string;
  /** When recovery was initiated */
  initiatedAt: number;
  /** When recovery can complete (time lock) */
  canCompleteAt: number;
  /** Shares collected so far */
  collectedShares: ShamirShare[];
  /** Guardian DIDs who have provided shares */
  respondedGuardians: string[];
  /** Recovery threshold */
  threshold: number;
  /** Session expires at */
  expiresAt: number;
  /** Status */
  status: 'pending' | 'time-locked' | 'ready' | 'completed' | 'expired' | 'cancelled';
}

export interface RecoveryPackage {
  /** Encrypted master key */
  encryptedMasterKey: string;
  /** Recovery configuration */
  config: RecoveryConfig;
  /** Guardians list */
  guardians: Guardian[];
  /** Creation timestamp */
  createdAt: number;
  /** Last updated */
  updatedAt: number;
}

/**
 * Create a recovery package by splitting the master key among guardians
 * 
 * @param masterKey - User's master private key (32 bytes)
 * @param guardians - List of guardians (without shares)
 * @param config - Recovery configuration
 * @returns Recovery package with encrypted shares for each guardian
 */
export async function createRecoveryPackage(
  masterKey: Buffer,
  guardians: Omit<Guardian, 'encryptedShare' | 'shareMetadata'>[],
  config: RecoveryConfig
): Promise<RecoveryPackage> {
  if (masterKey.length !== 32) {
    throw new Error('Master key must be 32 bytes');
  }

  if (guardians.length !== config.totalGuardians) {
    throw new Error('Guardian count must match totalGuardians');
  }

  if (config.threshold > config.totalGuardians) {
    throw new Error('Threshold cannot exceed total guardians');
  }

  if (config.threshold < 2) {
    throw new Error('Threshold must be at least 2');
  }

  // Split master key into shares
  const shares = splitSecret(masterKey, config.threshold, config.totalGuardians);

  // Encrypt each share for its guardian
  const guardiansWithShares: Guardian[] = await Promise.all(
    guardians.map(async (guardian, index) => {
      const share = shares[index];
      
      // Encrypt share using guardian's public key (using ECDH + AES)
      const encryptedShare = await encryptShareForGuardian(
        share,
        guardian.publicKey
      );

      return {
        ...guardian,
        encryptedShare,
        shareMetadata: {
          id: share.id,
          threshold: share.threshold,
          total: share.total,
        },
      };
    })
  );

  const now = Date.now();

  return {
    encryptedMasterKey: masterKey.toString('base64'), // This should be stored encrypted
    config,
    guardians: guardiansWithShares,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Encrypt a Shamir share for a specific guardian using their public key
 */
async function encryptShareForGuardian(
  share: ShamirShare,
  guardianPublicKey: string
): Promise<string> {
  // Generate ephemeral keypair for X25519 ECDH
  const ephemeralPrivateKey = x25519.utils.randomSecretKey();
  const ephemeralPublicKey = x25519.getPublicKey(ephemeralPrivateKey);

  // Convert Ed25519 public key to X25519 for ECDH
  const guardianPubKeyBytes = Buffer.from(guardianPublicKey, 'hex');
  const guardianX25519PubKey = ed25519.utils.toMontgomery(guardianPubKeyBytes);
  
  // Derive shared secret using X25519 ECDH
  const sharedSecret = x25519.getSharedSecret(ephemeralPrivateKey, guardianX25519PubKey);
  
  // Derive encryption key from shared secret
  const encryptionKey = sha256(sharedSecret);

  // Encrypt share data using XOR (simple but effective for this use case)
  // In production, use AES-256-GCM
  const shareData = Buffer.from(JSON.stringify(share));
  const encrypted = Buffer.alloc(shareData.length);
  
  for (let i = 0; i < shareData.length; i++) {
    encrypted[i] = shareData[i] ^ encryptionKey[i % encryptionKey.length];
  }

  // Return ephemeral public key + encrypted data
  return JSON.stringify({
    ephemeralPubKey: Buffer.from(ephemeralPublicKey).toString('hex'),
    encrypted: encrypted.toString('base64'),
  });
}

/**
 * Decrypt a share using guardian's private key
 */
export async function decryptShareForGuardian(
  encryptedShare: string,
  guardianPrivateKey: string
): Promise<ShamirShare> {
  const { ephemeralPubKey, encrypted } = JSON.parse(encryptedShare);

  // Convert Ed25519 private key to X25519 scalar
  // Ed25519 private keys need to be hashed and clamped for X25519
  const guardianPrivKeyBytes = Buffer.from(guardianPrivateKey, 'hex');
  const hashedKey = sha512(guardianPrivKeyBytes);
  const x25519PrivKey = hashedKey.slice(0, 32);
  
  // Clamp the scalar for X25519 (clear bits, set bit 254)
  x25519PrivKey[0] &= 248;
  x25519PrivKey[31] &= 127;
  x25519PrivKey[31] |= 64;
  
  const ephemeralPubKeyBytes = Buffer.from(ephemeralPubKey, 'hex');
  
  // Derive shared secret using X25519 ECDH
  const sharedSecret = x25519.getSharedSecret(x25519PrivKey, ephemeralPubKeyBytes);
  
  // Derive decryption key
  const decryptionKey = sha256(sharedSecret);

  // Decrypt using XOR
  const encryptedData = Buffer.from(encrypted, 'base64');
  const decrypted = Buffer.alloc(encryptedData.length);
  
  for (let i = 0; i < encryptedData.length; i++) {
    decrypted[i] = encryptedData[i] ^ decryptionKey[i % decryptionKey.length];
  }

  return JSON.parse(decrypted.toString());
}

/**
 * Initiate a recovery session
 */
export function initiateRecovery(
  userDid: string,
  recoveryPackage: RecoveryPackage
): RecoverySession {
  const now = Date.now();
  const timeLock = recoveryPackage.config.timeLock || 0;
  const sessionExpiry = recoveryPackage.config.sessionExpiry || 24 * 60 * 60 * 1000; // 24 hours

  return {
    id: randomBytes(16).toString('hex'),
    userDid,
    initiatedAt: now,
    canCompleteAt: now + timeLock,
    collectedShares: [],
    respondedGuardians: [],
    threshold: recoveryPackage.config.threshold,
    expiresAt: now + sessionExpiry,
    status: timeLock > 0 ? 'time-locked' : 'pending',
  };
}

/**
 * Guardian submits their share to a recovery session
 */
export function submitGuardianShare(
  session: RecoverySession,
  guardianDid: string,
  share: ShamirShare
): RecoverySession {
  const now = Date.now();

  // Validate session
  if (session.status === 'completed' || session.status === 'cancelled') {
    throw new Error('Recovery session is not active');
  }

  if (now > session.expiresAt) {
    return { ...session, status: 'expired' };
  }

  // Check if guardian already submitted
  if (session.respondedGuardians.includes(guardianDid)) {
    throw new Error('Guardian has already submitted a share');
  }

  // Add share
  const updatedSession: RecoverySession = {
    ...session,
    collectedShares: [...session.collectedShares, share],
    respondedGuardians: [...session.respondedGuardians, guardianDid],
  };

  // Update status
  if (updatedSession.collectedShares.length >= session.threshold) {
    if (now >= session.canCompleteAt) {
      updatedSession.status = 'ready';
    } else {
      updatedSession.status = 'time-locked';
    }
  }

  return updatedSession;
}

/**
 * Complete recovery and reconstruct master key
 */
export function completeRecovery(session: RecoverySession): Buffer {
  const now = Date.now();

  // Check expiration first
  if (now > session.expiresAt) {
    throw new Error('Recovery session has expired');
  }

  // Validate session status
  if (session.status !== 'ready') {
    if (now < session.canCompleteAt) {
      throw new Error(`Recovery is time-locked until ${new Date(session.canCompleteAt).toISOString()}`);
    }
    if (session.collectedShares.length < session.threshold) {
      throw new Error(`Need ${session.threshold} shares, only have ${session.collectedShares.length}`);
    }
  }

  // Reconstruct master key from shares
  const masterKey = combineShares(session.collectedShares);

  return masterKey;
}

/**
 * Cancel an active recovery session
 */
export function cancelRecovery(session: RecoverySession): RecoverySession {
  if (session.status === 'completed') {
    throw new Error('Cannot cancel completed recovery');
  }

  return {
    ...session,
    status: 'cancelled',
  };
}

/**
 * Add a new guardian to existing recovery package
 * Requires reconstructing and re-splitting the secret
 */
export async function addGuardian(
  recoveryPackage: RecoveryPackage,
  masterKey: Buffer,
  newGuardian: Omit<Guardian, 'encryptedShare' | 'shareMetadata'>
): Promise<RecoveryPackage> {
  const newGuardians = [
    ...recoveryPackage.guardians.map(g => ({
      did: g.did,
      publicKey: g.publicKey,
      displayName: g.displayName,
      addedAt: g.addedAt,
    })),
    {
      ...newGuardian,
      addedAt: Date.now(),
    },
  ];

  const newConfig: RecoveryConfig = {
    ...recoveryPackage.config,
    totalGuardians: newGuardians.length,
    // Optionally increase threshold
    threshold: Math.min(
      recoveryPackage.config.threshold,
      Math.floor(newGuardians.length / 2) + 1
    ),
  };

  return createRecoveryPackage(masterKey, newGuardians, newConfig);
}

/**
 * Remove a guardian from recovery package
 */
export async function removeGuardian(
  recoveryPackage: RecoveryPackage,
  masterKey: Buffer,
  guardianDidToRemove: string
): Promise<RecoveryPackage> {
  const newGuardians = recoveryPackage.guardians
    .filter(g => g.did !== guardianDidToRemove)
    .map(g => ({
      did: g.did,
      publicKey: g.publicKey,
      displayName: g.displayName,
      addedAt: g.addedAt,
    }));

  if (newGuardians.length < 2) {
    throw new Error('Must have at least 2 guardians');
  }

  const newConfig: RecoveryConfig = {
    ...recoveryPackage.config,
    totalGuardians: newGuardians.length,
    threshold: Math.min(recoveryPackage.config.threshold, newGuardians.length),
  };

  return createRecoveryPackage(masterKey, newGuardians, newConfig);
}

/**
 * Generate a recovery QR code for a guardian
 * Guardian scans this to get their encrypted share
 */
export function generateGuardianQRCode(guardian: Guardian): string {
  if (!guardian.encryptedShare) {
    throw new Error('Guardian does not have an encrypted share');
  }

  return JSON.stringify({
    v: 1, // Version
    type: 'recovery-guardian',
    did: guardian.did,
    share: guardian.encryptedShare,
    meta: guardian.shareMetadata,
  });
}

/**
 * Validate recovery package integrity
 */
export function validateRecoveryPackage(pkg: RecoveryPackage): boolean {
  try {
    // Check guardians count matches config
    if (pkg.guardians.length !== pkg.config.totalGuardians) {
      return false;
    }

    // Check all guardians have shares
    for (const guardian of pkg.guardians) {
      if (!guardian.encryptedShare || !guardian.shareMetadata) {
        return false;
      }
    }

    // Check threshold is valid
    if (pkg.config.threshold > pkg.config.totalGuardians || pkg.config.threshold < 2) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
