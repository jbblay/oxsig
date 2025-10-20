/**
 * Cryptographic Agility Framework
 * 
 * This module provides a single source of truth for cryptographic algorithms,
 * enabling easy algorithm switching and hybrid post-quantum/classical implementations.
 * 
 * Design principles:
 * - Algorithm negotiation and fallback
 * - Future-proof interface design
 * - Performance optimization hooks
 * - Compliance and audit support
 */

// =============================================================================
// Core Interfaces
// =============================================================================

export interface CryptoSuite {
  /** Digital signature algorithm */
  signing: 'Ed25519' | 'ECDSA-P256' | 'Dilithium3' | 'Hybrid-Ed25519-Dilithium';
  
  /** Symmetric encryption algorithm */
  encryption: 'AES-256-GCM' | 'ChaCha20-Poly1305' | 'AES-256-SIV';
  
  /** Key exchange/agreement algorithm */
  keyExchange: 'X25519' | 'ECDH-P256' | 'Kyber768' | 'Hybrid-X25519-Kyber';
  
  /** Hash function */
  hash: 'SHA-256' | 'SHA3-256' | 'BLAKE3';
  
  /** Key derivation function */
  kdf: 'HKDF-SHA256' | 'PBKDF2-SHA256' | 'Argon2id';
}

export interface CryptoCapabilities {
  /** Available algorithm suites */
  suites: CryptoSuite[];
  
  /** Hardware acceleration support */
  hwAcceleration: {
    webCrypto: boolean;
    wasmSimd: boolean;
    webGpu: boolean;
  };
  
  /** Post-quantum readiness */
  postQuantum: {
    available: boolean;
    algorithms: string[];
    hybridMode: boolean;
  };
  
  /** Performance characteristics */
  benchmarks?: {
    suite: CryptoSuite;
    signingMs: number;
    verificationMs: number;
    encryptionMbps: number;
    decryptionMbps: number;
  }[];
}

export interface CryptoProvider {
  /** Provider identifier */
  readonly name: string;
  
  /** Supported capabilities */
  readonly capabilities: CryptoCapabilities;
  
  /** Initialize the provider */
  initialize(): Promise<void>;
  
  /** Generate key pair for signing */
  generateSigningKeyPair(algorithm?: CryptoSuite['signing']): Promise<SigningKeyPair>;
  
  /** Generate key for encryption */
  generateEncryptionKey(algorithm?: CryptoSuite['encryption']): Promise<EncryptionKey>;
  
  /** Sign data */
  sign(data: Uint8Array, privateKey: SigningPrivateKey): Promise<Signature>;
  
  /** Verify signature */
  verify(data: Uint8Array, signature: Signature, publicKey: SigningPublicKey): Promise<boolean>;
  
  /** Encrypt data */
  encrypt(data: Uint8Array, key: EncryptionKey): Promise<EncryptedData>;
  
  /** Decrypt data */
  decrypt(encryptedData: EncryptedData, key: EncryptionKey): Promise<Uint8Array>;
  
  /** Derive key from password */
  deriveKey(password: string, salt: Uint8Array, params?: KeyDerivationParams): Promise<EncryptionKey>;
  
  /** Hash data */
  hash(data: Uint8Array, algorithm?: CryptoSuite['hash']): Promise<Uint8Array>;
}

// =============================================================================
// Key Types
// =============================================================================

export interface SigningKeyPair {
  algorithm: CryptoSuite['signing'];
  publicKey: SigningPublicKey;
  privateKey: SigningPrivateKey;
  keyId: string;
  createdAt: number;
}

export interface SigningPublicKey {
  algorithm: CryptoSuite['signing'];
  keyData: Uint8Array;
  keyId: string;
  fingerprint: string;
}

export interface SigningPrivateKey {
  algorithm: CryptoSuite['signing'];
  keyData: Uint8Array;
  keyId: string;
  protected: boolean; // Hardware-protected key
}

export interface EncryptionKey {
  algorithm: CryptoSuite['encryption'];
  keyData: Uint8Array;
  keyId: string;
  purpose: 'encrypt' | 'decrypt' | 'both';
}

export interface Signature {
  algorithm: CryptoSuite['signing'];
  signature: Uint8Array;
  publicKeyId: string;
  timestamp: number;
  nonce?: Uint8Array;
}

export interface EncryptedData {
  algorithm: CryptoSuite['encryption'];
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  additionalData?: Uint8Array;
  tag?: Uint8Array;
}

