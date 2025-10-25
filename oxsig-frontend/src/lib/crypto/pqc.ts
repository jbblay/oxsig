/**
 * Post-Quantum Cryptography Module
 * 
 * Implements NIST-approved post-quantum algorithms:
 * - Dilithium3 for digital signatures
 * - Kyber768 for key encapsulation
 * - Hybrid modes combining classical and PQ algorithms
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { sha3_256 } from '@noble/hashes/sha3';
// Import real post-quantum algorithms
import { ml_dsa87 } from '@noble/post-quantum/ml-dsa.js';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';

// Helper to ensure proper ArrayBuffer type
function ensureArrayBuffer(data: Uint8Array): ArrayBuffer {
  if (data.buffer.byteLength === data.byteLength) {
    return data.buffer as ArrayBuffer;
  }
  // If the Uint8Array is a view on a larger buffer, create a copy
  return data.slice().buffer as ArrayBuffer;
}

// Type definitions for PQ algorithms
export interface PQKeyPair {
  algorithm: 'Dilithium3' | 'Kyber768';
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  keyId: string;
  createdAt: number;
}

export interface PQSignature {
  algorithm: 'Dilithium3';
  signature: Uint8Array;
  publicKeyId: string;
  timestamp: number;
}

export interface HybridKeyPair {
  classical: {
    algorithm: 'Ed25519' | 'X25519';
    publicKey: Uint8Array;
    secretKey: Uint8Array;
  };
  postQuantum: {
    algorithm: 'Dilithium3' | 'Kyber768';
    publicKey: Uint8Array;
    secretKey: Uint8Array;
  };
  keyId: string;
  createdAt: number;
}

export interface KyberEncapsulation {
  ciphertext: Uint8Array;
  sharedSecret: Uint8Array;
}

/**
 * Real Post-Quantum Cryptography Implementation
 * Using NIST-approved ML-DSA-87 (Dilithium3) and ML-KEM-768 (Kyber768)
 */

/**
 * Post-Quantum Crypto Provider
 */
export class PQCryptoProvider {
  private static instance: PQCryptoProvider;
  private initialized = false;

  static getInstance(): PQCryptoProvider {
    if (!PQCryptoProvider.instance) {
      PQCryptoProvider.instance = new PQCryptoProvider();
    }
    return PQCryptoProvider.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Using real @noble/post-quantum library
    console.log('✅ Post-quantum cryptography initialized with NIST-approved algorithms');
    
    this.initialized = true;
  }

  /**
   * Generate Dilithium3 signing key pair
   */
  async generateDilithiumKeyPair(): Promise<PQKeyPair> {
    await this.initialize();

    const { publicKey, secretKey } = ml_dsa87.keygen();
    
    return {
      algorithm: 'Dilithium3',
      publicKey,
      secretKey,
      keyId: crypto.randomUUID(),
      createdAt: Date.now(),
    };
  }

  /**
   * Generate Kyber768 key encapsulation key pair
   */
  async generateKyberKeyPair(): Promise<PQKeyPair> {
    await this.initialize();

    const { publicKey, secretKey } = ml_kem768.keygen();
    
    return {
      algorithm: 'Kyber768',
      publicKey,
      secretKey,
      keyId: crypto.randomUUID(),
      createdAt: Date.now(),
    };
  }

  /**
   * Generate hybrid classical + PQ key pair for signing
   */
  async generateHybridSigningKeyPair(): Promise<HybridKeyPair> {
    await this.initialize();

    // Generate Ed25519 key pair
    const ed25519KeyPair = await crypto.subtle.generateKey(
      'Ed25519',
      true,
      ['sign', 'verify']
    );
    
    const ed25519Public = new Uint8Array(await crypto.subtle.exportKey('raw', ed25519KeyPair.publicKey));
    const ed25519Private = new Uint8Array(await crypto.subtle.exportKey('pkcs8', ed25519KeyPair.privateKey));

    // Generate Dilithium3 key pair
    const { publicKey: dilithiumPublic, secretKey: dilithiumSecret } = 
      ml_dsa87.keygen();

    return {
      classical: {
        algorithm: 'Ed25519',
        publicKey: ed25519Public,
        secretKey: ed25519Private,
      },
      postQuantum: {
        algorithm: 'Dilithium3',
        publicKey: dilithiumPublic,
        secretKey: dilithiumSecret,
      },
      keyId: crypto.randomUUID(),
      createdAt: Date.now(),
    };
  }

  /**
   * Sign with Dilithium3
   */
  async signDilithium(message: Uint8Array, keyPair: PQKeyPair): Promise<PQSignature> {
    await this.initialize();

    if (keyPair.algorithm !== 'Dilithium3') {
      throw new Error('Invalid key type for Dilithium signing');
    }

    const signature = ml_dsa87.sign(message, keyPair.secretKey);

    return {
      algorithm: 'Dilithium3',
      signature,
      publicKeyId: keyPair.keyId,
      timestamp: Date.now(),
    };
  }

