/**
 * Zero-Knowledge Proof Tests
 */

import { describe, it, expect } from 'vitest';
import { zkProofs, proveAgeOver18, proveAttributeWithoutRevealingAll, proveMembership } from '../../lib/crypto/zkp';

describe('Zero-Knowledge Proofs', () => {
  describe('Selective Disclosure', () => {
    it('should prove selective attributes without revealing all', async () => {
      const credential = {
        name: 'Alice Smith',
        age: 30,
        email: 'alice@example.com',
        ssn: '123-45-6789',
        address: '123 Main St',
      };

      const proof = await proveAttributeWithoutRevealingAll(credential, ['name', 'age']);

      expect(proof).toBeDefined();
      expect(proof.proofType).toBe('selective-disclosure');
      expect(proof.publicInputs).toHaveProperty('name');
      expect(proof.publicInputs).toHaveProperty('age');
      expect(proof.publicInputs).not.toHaveProperty('ssn');
      expect(proof.publicInputs).not.toHaveProperty('address');
      expect(proof.publicInputs.name).toBe('Alice Smith');
      expect(proof.publicInputs.age).toBe(30);
    });

    it('should verify selective disclosure proof', async () => {
      const credential = {
        name: 'Bob Johnson',
        email: 'bob@example.com',
        role: 'admin',
      };

      const proof = await zkProofs.generateSelectiveDisclosureProof({
        attributes: credential,
        disclosed: ['name'],
        statement: 'Prove name only',
      });

      const verification = await zkProofs.verifySelectiveDisclosureProof(proof, {
        name: 'Bob Johnson',
      });

      expect(verification.valid).toBe(true);
      expect(verification.publicInputs.name).toBe('Bob Johnson');
    });

    it('should fail verification with wrong expected attributes', async () => {
      const credential = {
        name: 'Charlie Brown',
        email: 'charlie@example.com',
      };

      const proof = await zkProofs.generateSelectiveDisclosureProof({
        attributes: credential,
        disclosed: ['name'],
        statement: 'Prove name',
      });

      const verification = await zkProofs.verifySelectiveDisclosureProof(proof, {
        name: 'Wrong Name',
      });

      expect(verification.valid).toBe(false);
    });
  });

  describe('Range Proofs', () => {
    it('should prove age over 18 without revealing age', async () => {
      const proof = await proveAgeOver18(25);

      expect(proof).toBeDefined();
      expect(proof.proofType).toBe('range');
      expect(proof.publicInputs.min).toBe(18);
      expect(proof.publicInputs.max).toBe(150);
      expect(proof.publicInputs).toHaveProperty('commitment');
      expect(proof.publicInputs).not.toHaveProperty('value');
    });

    it('should verify range proof', async () => {
      const proof = await zkProofs.generateRangeProof({
        value: 42,
        min: 18,
        max: 100,
        statement: 'Age in valid range',
      });

      const verification = await zkProofs.verifyRangeProof(proof);

      expect(verification.valid).toBe(true);
      expect(verification.publicInputs.min).toBe(18);
      expect(verification.publicInputs.max).toBe(100);
    });

    it('should reject value outside range', async () => {
      await expect(
        zkProofs.generateRangeProof({
          value: 150,
          min: 18,
          max: 100,
          statement: 'Invalid range',
        })
      ).rejects.toThrow('Value is not in the specified range');
    });
  });

  describe('Membership Proofs', () => {
    it('should prove membership without revealing identity', async () => {
      const organizationMembers = [
        'user-001',
        'user-002',
        'user-003',
        'user-004',
        'user-005',
      ];

      const proof = await proveMembership('user-003', organizationMembers);

      expect(proof).toBeDefined();
      expect(proof.proofType).toBe('membership');
      expect(proof.publicInputs).toHaveProperty('setHash');
      expect(proof.publicInputs).toHaveProperty('setSize');
      expect(proof.publicInputs.setSize).toBe(5);
      expect(proof.publicInputs).not.toHaveProperty('memberId');
    });

    it('should verify membership proof', async () => {
      const memberSet = ['alice', 'bob', 'charlie', 'diana'];

      const proof = await zkProofs.generateMembershipProof({
        memberId: 'bob',
        memberSet,
        statement: 'Member of team',
      });

      // Calculate expected set hash
      const sortedSet = [...memberSet].sort();
      const setHashBytes = new TextEncoder().encode(JSON.stringify(sortedSet));
      const { sha256 } = await import('@noble/hashes/sha256');
      const { bytesToHex } = await import('@noble/hashes/utils');
      const expectedSetHash = bytesToHex(sha256(setHashBytes));

      const verification = await zkProofs.verifyMembershipProof(proof, expectedSetHash);

      expect(verification.valid).toBe(true);
    });

    it('should reject non-member', async () => {
      const memberSet = ['alice', 'bob', 'charlie'];

      await expect(
        zkProofs.generateMembershipProof({
          memberId: 'eve',
          memberSet,
          statement: 'Not a member',
        })
      ).rejects.toThrow('Member ID not in set');
    });
  });

  describe('Authentication Proofs', () => {
    it('should generate auth proof without revealing secret', async () => {
      const secret = 'my-secret-password';
      const challenge = 'random-challenge-12345';

      const proof = await zkProofs.generateAuthProof({
        secret,
        challenge,
        statement: 'Prove knowledge of secret',
      });

      expect(proof).toBeDefined();
      expect(proof.proofType).toBe('auth');
      expect(proof.publicInputs.challenge).toBe(challenge);
      expect(proof.publicInputs).toHaveProperty('response');
      expect(proof.publicInputs).not.toHaveProperty('secret');
    });

    it('should verify auth proof', async () => {
      const secret = 'password123';
      const challenge = 'challenge-456';

      const proof = await zkProofs.generateAuthProof({
        secret,
        challenge,
        statement: 'Auth proof',
      });

      const verification = await zkProofs.verifyAuthProof(proof, challenge, '');

      expect(verification.valid).toBe(true);
    });
  });

  describe('Batch Verification', () => {
    it('should verify multiple proofs at once', async () => {
      const proofs = await Promise.all([
        proveAgeOver18(30),
        proveAttributeWithoutRevealingAll({ name: 'Test', role: 'admin' }, ['name']),
        proveMembership('user-1', ['user-1', 'user-2', 'user-3']),
      ]);

      const results = await zkProofs.batchVerify(proofs);

      expect(results).toHaveLength(3);
      expect(results.every((r: { valid: boolean }) => r.valid)).toBe(true);
    });
  });
});