export interface KeyDerivationParams {
  iterations?: number;
  memory?: number;
  parallelism?: number;
  saltLength?: number;
}

// =============================================================================
// Algorithm Negotiation
// =============================================================================

export interface AlgorithmNegotiation {
  /** Client's preferred suites (in order) */
  clientSuites: CryptoSuite[];
  
  /** Server's supported suites */
  serverSuites: CryptoSuite[];
  
  /** Security level requirements */
  securityLevel: 'standard' | 'high' | 'post-quantum';
  
  /** Performance constraints */
  constraints?: {
    maxSigningLatencyMs?: number;
    maxEncryptionLatencyMs?: number;
    minThroughputMbps?: number;
  };
}

export interface NegotiationResult {
  /** Selected crypto suite */
  suite: CryptoSuite;
  
  /** Reason for selection */
  reason: 'preferred' | 'fallback' | 'security-required' | 'performance-optimized';
  
  /** Alternative suites available */
  alternatives: CryptoSuite[];
}

// =============================================================================
// Predefined Suites
// =============================================================================

export const CRYPTO_SUITES = {
  /** Standard suite for current production use */
  STANDARD: {
    signing: 'Ed25519',
    encryption: 'AES-256-GCM',
    keyExchange: 'X25519',
    hash: 'SHA-256',
    kdf: 'HKDF-SHA256'
  } as CryptoSuite,
  
  /** High-performance suite */
  PERFORMANCE: {
    signing: 'Ed25519',
    encryption: 'ChaCha20-Poly1305',
    keyExchange: 'X25519', 
    hash: 'BLAKE3',
    kdf: 'HKDF-SHA256'
  } as CryptoSuite,
  
  /** NIST-compliant suite */
  NIST_COMPLIANT: {
    signing: 'ECDSA-P256',
    encryption: 'AES-256-GCM',
    keyExchange: 'ECDH-P256',
    hash: 'SHA-256',
    kdf: 'PBKDF2-SHA256'
  } as CryptoSuite,
  
  /** Post-quantum suite (future) */
  POST_QUANTUM: {
    signing: 'Dilithium3',
    encryption: 'AES-256-GCM', // No PQ encryption yet
    keyExchange: 'Kyber768',
    hash: 'SHA3-256',
    kdf: 'HKDF-SHA256'
  } as CryptoSuite,
  
  /** Hybrid classical/post-quantum suite */
  HYBRID_PQ: {
    signing: 'Hybrid-Ed25519-Dilithium',
    encryption: 'AES-256-GCM',
    keyExchange: 'Hybrid-X25519-Kyber',
    hash: 'SHA3-256',
    kdf: 'HKDF-SHA256'
  } as CryptoSuite,
} as const;

// =============================================================================
// Provider Registry
// =============================================================================

export class CryptoProviderRegistry {
  private providers = new Map<string, CryptoProvider>();
  private defaultProvider: string | null = null;
  
  /** Register a crypto provider */
  register(provider: CryptoProvider): void {
    this.providers.set(provider.name, provider);
    
    if (!this.defaultProvider) {
      this.defaultProvider = provider.name;
    }
  }
  
  /** Get provider by name */
  getProvider(name?: string): CryptoProvider | null {
    const providerName = name || this.defaultProvider;
    return providerName ? this.providers.get(providerName) || null : null;
  }
  
  /** List all providers */
  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }
  
  /** Get best provider for suite */
  getBestProvider(suite: CryptoSuite): CryptoProvider | null {
    for (const provider of this.providers.values()) {
      if (this.supportsSuite(provider, suite)) {
        return provider;
      }
    }
    return null;
  }
  
  /** Check if provider supports suite */
  private supportsSuite(provider: CryptoProvider, suite: CryptoSuite): boolean {
    return provider.capabilities.suites.some(supported =>
      supported.signing === suite.signing &&
      supported.encryption === suite.encryption &&
      supported.keyExchange === suite.keyExchange &&
      supported.hash === suite.hash &&
      supported.kdf === suite.kdf
    );
  }
}

// =============================================================================
// Algorithm Negotiation Logic
// =============================================================================

