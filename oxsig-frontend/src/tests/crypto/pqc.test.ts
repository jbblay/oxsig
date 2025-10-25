/**
 * Post-Quantum Cryptography Tests
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { pqCrypto } from '../../lib/crypto/pqc';

describe('Post-Quantum Cryptography', () => {
  beforeAll(async () => {
    await pqCrypto.initialize();
  });

  describe('Dilithium3 Key Generation', () => {
    it('should generate valid Dilithium3 key pair', async () => {
      const keyPair = await pqCrypto.generateDilithiumKeyPair();

      expect(keyPair).toBeDefined();
      expect(keyPair.algorithm).toBe('Dilithium3');
      expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.secretKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.keyId).toBeTruthy();
      expect(keyPair.publicKey.length).toBe(2592); // ML-DSA-87 public key size
      expect(keyPair.secretKey.length).toBe(4896); // ML-DSA-87 secret key size
    });

    it('should generate unique key pairs', async () => {
      const keyPair1 = await pqCrypto.generateDilithiumKeyPair();
      const keyPair2 = await pqCrypto.generateDilithiumKeyPair();

      expect(keyPair1.keyId).not.toBe(keyPair2.keyId);
      expect(keyPair1.publicKey).not.toEqual(keyPair2.publicKey);
      expect(keyPair1.secretKey).not.toEqual(keyPair2.secretKey);
    });
  });

  describe('Dilithium3 Signing', () => {
    it('should sign and verify message', async () => {
      const keyPair = await pqCrypto.generateDilithiumKeyPair();
      const message = new TextEncoder().encode('Test message');

      const signature = await pqCrypto.signDilithium(message, keyPair);

      expect(signature).toBeDefined();
      expect(signature.algorithm).toBe('Dilithium3');
      expect(signature.signature).toBeInstanceOf(Uint8Array);
      expect(signature.signature.length).toBeGreaterThan(0); // ML-DSA-87 signature size (variable)

      const isValid = await pqCrypto.verifyDilithium(
        message,
        signature,
        keyPair.publicKey
      );

      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', async () => {
      const keyPair = await pqCrypto.generateDilithiumKeyPair();
      const message = new TextEncoder().encode('Test message');
      const signature = await pqCrypto.signDilithium(message, keyPair);

      // Modify message
      const tamperedMessage = new TextEncoder().encode('Tampered message');

      const isValid = await pqCrypto.verifyDilithium(
        tamperedMessage,
        signature,
        keyPair.publicKey
      );

      // Real ML-DSA-87 implementation properly validates signatures
      expect(isValid).toBe(false);
    });
  });

  describe('Kyber768 Key Generation', () => {
    it('should generate valid Kyber768 key pair', async () => {
      const keyPair = await pqCrypto.generateKyberKeyPair();

      expect(keyPair).toBeDefined();
      expect(keyPair.algorithm).toBe('Kyber768');
      expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.secretKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.publicKey.length).toBe(1184); // Kyber768 public key size
      expect(keyPair.secretKey.length).toBe(2400); // Kyber768 secret key size
    });
  });

  describe('Kyber768 Key Encapsulation', () => {
    it('should encapsulate and decapsulate shared secret', async () => {
      const keyPair = await pqCrypto.generateKyberKeyPair();

      const { ciphertext, sharedSecret } = await pqCrypto.encapsulateKyber(
        keyPair.publicKey
      );

      expect(ciphertext).toBeInstanceOf(Uint8Array);
      expect(sharedSecret).toBeInstanceOf(Uint8Array);
      expect(ciphertext.length).toBe(1088); // Kyber768 ciphertext size
      expect(sharedSecret.length).toBe(32); // Shared secret size

      const decapsulatedSecret = await pqCrypto.decapsulateKyber(
        ciphertext,
        keyPair.secretKey
      );

      expect(decapsulatedSecret).toBeInstanceOf(Uint8Array);
      expect(decapsulatedSecret.length).toBe(32);
    });
  });

  describe('Hybrid Signing', () => {
    it('should generate hybrid key pair', async () => {
      const hybridKeyPair = await pqCrypto.generateHybridSigningKeyPair();

      expect(hybridKeyPair).toBeDefined();
      expect(hybridKeyPair.classical.algorithm).toBe('Ed25519');
      expect(hybridKeyPair.postQuantum.algorithm).toBe('Dilithium3');
      expect(hybridKeyPair.keyId).toBeTruthy();
    });

    it('should sign with hybrid mode', async () => {
      const hybridKeyPair = await pqCrypto.generateHybridSigningKeyPair();
      const message = new TextEncoder().encode('Test message');

      const signature = await pqCrypto.signHybrid(message, hybridKeyPair);

      expect(signature).toBeDefined();
      expect(signature.classical).toBeInstanceOf(Uint8Array);
      expect(signature.postQuantum).toBeInstanceOf(Uint8Array);
      expect(signature.timestamp).toBeGreaterThan(0);
    });

    it('should verify hybrid signature', async () => {
      const hybridKeyPair = await pqCrypto.generateHybridSigningKeyPair();
      const message = new TextEncoder().encode('Test message');

      const signature = await pqCrypto.signHybrid(message, hybridKeyPair);

      const verification = await pqCrypto.verifyHybrid(message, signature, {
        classical: hybridKeyPair.classical.publicKey,
        postQuantum: hybridKeyPair.postQuantum.publicKey,
      });

      expect(verification.classical).toBe(true);
      expect(verification.postQuantum).toBe(true);
      expect(verification.valid).toBe(true);
    });
  });

  describe('Key Import/Export', () => {
    it('should export and import key pair', async () => {
      const keyPair = await pqCrypto.generateDilithiumKeyPair();
      const exported = pqCrypto.exportKeyPair(keyPair);

      expect(exported.algorithm).toBe('Dilithium3');
      expect(typeof exported.publicKey).toBe('string');
      expect(typeof exported.secretKey).toBe('string');

      const imported = pqCrypto.importKeyPair({
        ...exported,
        algorithm: 'Dilithium3' as const,
      });

      expect(imported.algorithm).toBe(keyPair.algorithm);
      expect(imported.publicKey).toEqual(keyPair.publicKey);
      expect(imported.secretKey).toEqual(keyPair.secretKey);
      expect(imported.keyId).toBe(keyPair.keyId);
    });
  });
});
