/**
 * Social Recovery System Tests
 * Tests for guardian-based account recovery
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRecoveryPackage,
  initiateRecovery,
  submitGuardianShare,
  completeRecovery,
  cancelRecovery,
  addGuardian,
  removeGuardian,
  validateRecoveryPackage,
  decryptShareForGuardian,
  type Guardian,
  type RecoveryConfig,
  type RecoveryPackage,
} from './social-recovery';
import { randomBytes } from 'crypto';
import { ed25519 } from '@noble/curves/ed25519.js';

describe('Social Recovery System', () => {
  let masterKey: Buffer;
  let guardians: Omit<Guardian, 'encryptedShare' | 'shareMetadata'>[];

  beforeEach(() => {
    // Generate a master key (Ed25519 private key)
    masterKey = Buffer.from(ed25519.utils.randomSecretKey());

    // Create 5 guardians with DIDs and keypairs
    guardians = Array.from({ length: 5 }, (_, i) => {
      const privateKey = ed25519.utils.randomSecretKey();
      const publicKey = ed25519.getPublicKey(privateKey);

      return {
        did: `did:key:guardian${i + 1}`,
        publicKey: Buffer.from(publicKey).toString('hex'),
        displayName: `Guardian ${i + 1}`,
        addedAt: Date.now(),
      };
    });
  });

  describe('Recovery Package Creation', () => {
    it('should create valid recovery package', async () => {
      const config: RecoveryConfig = {
        threshold: 3,
        totalGuardians: 5,
        timeLock: 86400000, // 24 hours
      };

      const pkg = await createRecoveryPackage(masterKey, guardians.slice(0, 5), config);

      expect(pkg.guardians).toHaveLength(5);
      expect(pkg.config.threshold).toBe(3);
      expect(pkg.config.totalGuardians).toBe(5);
      expect(validateRecoveryPackage(pkg)).toBe(true);

      // Each guardian should have encrypted share
      pkg.guardians.forEach((g: Guardian) => {
        expect(g.encryptedShare).toBeDefined();
        expect(g.shareMetadata).toBeDefined();
        expect(g.shareMetadata?.id).toBeGreaterThan(0);
        expect(g.shareMetadata?.threshold).toBe(3);
        expect(g.shareMetadata?.total).toBe(5);
      });
    });

    it('should validate input parameters', async () => {
      const config: RecoveryConfig = {
        threshold: 3,
        totalGuardians: 5,
      };

      // Wrong key length
      await expect(
        createRecoveryPackage(Buffer.alloc(16), guardians, config)
      ).rejects.toThrow('Master key must be 32 bytes');

      // Mismatched guardian count
      await expect(
        createRecoveryPackage(masterKey, guardians.slice(0, 3), config)
      ).rejects.toThrow('Guardian count must match totalGuardians');

      // Threshold too high
      await expect(
        createRecoveryPackage(masterKey, guardians.slice(0, config.totalGuardians), { ...config, threshold: 6 })
      ).rejects.toThrow('Threshold cannot exceed total guardians');

      // Threshold too low
      await expect(
        createRecoveryPackage(masterKey, guardians.slice(0, config.totalGuardians), { ...config, threshold: 1 })
      ).rejects.toThrow('Threshold must be at least 2');
    });

    it('should create unique shares for each guardian', async () => {
      const config: RecoveryConfig = { threshold: 3, totalGuardians: 5 };
      const pkg = await createRecoveryPackage(masterKey, guardians.slice(0, config.totalGuardians), config);

      const shares = pkg.guardians.map((g: Guardian) => g.encryptedShare);
      const uniqueShares = new Set(shares);
      expect(uniqueShares.size).toBe(5); // All shares unique
    });

    it('should support different thresholds', async () => {
      // Create additional guardians for this test (need up to 7)
      const allGuardians = [
        ...guardians,
        ...Array.from({ length: 2 }, (_, i) => {
          const privateKey = ed25519.utils.randomSecretKey();
          const publicKey = ed25519.getPublicKey(privateKey);
          return {
            did: `did:key:guardian${i + 6}`,
            publicKey: Buffer.from(publicKey).toString('hex'),
            displayName: `Guardian ${i + 6}`,
            addedAt: Date.now(),
          };
        }),
      ];

      const configs = [
        { threshold: 2, totalGuardians: 3 },
        { threshold: 3, totalGuardians: 5 },
        { threshold: 5, totalGuardians: 7 },
        { threshold: 7, totalGuardians: 7 }, // All required
      ];

      for (const config of configs) {
        const testGuardians = allGuardians.slice(0, config.totalGuardians);
        const pkg = await createRecoveryPackage(masterKey, testGuardians, config);
        expect(validateRecoveryPackage(pkg)).toBe(true);
        expect(pkg.config.threshold).toBe(config.threshold);
      }
    });
  });

  describe('Recovery Session', () => {
    let recoveryPackage: RecoveryPackage;

    beforeEach(async () => {
      const config: RecoveryConfig = {
        threshold: 3,
        totalGuardians: 5,
        timeLock: 1000, // 1 second for testing
        sessionExpiry: 3600000, // 1 hour
      };
      recoveryPackage = await createRecoveryPackage(masterKey, guardians.slice(0, config.totalGuardians), config);
    });

    it('should initiate recovery session', () => {
      const userDid = 'did:key:user123';
      const session = initiateRecovery(userDid, recoveryPackage);

      expect(session.id).toBeDefined();
      expect(session.userDid).toBe(userDid);
      expect(session.threshold).toBe(3);
      expect(session.status).toBe('time-locked');
      expect(session.collectedShares).toHaveLength(0);
      expect(session.respondedGuardians).toHaveLength(0);
    });

    it('should handle session without time lock', () => {
      const noTimeLock = { ...recoveryPackage.config, timeLock: 0 };
      const pkg = { ...recoveryPackage, config: noTimeLock };
      const session = initiateRecovery('did:key:user', pkg);

      expect(session.status).toBe('pending');
      expect(session.canCompleteAt).toBe(session.initiatedAt);
    });

    it('should track session expiration', () => {
      const session = initiateRecovery('did:key:user', recoveryPackage);
      const expiry = session.expiresAt - session.initiatedAt;
      expect(expiry).toBe(3600000); // 1 hour
    });
  });

  describe('Guardian Share Submission', () => {
    let recoveryPackage: RecoveryPackage;
    let guardianPrivateKeys: Buffer[];

    beforeEach(async () => {
      // Generate guardian keypairs
      guardianPrivateKeys = guardians.map(() => 
        Buffer.from(ed25519.utils.randomSecretKey())
      );

      // Recreate guardians with public keys from the private keys
      guardians = guardianPrivateKeys.map((privKey, i) => ({
        did: `did:key:guardian${i + 1}`,
        publicKey: Buffer.from(ed25519.getPublicKey(privKey)).toString('hex'),
        displayName: `Guardian ${i + 1}`,
        addedAt: Date.now(),
      }));

      const config: RecoveryConfig = {
        threshold: 3,
        totalGuardians: 5,
        timeLock: 100, // 100ms
      };

      recoveryPackage = await createRecoveryPackage(masterKey, guardians.slice(0, config.totalGuardians), config);
    });

    it('should accept guardian shares', async () => {
      const session = initiateRecovery('did:key:user', recoveryPackage);

      // First guardian submits
      const guardian0 = recoveryPackage.guardians[0];
      const share0 = await decryptShareForGuardian(
        guardian0.encryptedShare!,
        guardianPrivateKeys[0].toString('hex')
      );

      const updated1 = submitGuardianShare(session, guardian0.did, share0);
      expect(updated1.collectedShares).toHaveLength(1);
      expect(updated1.respondedGuardians).toContain(guardian0.did);
      expect(updated1.status).toBe('time-locked');

      // Second guardian submits
      const guardian1 = recoveryPackage.guardians[1];
      const share1 = await decryptShareForGuardian(
        guardian1.encryptedShare!,
        guardianPrivateKeys[1].toString('hex')
      );

      const updated2 = submitGuardianShare(updated1, guardian1.did, share1);
      expect(updated2.collectedShares).toHaveLength(2);
      expect(updated2.status).toBe('time-locked');

      // Third guardian submits - threshold reached!
      const guardian2 = recoveryPackage.guardians[2];
      const share2 = await decryptShareForGuardian(
        guardian2.encryptedShare!,
        guardianPrivateKeys[2].toString('hex')
      );

      const updated3 = submitGuardianShare(updated2, guardian2.did, share2);
      expect(updated3.collectedShares).toHaveLength(3);
      // Status depends on time lock
      expect(['time-locked', 'ready']).toContain(updated3.status);
    });

    it('should reject duplicate submissions', async () => {
      const session = initiateRecovery('did:key:user', recoveryPackage);

      const guardian0 = recoveryPackage.guardians[0];
      const share0 = await decryptShareForGuardian(
        guardian0.encryptedShare!,
        guardianPrivateKeys[0].toString('hex')
      );

      const updated = submitGuardianShare(session, guardian0.did, share0);

      // Try to submit again
      expect(() => {
        submitGuardianShare(updated, guardian0.did, share0);
      }).toThrow('already submitted');
    });

    it('should reject submissions to inactive sessions', () => {
      const session = initiateRecovery('did:key:user', recoveryPackage);
      const completedSession = { ...session, status: 'completed' as const };

      expect(() => {
        submitGuardianShare(completedSession, guardians[0].did, {} as any);
      }).toThrow('not active');
    });

    it('should handle expired sessions', () => {
      const session = initiateRecovery('did:key:user', recoveryPackage);
      const expiredSession = { ...session, expiresAt: Date.now() - 1000 };

      const result = submitGuardianShare(expiredSession, guardians[0].did, {} as any);
      expect(result.status).toBe('expired');
    });
  });

  describe('Recovery Completion', () => {
    let recoveryPackage: RecoveryPackage;
    let guardianPrivateKeys: Buffer[];

    beforeEach(async () => {
      guardianPrivateKeys = guardians.map(() => 
        Buffer.from(ed25519.utils.randomSecretKey())
      );

      guardians = guardianPrivateKeys.map((privKey, i) => ({
        did: `did:key:guardian${i + 1}`,
        publicKey: Buffer.from(ed25519.getPublicKey(privKey)).toString('hex'),
        displayName: `Guardian ${i + 1}`,
        addedAt: Date.now(),
      }));

      const config: RecoveryConfig = {
        threshold: 3,
        totalGuardians: 5,
        timeLock: 0, // No time lock for easier testing
      };

      recoveryPackage = await createRecoveryPackage(masterKey, guardians.slice(0, config.totalGuardians), config);
    });

    it('should complete recovery and reconstruct master key', async () => {
      let session = initiateRecovery('did:key:user', recoveryPackage);

      // Collect 3 shares
      for (let i = 0; i < 3; i++) {
        const guardian = recoveryPackage.guardians[i];
        const share = await decryptShareForGuardian(
          guardian.encryptedShare!,
          guardianPrivateKeys[i].toString('hex')
        );
        session = submitGuardianShare(session, guardian.did, share);
      }

      expect(session.status).toBe('ready');

      // Complete recovery
      const recoveredKey = completeRecovery(session);
      expect(Buffer.compare(recoveredKey, masterKey)).toBe(0);
    });

    it('should fail if time lock not elapsed', async () => {
      const lockedConfig: RecoveryConfig = {
        threshold: 3,
        totalGuardians: 5,
        timeLock: 86400000, // 24 hours
      };

      const lockedPkg = await createRecoveryPackage(masterKey, guardians.slice(0, lockedConfig.totalGuardians), lockedConfig);
      let session = initiateRecovery('did:key:user', lockedPkg);

      // Collect shares
      for (let i = 0; i < 3; i++) {
        const guardian = lockedPkg.guardians[i];
        const share = await decryptShareForGuardian(
          guardian.encryptedShare!,
          guardianPrivateKeys[i].toString('hex')
        );
        session = submitGuardianShare(session, guardian.did, share);
      }

      // Try to complete before time lock
      expect(() => completeRecovery(session)).toThrow('time-locked until');
    });

    it('should fail with insufficient shares', () => {
      const session = initiateRecovery('did:key:user', recoveryPackage);

      // Only 2 shares when 3 required
      expect(() => completeRecovery(session)).toThrow('Need 3 shares');
    });

    it('should fail on expired session', () => {
      const session = initiateRecovery('did:key:user', recoveryPackage);
      const expiredSession = { ...session, expiresAt: Date.now() - 1000 };

      expect(() => completeRecovery(expiredSession)).toThrow('expired');
    });
  });

  describe('Session Cancellation', () => {
    it('should cancel active session', () => {
      const session = initiateRecovery('did:key:user', { ...{} as RecoveryPackage, config: { threshold: 3, totalGuardians: 5 } });
      const cancelled = cancelRecovery(session);

      expect(cancelled.status).toBe('cancelled');
    });

    it('should not cancel completed session', () => {
      const session = initiateRecovery('did:key:user', { ...{} as RecoveryPackage, config: { threshold: 3, totalGuardians: 5 } });
      const completed = { ...session, status: 'completed' as const };

      expect(() => cancelRecovery(completed)).toThrow('Cannot cancel completed');
    });
  });

  describe('Guardian Management', () => {
    let recoveryPackage: RecoveryPackage;

    beforeEach(async () => {
      const config: RecoveryConfig = { threshold: 3, totalGuardians: 5 };
      recoveryPackage = await createRecoveryPackage(masterKey, guardians.slice(0, config.totalGuardians), config);
    });

    it('should add new guardian', async () => {
      const newGuardian: Omit<Guardian, 'encryptedShare' | 'shareMetadata'> = {
        did: 'did:key:newguardian',
        publicKey: Buffer.from(ed25519.getPublicKey(ed25519.utils.randomSecretKey())).toString('hex'),
        displayName: 'New Guardian',
        addedAt: Date.now(),
      };

      const updated = await addGuardian(recoveryPackage, masterKey, newGuardian);

      expect(updated.guardians).toHaveLength(6);
      expect(updated.config.totalGuardians).toBe(6);
      expect(validateRecoveryPackage(updated)).toBe(true);
    });

    it('should remove guardian', async () => {
      const didToRemove = guardians[0].did;
      const updated = await removeGuardian(recoveryPackage, masterKey, didToRemove);

      expect(updated.guardians).toHaveLength(4);
      expect(updated.config.totalGuardians).toBe(4);
      expect(updated.guardians.find((g: Guardian) => g.did === didToRemove)).toBeUndefined();
      expect(validateRecoveryPackage(updated)).toBe(true);
    });

    it('should not allow removing guardian if < 2 remain', async () => {
      const twoGuardianConfig: RecoveryConfig = { threshold: 2, totalGuardians: 2 };
      const twoGuardianPkg = await createRecoveryPackage(
        masterKey,
        guardians.slice(0, 2),
        twoGuardianConfig
      );

      await expect(
        removeGuardian(twoGuardianPkg, masterKey, guardians[0].did)
      ).rejects.toThrow('Must have at least 2 guardians');
    });

    it('should adjust threshold when removing guardians', async () => {
      // Start with 5-of-5 (all required)
      const allRequiredConfig: RecoveryConfig = { threshold: 5, totalGuardians: 5 };
      const pkg = await createRecoveryPackage(masterKey, guardians.slice(0, allRequiredConfig.totalGuardians), allRequiredConfig);

      // Remove one guardian
      const updated = await removeGuardian(pkg, masterKey, guardians[0].did);

      // Threshold should be adjusted down
      expect(updated.config.threshold).toBeLessThanOrEqual(4);
      expect(updated.config.threshold).toBeLessThanOrEqual(updated.config.totalGuardians);
    });
  });

  describe('Package Validation', () => {
    it('should validate correct package', async () => {
      const config: RecoveryConfig = { threshold: 3, totalGuardians: 5 };
      const pkg = await createRecoveryPackage(masterKey, guardians.slice(0, config.totalGuardians), config);
      expect(validateRecoveryPackage(pkg)).toBe(true);
    });

    it('should reject package with mismatched guardian count', async () => {
      const config: RecoveryConfig = { threshold: 3, totalGuardians: 5 };
      const pkg = await createRecoveryPackage(masterKey, guardians.slice(0, config.totalGuardians), config);

      // Remove a guardian
      const invalid = { ...pkg, guardians: pkg.guardians.slice(0, 4) };
      expect(validateRecoveryPackage(invalid)).toBe(false);
    });

    it('should reject package with missing shares', async () => {
      const config: RecoveryConfig = { threshold: 3, totalGuardians: 5 };
      const pkg = await createRecoveryPackage(masterKey, guardians.slice(0, config.totalGuardians), config);

      // Remove share from one guardian
      const invalid = {
        ...pkg,
        guardians: pkg.guardians.map((g: Guardian, i: number) => 
          i === 0 ? { ...g, encryptedShare: undefined } : g
        ),
      };
      expect(validateRecoveryPackage(invalid)).toBe(false);
    });

    it('should reject package with invalid threshold', async () => {
      const config: RecoveryConfig = { threshold: 3, totalGuardians: 5 };
      const pkg = await createRecoveryPackage(masterKey, guardians.slice(0, config.totalGuardians), config);

      // Invalid: threshold > total
      const invalid1 = { ...pkg, config: { ...pkg.config, threshold: 6 } };
      expect(validateRecoveryPackage(invalid1)).toBe(false);

      // Invalid: threshold < 2
      const invalid2 = { ...pkg, config: { ...pkg.config, threshold: 1 } };
      expect(validateRecoveryPackage(invalid2)).toBe(false);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should simulate full recovery flow', async () => {
      // Setup
      const config: RecoveryConfig = {
        threshold: 3,
        totalGuardians: 5,
        timeLock: 0,
        sessionExpiry: 3600000,
      };

      const guardianPrivateKeys = guardians.map(() => 
        Buffer.from(ed25519.utils.randomSecretKey())
      );

      const setupGuardians = guardianPrivateKeys.map((privKey, i) => ({
        did: `did:key:guardian${i + 1}`,
        publicKey: Buffer.from(ed25519.getPublicKey(privKey)).toString('hex'),
        displayName: `Guardian ${i + 1}`,
        addedAt: Date.now(),
      }));

      const pkg = await createRecoveryPackage(masterKey, setupGuardians, config);

      // User loses access and initiates recovery
      let session = initiateRecovery('did:key:lostuser', pkg);

      // Guardians 1, 3, and 5 respond
      const respondingIndices = [0, 2, 4];
      
      for (const idx of respondingIndices) {
        const guardian = pkg.guardians[idx];
        const share = await decryptShareForGuardian(
          guardian.encryptedShare!,
          guardianPrivateKeys[idx].toString('hex')
        );
        session = submitGuardianShare(session, guardian.did, share);
      }

      // Complete recovery
      const recoveredKey = completeRecovery(session);
      expect(Buffer.compare(recoveredKey, masterKey)).toBe(0);
    });

    it('should simulate guardian rotation scenario', async () => {
      const config: RecoveryConfig = { threshold: 3, totalGuardians: 5 };
      let pkg = await createRecoveryPackage(masterKey, guardians.slice(0, config.totalGuardians), config);

      // Remove compromised guardian
      pkg = await removeGuardian(pkg, masterKey, guardians[0].did);
      expect(pkg.guardians).toHaveLength(4);

      // Add new trusted guardian
      const newGuardian = {
        did: 'did:key:newguardian',
        publicKey: Buffer.from(ed25519.getPublicKey(ed25519.utils.randomSecretKey())).toString('hex'),
        displayName: 'New Guardian',
        addedAt: Date.now(),
      };
      pkg = await addGuardian(pkg, masterKey, newGuardian);
      expect(pkg.guardians).toHaveLength(5);

      // Verify package is still valid
      expect(validateRecoveryPackage(pkg)).toBe(true);
    });
  });
});
