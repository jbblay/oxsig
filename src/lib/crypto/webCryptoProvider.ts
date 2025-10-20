/**
 * WebCrypto Provider Implementation
 * 
 * Native browser implementation using the Web Cryptography API
 * Provides hardware acceleration where available and secure key storage
 */

import {
  CryptoProvider,
  CryptoCapabilities,
  CryptoSuite,
  SigningKeyPair,
  SigningPrivateKey,
  SigningPublicKey,
  EncryptionKey,
  Signature,
  EncryptedData,
  KeyDerivationParams,
  CRYPTO_SUITES
} from './agility';

// Utility function to ensure proper ArrayBuffer for WebCrypto API
function ensureArrayBuffer(data: Uint8Array): ArrayBuffer {
  if (data.buffer.byteLength === data.byteLength) {
    return data.buffer as ArrayBuffer;
  }
  // Create a new ArrayBuffer if the Uint8Array is a view of a larger buffer
  return data.slice().buffer as ArrayBuffer;
}

export class WebCryptoProvider implements CryptoProvider {
  readonly name = 'WebCrypto';
  private initialized = false;
  
  readonly capabilities: CryptoCapabilities = {
    suites: [
      CRYPTO_SUITES.STANDARD,
      CRYPTO_SUITES.NIST_COMPLIANT,
      CRYPTO_SUITES.PERFORMANCE
    ],
    hwAcceleration: {
      webCrypto: true,
      wasmSimd: false,
      webGpu: false
    },
    postQuantum: {
      available: false,
      algorithms: [],
      hybridMode: false
    }
  };
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // Check WebCrypto availability
    if (!crypto.subtle) {
      throw new Error('Web Cryptography API not available');
    }
    
    // Benchmark performance
    await this.benchmarkPerformance();
    