  /**
   * Verify Dilithium3 signature
   */
  async verifyDilithium(
    message: Uint8Array,
    signature: PQSignature,
    publicKey: Uint8Array
  ): Promise<boolean> {
    await this.initialize();

    return ml_dsa87.verify(signature.signature, message, publicKey);
  }

  /**
   * Hybrid signing (Ed25519 + Dilithium3)
   */
  async signHybrid(message: Uint8Array, hybridKeyPair: HybridKeyPair): Promise<{
    classical: Uint8Array;
    postQuantum: Uint8Array;
    timestamp: number;
  }> {
    await this.initialize();

    // Sign with Ed25519
    const ed25519Key = await crypto.subtle.importKey(
      'pkcs8',
      ensureArrayBuffer(hybridKeyPair.classical.secretKey),
      'Ed25519',
      false,
      ['sign']
    );
    const classicalSigBuffer = await crypto.subtle.sign('Ed25519', ed25519Key, ensureArrayBuffer(message));
    const classicalSig = new Uint8Array(classicalSigBuffer);

    // Sign with Dilithium3
    const pqSig = ml_dsa87.sign(message, hybridKeyPair.postQuantum.secretKey);

    return {
      classical: classicalSig,
      postQuantum: pqSig,
      timestamp: Date.now(),
    };
  }

  /**
   * Verify hybrid signature (both must be valid)
   */
  async verifyHybrid(
    message: Uint8Array,
    signature: { classical: Uint8Array; postQuantum: Uint8Array },
    hybridPublicKey: { classical: Uint8Array; postQuantum: Uint8Array }
  ): Promise<{ classical: boolean; postQuantum: boolean; valid: boolean }> {
    await this.initialize();

    // Verify Ed25519
    const ed25519Key = await crypto.subtle.importKey(
      'raw',
      ensureArrayBuffer(hybridPublicKey.classical),
      'Ed25519',
      false,
      ['verify']
    );
    const classicalValid = await crypto.subtle.verify(
      'Ed25519',
      ed25519Key,
      ensureArrayBuffer(signature.classical),
      ensureArrayBuffer(message)
    );

    // Verify Dilithium3
    const pqValid = ml_dsa87.verify(
      signature.postQuantum,
      message,
      hybridPublicKey.postQuantum
    );

    return {
      classical: classicalValid,
      postQuantum: pqValid,
      valid: classicalValid && pqValid, // Both must pass
    };
  }

  /**
   * Kyber key encapsulation
   */
  async encapsulateKyber(publicKey: Uint8Array): Promise<KyberEncapsulation> {
    await this.initialize();
    const { cipherText, sharedSecret } = ml_kem768.encapsulate(publicKey);
    return {
      ciphertext: cipherText,
      sharedSecret,
    };
  }

  /**
   * Kyber decapsulation
   */
  async decapsulateKyber(ciphertext: Uint8Array, secretKey: Uint8Array): Promise<Uint8Array> {
    await this.initialize();
    return ml_kem768.decapsulate(ciphertext, secretKey);
  }

  /**
   * Export key pair to storable format
   */
  exportKeyPair(keyPair: PQKeyPair): {
    algorithm: string;
    publicKey: string;
    secretKey: string;
    keyId: string;
    createdAt: number;
  } {
    return {
      algorithm: keyPair.algorithm,
      publicKey: bytesToHex(keyPair.publicKey),
      secretKey: bytesToHex(keyPair.secretKey),
      keyId: keyPair.keyId,
      createdAt: keyPair.createdAt,
    };
  }

  /**
   * Import key pair from stored format
   */
  importKeyPair(exported: {
    algorithm: 'Dilithium3' | 'Kyber768';
    publicKey: string;
    secretKey: string;
    keyId: string;
    createdAt: number;
  }): PQKeyPair {
    return {
      algorithm: exported.algorithm,
      publicKey: hexToBytes(exported.publicKey),
      secretKey: hexToBytes(exported.secretKey),
      keyId: exported.keyId,
      createdAt: exported.createdAt,
    };
  }
}

// Export singleton instance
export const pqCrypto = PQCryptoProvider.getInstance();

/**
 * Utility: Determine if quantum-safe crypto should be used
 */
export function shouldUseQuantumSafe(): boolean {
  // Check user preference or security policy
  const stored = localStorage.getItem('quantumSafeEnabled');
  return stored === 'true';
}

/**
 * Enable/disable quantum-safe mode
 */
export function setQuantumSafeMode(enabled: boolean): void {
  localStorage.setItem('quantumSafeEnabled', String(enabled));
  console.log(`Quantum-safe mode ${enabled ? 'enabled' : 'disabled'}`);
}
