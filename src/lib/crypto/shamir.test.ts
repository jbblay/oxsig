/**
 * Shamir's Secret Sharing Tests
 * Critical security tests for cryptographic secret splitting
 */

import { describe, it, expect } from 'vitest';
import {
  splitSecret,
  combineShares,
  verifyShares,
  refreshShares,
  shareToQRFormat,
  shareFromQRFormat,
  type ShamirShare,
} from './shamir';
import { randomBytes } from 'crypto';

describe('Shamir Secret Sharing', () => {
  describe('Basic Functionality', () => {
    it('should split and reconstruct a 32-byte secret correctly', () => {
      const secret = randomBytes(32);
      const shares = splitSecret(secret, 3, 5);

      expect(shares).toHaveLength(5);
      expect(shares[0].threshold).toBe(3);
      expect(shares[0].total).toBe(5);

      // Reconstruct with exactly threshold shares
      const reconstructed = combineShares(shares.slice(0, 3));
      expect(Buffer.compare(reconstructed, secret)).toBe(0);
    });

    it('should work with minimum threshold of 2', () => {
      const secret = Buffer.from('test secret 123');
      const shares = splitSecret(secret, 2, 3);

      const reconstructed = combineShares([shares[0], shares[1]]);
      expect(reconstructed.toString()).toBe('test secret 123');
    });

    it('should work with maximum shares (255)', () => {
      const secret = randomBytes(16);
      const shares = splitSecret(secret, 128, 255);

      expect(shares).toHaveLength(255);

      // Use exactly threshold shares
      const reconstructed = combineShares(shares.slice(0, 128));
      expect(Buffer.compare(reconstructed, secret)).toBe(0);
    });

    it('should reconstruct with any combination of threshold shares', () => {
      const secret = randomBytes(32);
      const shares = splitSecret(secret, 3, 5);

      // Test different combinations
      const combinations = [
        [shares[0], shares[1], shares[2]],
        [shares[0], shares[2], shares[4]],
        [shares[1], shares[3], shares[4]],
        [shares[0], shares[3], shares[4]],
      ];

      for (const combo of combinations) {
        const reconstructed = combineShares(combo);
        expect(Buffer.compare(reconstructed, secret)).toBe(0);
      }
    });

    it('should handle different secret lengths', () => {
      const lengths = [1, 16, 32, 64, 128, 256];

      for (const length of lengths) {
        const secret = randomBytes(length);
        const shares = splitSecret(secret, 2, 3);
        const reconstructed = combineShares(shares.slice(0, 2));
        expect(Buffer.compare(reconstructed, secret)).toBe(0);
      }
    });
  });

  describe('Security Properties', () => {
    it('should fail with insufficient shares', () => {
      const secret = randomBytes(32);
      const shares = splitSecret(secret, 3, 5);

      // Only 2 shares when 3 required
      expect(() => combineShares(shares.slice(0, 2))).toThrow();
    });

    it('should not reveal secret with threshold - 1 shares', () => {
      const secret = randomBytes(32);
      const shares = splitSecret(secret, 3, 5);

      // Having 2 shares should not allow reconstruction
      expect(() => combineShares([shares[0], shares[1]])).toThrow();
    });

    it('should produce different shares for same secret on different splits', () => {
      const secret = randomBytes(32);
      const shares1 = splitSecret(secret, 3, 5);
      const shares2 = splitSecret(secret, 3, 5);

      // Shares should be different (random coefficients)
      expect(shares1[0].data).not.toBe(shares2[0].data);
      expect(shares1[1].data).not.toBe(shares2[1].data);

      // But both should reconstruct to same secret
      const r1 = combineShares(shares1.slice(0, 3));
      const r2 = combineShares(shares2.slice(0, 3));
      expect(Buffer.compare(r1, r2)).toBe(0);
      expect(Buffer.compare(r1, secret)).toBe(0);
    });

    it('should fail with mismatched share parameters', () => {
      const secret1 = randomBytes(32);
      const secret2 = randomBytes(32);
      const shares1 = splitSecret(secret1, 3, 5);
      const shares2 = splitSecret(secret2, 3, 5);

      // Mix shares from different splits
      expect(() => combineShares([shares1[0], shares1[1], shares2[2]])).toThrow();
    });

    it('should handle all-zero secret', () => {
      const secret = Buffer.alloc(32, 0);
      const shares = splitSecret(secret, 3, 5);
      const reconstructed = combineShares(shares.slice(0, 3));
      expect(Buffer.compare(reconstructed, secret)).toBe(0);
    });

    it('should handle all-ones secret', () => {
      const secret = Buffer.alloc(32, 255);
      const shares = splitSecret(secret, 3, 5);
      const reconstructed = combineShares(shares.slice(0, 3));
      expect(Buffer.compare(reconstructed, secret)).toBe(0);
    });
  });

  describe('Input Validation', () => {
    it('should reject threshold < 2', () => {
      const secret = randomBytes(32);
      expect(() => splitSecret(secret, 1, 5)).toThrow('Threshold must be at least 2');
    });

    it('should reject total shares < threshold', () => {
      const secret = randomBytes(32);
      expect(() => splitSecret(secret, 5, 3)).toThrow('Total shares must be >= threshold');
    });

    it('should reject total shares > 255', () => {
      const secret = randomBytes(32);
      expect(() => splitSecret(secret, 3, 256)).toThrow('Maximum 255 shares supported');
    });

    it('should reject empty secret', () => {
      const secret = Buffer.alloc(0);
      expect(() => splitSecret(secret, 3, 5)).toThrow('Secret cannot be empty');
    });

    it('should reject no shares for reconstruction', () => {
      expect(() => combineShares([])).toThrow('No shares provided');
    });

    it('should reject shares with different lengths', () => {
      const secret1 = randomBytes(32);
      const secret2 = randomBytes(16);
      const shares1 = splitSecret(secret1, 2, 3);
      const shares2 = splitSecret(secret2, 2, 3);

      // Create invalid share set with different lengths
      const invalidShares: ShamirShare[] = [
        shares1[0],
        { ...shares2[0], id: 2, threshold: 2, total: 3 },
      ];

      expect(() => combineShares(invalidShares)).toThrow('different lengths');
    });
  });

  describe('Share Verification', () => {
    it('should verify valid shares', () => {
      const secret = randomBytes(32);
      const shares = splitSecret(secret, 3, 5);

      expect(verifyShares(shares.slice(0, 3))).toBe(true);
      expect(verifyShares(shares.slice(0, 4))).toBe(true);
      expect(verifyShares(shares)).toBe(true);
    });

    it('should reject insufficient shares', () => {
      const secret = randomBytes(32);
      const shares = splitSecret(secret, 3, 5);

      expect(verifyShares(shares.slice(0, 2))).toBe(false);
    });

    it('should reject empty share array', () => {
      expect(verifyShares([])).toBe(false);
    });

    it('should reject shares with incompatible parameters', () => {
      const secret1 = randomBytes(32);
      const secret2 = randomBytes(32);
      const shares1 = splitSecret(secret1, 3, 5);
      const shares2 = splitSecret(secret2, 4, 6);

      // Mix shares with different parameters
      const mixed = [shares1[0], shares2[1], shares1[2]];
      expect(verifyShares(mixed)).toBe(false);
    });
  });

  describe('Share Refresh', () => {
    it('should refresh shares with new threshold', () => {
      const secret = randomBytes(32);
      const oldShares = splitSecret(secret, 3, 5);

      // Refresh to 4-of-7
      const newShares = refreshShares(oldShares.slice(0, 3), 4, 7);

      expect(newShares).toHaveLength(7);
      expect(newShares[0].threshold).toBe(4);
      expect(newShares[0].total).toBe(7);

      // Should reconstruct same secret
      const reconstructed = combineShares(newShares.slice(0, 4));
      expect(Buffer.compare(reconstructed, secret)).toBe(0);
    });

    it('should refresh shares with same parameters', () => {
      const secret = randomBytes(32);
      const oldShares = splitSecret(secret, 3, 5);

      // Refresh with same parameters (generates new shares)
      const newShares = refreshShares(oldShares.slice(0, 3), 3, 5);

      // Shares should be different
      expect(newShares[0].data).not.toBe(oldShares[0].data);

      // But reconstruct same secret
      const reconstructed = combineShares(newShares.slice(0, 3));
      expect(Buffer.compare(reconstructed, secret)).toBe(0);
    });
  });

  describe('QR Code Format', () => {
    it('should convert share to QR format and back', () => {
      const secret = randomBytes(32);
      const shares = splitSecret(secret, 3, 5);
      const share = shares[0];

      const qrFormat = shareToQRFormat(share);
      expect(typeof qrFormat).toBe('string');
      expect(qrFormat).toContain('"v":1');

      const restored = shareFromQRFormat(qrFormat);
      expect(restored.id).toBe(share.id);
      expect(restored.data).toBe(share.data);
      expect(restored.threshold).toBe(share.threshold);
      expect(restored.total).toBe(share.total);
      expect(restored.created).toBe(share.created);
    });

    it('should reject invalid QR format version', () => {
      const invalidQR = JSON.stringify({ v: 2, i: 1, d: 'test', m: 3, n: 5, t: Date.now() });
      expect(() => shareFromQRFormat(invalidQR)).toThrow('Unsupported share version');
    });

    it('should handle QR format for all shares in a set', () => {
      const secret = randomBytes(32);
      const shares = splitSecret(secret, 3, 5);

      // Convert all to QR and back
      const restored = shares.map((s: ShamirShare) => shareFromQRFormat(shareToQRFormat(s)));

      // Should still reconstruct
      const reconstructed = combineShares(restored.slice(0, 3));
      expect(Buffer.compare(reconstructed, secret)).toBe(0);
    });
  });

  describe('Performance', () => {
    it('should split large secrets efficiently', () => {
      const secret = randomBytes(1024); // 1KB
      const start = Date.now();
      const shares = splitSecret(secret, 5, 10);
      const elapsed = Date.now() - start;

      expect(shares).toHaveLength(10);
      expect(elapsed).toBeLessThan(200); // Should be fast (increased threshold for slower systems)
    });

    it('should reconstruct large secrets efficiently', () => {
      const secret = randomBytes(1024);
      const shares = splitSecret(secret, 5, 10);

      const start = Date.now();
      const reconstructed = combineShares(shares.slice(0, 5));
      const elapsed = Date.now() - start;

      expect(Buffer.compare(reconstructed, secret)).toBe(0);
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single-byte secret', () => {
      const secret = Buffer.from([42]);
      const shares = splitSecret(secret, 2, 3);
      const reconstructed = combineShares(shares.slice(0, 2));
      expect(reconstructed[0]).toBe(42);
    });

    it('should handle threshold = total shares', () => {
      const secret = randomBytes(32);
      const shares = splitSecret(secret, 5, 5);

      // Need all shares
      const reconstructed = combineShares(shares);
      expect(Buffer.compare(reconstructed, secret)).toBe(0);

      // Missing one should fail
      expect(() => combineShares(shares.slice(0, 4))).toThrow();
    });

    it('should handle unicode/special characters in secret', () => {
      const secret = Buffer.from('🔐 Secret with émojis and spëcial çhars! 你好世界', 'utf-8');
      const shares = splitSecret(secret, 3, 5);
      const reconstructed = combineShares(shares.slice(0, 3));
      expect(reconstructed.toString('utf-8')).toBe('🔐 Secret with émojis and spëcial çhars! 你好世界');
    });

    it('should handle more shares than needed', () => {
      const secret = randomBytes(32);
      const shares = splitSecret(secret, 3, 5);

      // Use 4 shares when only 3 needed
      const reconstructed = combineShares(shares.slice(0, 4));
      expect(Buffer.compare(reconstructed, secret)).toBe(0);

      // Use all 5 shares
      const reconstructedAll = combineShares(shares);
      expect(Buffer.compare(reconstructedAll, secret)).toBe(0);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should simulate account recovery scenario', () => {
      // User creates recovery with 3-of-5 threshold
      const masterKey = randomBytes(32); // Ed25519 private key
      const shares = splitSecret(masterKey, 3, 5);

      // Distribute to 5 guardians
      const guardianShares = shares.map((share: ShamirShare, i: number) => ({
        guardianName: `Guardian ${i + 1}`,
        share,
      }));

      // User loses access, contacts guardians
      // 3 guardians respond
      const respondingGuardians = [
        guardianShares[0],
        guardianShares[2],
        guardianShares[4],
      ];

      const recoveredKey = combineShares(respondingGuardians.map(g => g.share));
      expect(Buffer.compare(recoveredKey, masterKey)).toBe(0);
    });

    it('should simulate guardian rotation', () => {
      const masterKey = randomBytes(32);
      
      // Initial setup: 3-of-5
      const oldShares = splitSecret(masterKey, 3, 5);

      // User wants to add 2 new guardians and increase threshold
      // First reconstruct with 3 shares
      const recovered = combineShares(oldShares.slice(0, 3));

      // Create new shares: 4-of-7
      const newShares = splitSecret(recovered, 4, 7);

      // Verify new setup works
      const verified = combineShares(newShares.slice(0, 4));
      expect(Buffer.compare(verified, masterKey)).toBe(0);
    });

    it('should simulate time-locked recovery with share aggregation', () => {
      const masterKey = randomBytes(32);
      const shares = splitSecret(masterKey, 3, 5);

      // Simulate guardians submitting shares over time
      const collectedShares: ShamirShare[] = [];
      
      // Guardian 1 submits
      collectedShares.push(shares[0]);
      expect(() => combineShares(collectedShares)).toThrow(); // Not enough yet

      // Guardian 3 submits
      collectedShares.push(shares[2]);
      expect(() => combineShares(collectedShares)).toThrow(); // Still not enough

      // Guardian 5 submits - now we have threshold!
      collectedShares.push(shares[4]);
      const recovered = combineShares(collectedShares);
      expect(Buffer.compare(recovered, masterKey)).toBe(0);
    });
  });
});