    this.initialized = true;
  }
  
  async generateSigningKeyPair(algorithm: CryptoSuite['signing'] = 'Ed25519'): Promise<SigningKeyPair> {
    await this.ensureInitialized();
    
    const keyId = crypto.randomUUID();
    
    switch (algorithm) {
      case 'Ed25519': {
        const keyPair = await crypto.subtle.generateKey(
          { name: 'Ed25519' },
          true, // extractable
          ['sign', 'verify']
        );
        
        const privateKeyData = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
        const publicKeyData = await crypto.subtle.exportKey('spki', keyPair.publicKey);
        
        const publicKey: SigningPublicKey = {
          algorithm: 'Ed25519',
          keyData: new Uint8Array(publicKeyData),
          keyId,
          fingerprint: await this.calculateFingerprint(new Uint8Array(publicKeyData))
        };
        
        const privateKey: SigningPrivateKey = {
          algorithm: 'Ed25519',
          keyData: new Uint8Array(privateKeyData),
          keyId,
          protected: false
        };
        
        return {
          algorithm: 'Ed25519',
          publicKey,
          privateKey,
          keyId,
          createdAt: Date.now()
        };
      }
      
      case 'ECDSA-P256': {
        const keyPair = await crypto.subtle.generateKey(
          {
            name: 'ECDSA',
            namedCurve: 'P-256'
          },
          true,
          ['sign', 'verify']
        );
        
        const privateKeyData = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
        const publicKeyData = await crypto.subtle.exportKey('spki', keyPair.publicKey);
        
        const publicKey: SigningPublicKey = {
          algorithm: 'ECDSA-P256',
          keyData: new Uint8Array(publicKeyData),
          keyId,
          fingerprint: await this.calculateFingerprint(new Uint8Array(publicKeyData))
        };
        
        const privateKey: SigningPrivateKey = {
          algorithm: 'ECDSA-P256',
          keyData: new Uint8Array(privateKeyData),
          keyId,
          protected: false
        };
        
        return {
          algorithm: 'ECDSA-P256',
          publicKey,
          privateKey,
          keyId,
          createdAt: Date.now()
        };
      }
      
      default:
        throw new Error(`Unsupported signing algorithm: ${algorithm}`);
    }
  }
  
  async generateEncryptionKey(algorithm: CryptoSuite['encryption'] = 'AES-256-GCM'): Promise<EncryptionKey> {
    await this.ensureInitialized();
    
    const keyId = crypto.randomUUID();
    
    switch (algorithm) {
      case 'AES-256-GCM': {
        const key = await crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );
        
        const keyData = await crypto.subtle.exportKey('raw', key);
        
        return {
          algorithm: 'AES-256-GCM',
          keyData: new Uint8Array(keyData),
          keyId,
          purpose: 'both'
        };
      }
      
      default:
        throw new Error(`Unsupported encryption algorithm: ${algorithm}`);
    }
  }
  
  async sign(data: Uint8Array, privateKey: SigningPrivateKey): Promise<Signature> {
    await this.ensureInitialized();
    
    switch (privateKey.algorithm) {
      case 'Ed25519': {
        const key = await crypto.subtle.importKey(
          'pkcs8',
          ensureArrayBuffer(privateKey.keyData),
          { name: 'Ed25519' },
          false,
          ['sign']
        );
        
        const signature = await crypto.subtle.sign('Ed25519', key, ensureArrayBuffer(data));
        
        return {
          algorithm: 'Ed25519',
          signature: new Uint8Array(signature),
          publicKeyId: privateKey.keyId,
          timestamp: Date.now()
        };
      }
      
      case 'ECDSA-P256': {
        const key = await crypto.subtle.importKey(
          'pkcs8',
          ensureArrayBuffer(privateKey.keyData),
          {
            name: 'ECDSA',
            namedCurve: 'P-256'
          },
          false,
          ['sign']
        );
        
        const signature = await crypto.subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          key,
          ensureArrayBuffer(data)
        );
        
        return {
          algorithm: 'ECDSA-P256',
          signature: new Uint8Array(signature),
          publicKeyId: privateKey.keyId,
          timestamp: Date.now()
        };
      }
      
      default:
        throw new Error(`Unsupported signing algorithm: ${privateKey.algorithm}`);
    }
  }
  
  async verify(data: Uint8Array, signature: Signature, publicKey: SigningPublicKey): Promise<boolean> {
    await this.ensureInitialized();
    
    try {
      switch (signature.algorithm) {
        case 'Ed25519': {
          const key = await crypto.subtle.importKey(
            'spki',
            ensureArrayBuffer(publicKey.keyData),
            { name: 'Ed25519' },
            false,
            ['verify']
          );
          
          return await crypto.subtle.verify('Ed25519', key, ensureArrayBuffer(signature.signature), ensureArrayBuffer(data));
        }
        
        case 'ECDSA-P256': {
          const key = await crypto.subtle.importKey(
            'spki',
            ensureArrayBuffer(publicKey.keyData),
            {
              name: 'ECDSA',
              namedCurve: 'P-256'
            },
            false,
            ['verify']
          );
          
          return await crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            key,
            ensureArrayBuffer(signature.signature),
            ensureArrayBuffer(data)
          );
        }
        
        default:
          return false;
      }
    } catch (error) {
      console.error('Signature verification failed:', error);
      return false;
    }
  }
  
  async encrypt(data: Uint8Array, key: EncryptionKey): Promise<EncryptedData> {
    await this.ensureInitialized();
    
    switch (key.algorithm) {
      case 'AES-256-GCM': {
        const cryptoKey = await crypto.subtle.importKey(
          'raw',
          ensureArrayBuffer(key.keyData),
          { name: 'AES-GCM' },
          false,
          ['encrypt']
        );
        
        const nonce = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv: nonce },
          cryptoKey,
          ensureArrayBuffer(data)
        );
        
        return {
          algorithm: 'AES-256-GCM',
          ciphertext: new Uint8Array(ciphertext),
          nonce
        };
      }
      
      default:
        throw new Error(`Unsupported encryption algorithm: ${key.algorithm}`);
    }
  }
  
  async decrypt(encryptedData: EncryptedData, key: EncryptionKey): Promise<Uint8Array> {
    await this.ensureInitialized();
    
    switch (encryptedData.algorithm) {
      case 'AES-256-GCM': {
        const cryptoKey = await crypto.subtle.importKey(
          'raw',
          ensureArrayBuffer(key.keyData),
          { name: 'AES-GCM' },
          false,
          ['decrypt']
        );
        
        const plaintext = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: ensureArrayBuffer(encryptedData.nonce) },
          cryptoKey,
          ensureArrayBuffer(encryptedData.ciphertext)
        );
        
        return new Uint8Array(plaintext);
      }
      
      default:
        throw new Error(`Unsupported encryption algorithm: ${encryptedData.algorithm}`);
    }
  }
  
  async deriveKey(
    password: string,
    salt: Uint8Array,
    params: KeyDerivationParams = {}
  ): Promise<EncryptionKey> {
    await this.ensureInitialized();
    
    const {
      iterations = 100000,
      saltLength = 32
    } = params;
    
    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    
    // Derive AES key
    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: ensureArrayBuffer(salt),
        iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['encrypt', 'decrypt']
    );
    
    const keyData = await crypto.subtle.exportKey('raw', derivedKey);
    
    return {
      algorithm: 'AES-256-GCM',
      keyData: new Uint8Array(keyData),
      keyId: crypto.randomUUID(),
      purpose: 'both'
    };
  }
  
  async hash(data: Uint8Array, algorithm: CryptoSuite['hash'] = 'SHA-256'): Promise<Uint8Array> {
    await this.ensureInitialized();
    
    let webCryptoAlg: string;
    switch (algorithm) {
      case 'SHA-256':
        webCryptoAlg = 'SHA-256';
        break;
      case 'SHA3-256':
        // WebCrypto doesn't support SHA-3, would need polyfill
        throw new Error('SHA3-256 not supported by WebCrypto');
      case 'BLAKE3':
        // WebCrypto doesn't support BLAKE3, would need polyfill
        throw new Error('BLAKE3 not supported by WebCrypto');
      default:
        throw new Error(`Unsupported hash algorithm: ${algorithm}`);
    }
    
    const hashBuffer = await crypto.subtle.digest(webCryptoAlg, ensureArrayBuffer(data));
    return new Uint8Array(hashBuffer);
  }
  
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
  
  private async calculateFingerprint(publicKeyData: Uint8Array): Promise<string> {
    const hash = await this.hash(publicKeyData, 'SHA-256');
    return Array.from(hash)
      .map(b => b.toString(16).padStart(2, '0'))
      .join(':')
      .toUpperCase();
  }
  
  private async benchmarkPerformance(): Promise<void> {
    try {
      // Generate test key pair
      const keyPair = await crypto.subtle.generateKey(
        { name: 'Ed25519' },
        false,
        ['sign', 'verify']
      );
      
      const testData = crypto.getRandomValues(new Uint8Array(1024));
      
      // Benchmark signing
      const signStart = performance.now();
      const signature = await crypto.subtle.sign('Ed25519', keyPair.privateKey, testData);
      const signEnd = performance.now();
      
      // Benchmark verification
      const verifyStart = performance.now();
      await crypto.subtle.verify('Ed25519', keyPair.publicKey, signature, testData);
      const verifyEnd = performance.now();
      
      // Benchmark encryption
      const encKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
      
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encStart = performance.now();
      const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, encKey, testData);
      const encEnd = performance.now();
      
      // Benchmark decryption
      const decStart = performance.now();
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, encKey, encrypted);
      const decEnd = performance.now();
      
      // Update capabilities with benchmarks
      this.capabilities.benchmarks = [{
        suite: CRYPTO_SUITES.STANDARD,
        signingMs: signEnd - signStart,
        verificationMs: verifyEnd - verifyStart,
        encryptionMbps: (testData.length / ((encEnd - encStart) / 1000)) / (1024 * 1024),
        decryptionMbps: (testData.length / ((decEnd - decStart) / 1000)) / (1024 * 1024)
      }];
      
    } catch (error) {
      console.warn('Performance benchmarking failed:', error);
    }
  }
}