export class AlgorithmNegotiator {
  /** Negotiate best crypto suite */
  static negotiate(negotiation: AlgorithmNegotiation): NegotiationResult {
    // 1. Find intersection of client and server suites
    const commonSuites = negotiation.clientSuites.filter(clientSuite =>
      negotiation.serverSuites.some(serverSuite =>
        this.suitesEqual(clientSuite, serverSuite)
      )
    );
    
    if (commonSuites.length === 0) {
      throw new Error('No common crypto suites available');
    }
    
    // 2. Apply security level requirements
    const secureSuites = commonSuites.filter(suite =>
      this.meetsSecurityLevel(suite, negotiation.securityLevel)
    );
    
    if (secureSuites.length === 0) {
      throw new Error(`No suites meet ${negotiation.securityLevel} security level`);
    }
    
    // 3. Select best suite based on preferences and constraints
    const selectedSuite = this.selectBestSuite(secureSuites, negotiation.constraints);
    
    return {
      suite: selectedSuite,
      reason: this.determineSelectionReason(selectedSuite, negotiation),
      alternatives: secureSuites.filter(s => !this.suitesEqual(s, selectedSuite))
    };
  }
  
  private static suitesEqual(a: CryptoSuite, b: CryptoSuite): boolean {
    return (
      a.signing === b.signing &&
      a.encryption === b.encryption &&
      a.keyExchange === b.keyExchange &&
      a.hash === b.hash &&
      a.kdf === b.kdf
    );
  }
  
  private static meetsSecurityLevel(suite: CryptoSuite, level: string): boolean {
    switch (level) {
      case 'standard':
        return true; // All current suites meet standard level
        
      case 'high':
        // Require strong algorithms
        return (
          ['Ed25519', 'ECDSA-P256'].includes(suite.signing) &&
          ['AES-256-GCM', 'ChaCha20-Poly1305'].includes(suite.encryption)
        );
        
      case 'post-quantum':
        // Require post-quantum or hybrid algorithms
        return (
          suite.signing.includes('Dilithium') ||
          suite.keyExchange.includes('Kyber')
        );
        
      default:
        return false;
    }
  }
  
  private static selectBestSuite(
    suites: CryptoSuite[], 
    constraints?: AlgorithmNegotiation['constraints']
  ): CryptoSuite {
    // For now, return first suite (client's most preferred)
    // In the future, could optimize based on performance benchmarks
    return suites[0];
  }
  
  private static determineSelectionReason(
    selected: CryptoSuite, 
    negotiation: AlgorithmNegotiation
  ): NegotiationResult['reason'] {
    if (this.suitesEqual(selected, negotiation.clientSuites[0])) {
      return 'preferred';
    }
    
    if (negotiation.securityLevel === 'post-quantum') {
      return 'security-required';
    }
    
    return 'fallback';
  }
}

// =============================================================================
// Migration & Compatibility
// =============================================================================

export interface MigrationPlan {
  /** Current algorithm being migrated from */
  from: CryptoSuite;
  
  /** Target algorithm being migrated to */
  to: CryptoSuite;
  
  /** Migration timeline */
  timeline: {
    deprecationDate: Date;
    migrationDeadline: Date;
    removalDate: Date;
  };
  
  /** Backwards compatibility period */
  compatibilityPeriod: number; // milliseconds
  
  /** Migration steps */
  steps: MigrationStep[];
}

export interface MigrationStep {
  description: string;
  automated: boolean;
  estimatedDuration: number; // milliseconds
  dependencies: string[];
}

export class CryptoMigrationManager {
  private plans = new Map<string, MigrationPlan>();
  
  /** Add migration plan */
  addMigrationPlan(id: string, plan: MigrationPlan): void {
    this.plans.set(id, plan);
  }
  
  /** Get active migration plans */
  getActivePlans(): Map<string, MigrationPlan> {
    const now = new Date();
    const active = new Map<string, MigrationPlan>();
    
    for (const [id, plan] of this.plans) {
      if (now < plan.timeline.removalDate) {
        active.set(id, plan);
      }
    }
    
    return active;
  }
  
  /** Check if algorithm is deprecated */
  isDeprecated(suite: CryptoSuite): boolean {
    const now = new Date();
    
    for (const plan of this.plans.values()) {
      if (this.suitesEqual(plan.from, suite) && now > plan.timeline.deprecationDate) {
        return true;
      }
    }
    
    return false;
  }
  
  private suitesEqual(a: CryptoSuite, b: CryptoSuite): boolean {
    return AlgorithmNegotiator['suitesEqual'](a, b);
  }
}

// =============================================================================
// Global Registry Instance
// =============================================================================

export const cryptoRegistry = new CryptoProviderRegistry();
export const migrationManager = new CryptoMigrationManager();