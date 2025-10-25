/**
 * DID (Decentralized Identifier) Tests
 */

import { describe, it, expect } from 'vitest';
import { didManager, generateDIDIdentity, issueIdentityCredential } from '../../lib/did';
import * as ed25519 from '@noble/ed25519';

describe('Decentralized Identifiers (DID)', () => {
  describe('did:key Creation', () => {
    it('should create valid did:key from public key', async () => {
      const privateKey = ed25519.utils.randomSecretKey();
      const publicKey = await ed25519.getPublicKey(privateKey);

      const { did, didDocument } = await didManager.createDidKey(publicKey);

      expect(did).toMatch(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/);
      expect(didDocument).toBeDefined();
      expect(didDocument.id).toBe(did);
      expect(didDocument['@context']).toContain('https://www.w3.org/ns/did/v1');
      expect(didDocument.verificationMethod).toHaveLength(1);
      expect(didDocument.verificationMethod[0].type).toBe('Ed25519VerificationKey2020');
    });

    it('should include proper authentication methods', async () => {
      const privateKey = ed25519.utils.randomSecretKey();
      const publicKey = await ed25519.getPublicKey(privateKey);

      const { didDocument } = await didManager.createDidKey(publicKey);

      expect(didDocument.authentication).toBeDefined();
      expect(didDocument.assertionMethod).toBeDefined();
      expect(didDocument.capabilityDelegation).toBeDefined();
      expect(didDocument.capabilityInvocation).toBeDefined();
    });
  });

  describe('did:web Creation', () => {
    it('should create valid did:web', async () => {
      const { did, didDocument } = await didManager.createDidWeb('example.com');

      expect(did).toBe('did:web:example.com');
      expect(didDocument.id).toBe(did);
      expect(didDocument.service).toBeDefined();
      expect(didDocument.service!.length).toBeGreaterThan(0);
    });

    it('should create did:web with path', async () => {
      const { did } = await didManager.createDidWeb('example.com', 'users:alice');

      expect(did).toBe('did:web:example.com:users:alice');
    });

    it('should include service endpoints', async () => {
      const { didDocument } = await didManager.createDidWeb('oxsig.io');

      const service = didDocument.service?.find((s) => s.type === 'OxSigService');
      expect(service).toBeDefined();
      expect(service?.serviceEndpoint).toContain('oxsig.io');
    });
  });

  describe('DID Resolution', () => {
    it('should resolve did:key', async () => {
      const privateKey = ed25519.utils.randomSecretKey();
      const publicKey = await ed25519.getPublicKey(privateKey);
      const { did } = await didManager.createDidKey(publicKey);

      const resolvedDoc = await didManager.resolveDID(did);

      expect(resolvedDoc).toBeDefined();
      expect(resolvedDoc?.id).toBe(did);
    });

    it('should throw for unsupported DID method', async () => {
      await expect(didManager.resolveDID('did:btc:123')).rejects.toThrow(
        'Unsupported DID method: btc'
      );
    });
  });

  describe('Verifiable Credentials', () => {
    it('should issue valid credential', async () => {
      const issuerKey = ed25519.utils.randomSecretKey();
      const issuerPubKey = await ed25519.getPublicKey(issuerKey);
      const { did: issuerDID } = await didManager.createDidKey(issuerPubKey);

      const subjectKey = ed25519.utils.randomSecretKey();
      const subjectPubKey = await ed25519.getPublicKey(subjectKey);
      const { did: subjectDID } = await didManager.createDidKey(subjectPubKey);

      const credential = await didManager.issueCredential({
        issuerDID,
        subjectDID,
        credentialType: ['IdentityCredential'],
        claims: {
          name: 'Alice Smith',
          email: 'alice@example.com',
        },
        privateKey: issuerKey,
      });

      expect(credential).toBeDefined();
      expect(credential.id).toMatch(/^urn:uuid:/);
      expect(credential.type).toContain('VerifiableCredential');
      expect(credential.type).toContain('IdentityCredential');
      expect(credential.issuer).toBe(issuerDID);
      expect(credential.credentialSubject.id).toBe(subjectDID);
      expect(credential.credentialSubject.name).toBe('Alice Smith');
      expect(credential.proof).toBeDefined();
      expect(credential.proof.type).toBe('Ed25519Signature2020');
    });

    it('should verify valid credential', async () => {
      const issuerKey = ed25519.utils.randomSecretKey();
      const issuerPubKey = await ed25519.getPublicKey(issuerKey);
      const { did: issuerDID } = await didManager.createDidKey(issuerPubKey);

      const subjectKey = ed25519.utils.randomSecretKey();
      const subjectPubKey = await ed25519.getPublicKey(subjectKey);
      const { did: subjectDID } = await didManager.createDidKey(subjectPubKey);

      const credential = await didManager.issueCredential({
        issuerDID,
        subjectDID,
        credentialType: ['TestCredential'],
        claims: { test: true },
        privateKey: issuerKey,
      });

      const verification = await didManager.verifyCredential(credential, issuerPubKey);

      expect(verification.valid).toBe(true);
    });

    it('should reject invalid credential signature', async () => {
      const issuerKey = ed25519.utils.randomSecretKey();
      const issuerPubKey = await ed25519.getPublicKey(issuerKey);
      const { did: issuerDID } = await didManager.createDidKey(issuerPubKey);

      const subjectKey = ed25519.utils.randomSecretKey();
      const subjectPubKey = await ed25519.getPublicKey(subjectKey);
      const { did: subjectDID } = await didManager.createDidKey(subjectPubKey);

      const credential = await didManager.issueCredential({
        issuerDID,
        subjectDID,
        credentialType: ['TestCredential'],
        claims: { test: true },
        privateKey: issuerKey,
      });

      // Use different public key
      const wrongKey = await ed25519.getPublicKey(ed25519.utils.randomSecretKey());
      const verification = await didManager.verifyCredential(credential, wrongKey);

      expect(verification.valid).toBe(false);
      expect(verification.errors).toBeDefined();
    });

    it('should detect expired credentials', async () => {
      const issuerKey = ed25519.utils.randomSecretKey();
      const issuerPubKey = await ed25519.getPublicKey(issuerKey);
      const { did: issuerDID } = await didManager.createDidKey(issuerPubKey);

      const subjectKey = ed25519.utils.randomSecretKey();
      const subjectPubKey = await ed25519.getPublicKey(subjectKey);
      const { did: subjectDID } = await didManager.createDidKey(subjectPubKey);

      // Create credential that expired yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const credential = await didManager.issueCredential({
        issuerDID,
        subjectDID,
        credentialType: ['ExpiredCredential'],
        claims: { test: true },
        expirationDate: yesterday,
        privateKey: issuerKey,
      });

      const verification = await didManager.verifyCredential(credential, issuerPubKey);

      expect(verification.valid).toBe(false);
      expect(verification.errors).toContain('Credential expired');
    });
  });

  describe('Verifiable Presentations', () => {
    it('should create valid presentation', async () => {
      const holderKey = ed25519.utils.randomSecretKey();
      const holderPubKey = await ed25519.getPublicKey(holderKey);
      const { did: holderDID } = await didManager.createDidKey(holderPubKey);

      const issuerKey = ed25519.utils.randomSecretKey();
      const issuerPubKey = await ed25519.getPublicKey(issuerKey);
      const { did: issuerDID } = await didManager.createDidKey(issuerPubKey);

      const credential = await didManager.issueCredential({
        issuerDID,
        subjectDID: holderDID,
        credentialType: ['TestCredential'],
        claims: { role: 'admin' },
        privateKey: issuerKey,
      });

      const presentation = await didManager.createPresentation({
        holderDID,
        credentials: [credential],
        privateKey: holderKey,
        challenge: 'random-challenge-123',
        domain: 'oxsig.io',
      });

      expect(presentation).toBeDefined();
      expect(presentation.type).toContain('VerifiablePresentation');
      expect(presentation.holder).toBe(holderDID);
      expect(presentation.verifiableCredential).toHaveLength(1);
      expect(presentation.proof).toBeDefined();
      expect(presentation.proof.proofPurpose).toBe('authentication');
    });
  });

  describe('Helper Functions', () => {
    it('should generate complete DID identity', async () => {
      const identity = await generateDIDIdentity();

      expect(identity.did).toMatch(/^did:key:/);
      expect(identity.didDocument).toBeDefined();
      expect(identity.privateKey).toBeInstanceOf(Uint8Array);
      expect(identity.publicKey).toBeInstanceOf(Uint8Array);
    });

    it('should issue identity credential', async () => {
      const issuer = await generateDIDIdentity();
      const subject = await generateDIDIdentity();

      const credential = await issueIdentityCredential({
        issuerDID: issuer.did,
        subjectDID: subject.did,
        name: 'John Doe',
        email: 'john@example.com',
        organization: 'OxSig Inc.',
        issuerPrivateKey: issuer.privateKey,
      });

      expect(credential.type).toContain('IdentityCredential');
      expect(credential.credentialSubject.name).toBe('John Doe');
      expect(credential.credentialSubject.email).toBe('john@example.com');
      expect(credential.credentialSubject.organization).toBe('OxSig Inc.');
    });
  });
});
