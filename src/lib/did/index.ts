/**
 * Decentralized Identifier (DID) System
 * W3C DID Specification Implementation
 * 
 * Supports:
 * - did:key (cryptographic key-based DIDs)
 * - did:web (web-based DIDs)
 * - DID Document creation and resolution
 * - Verifiable Credentials issuance and verification
 */

import { sha256 } from '@noble/hashes/sha256';
import { sha512 } from '@noble/hashes/sha512';
import { bytesToHex } from '@noble/hashes/utils';
import * as ed25519 from '@noble/ed25519';

// Configure Ed25519 hash function for v3.0+
// Must be set before any ed25519 operations
(ed25519 as any).hashes.sha512 = (...m: Uint8Array[]) => sha512((ed25519 as any).etc.concatBytes(...m));
(ed25519 as any).hashes.sha512Async = async (...m: Uint8Array[]) => sha512((ed25519 as any).etc.concatBytes(...m));

// DID Types
export interface DIDDocument {
  '@context': string[];
  id: string; // The DID
  controller?: string | string[];
  verificationMethod: VerificationMethod[];
  authentication?: (string | VerificationMethod)[];
  assertionMethod?: (string | VerificationMethod)[];
  keyAgreement?: (string | VerificationMethod)[];
  capabilityInvocation?: (string | VerificationMethod)[];
  capabilityDelegation?: (string | VerificationMethod)[];
  service?: ServiceEndpoint[];
  created?: string;
  updated?: string;
  proof?: Proof;
}

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase?: string;
  publicKeyJwk?: JsonWebKey;
  publicKeyBase58?: string;
}

export interface ServiceEndpoint {
  id: string;
  type: string | string[];
  serviceEndpoint: string | string[] | Record<string, any>;
  description?: string;
}

export interface Proof {
  type: string;
  created: string;
  verificationMethod: string;
  proofPurpose: string;
  proofValue: string;
}

// Verifiable Credential Types
export interface VerifiableCredential {
  '@context': string[];
  id: string;
  type: string[];
  issuer: string | { id: string; name?: string };
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: Record<string, any>;
  credentialStatus?: CredentialStatus;
  proof: Proof;
}

export interface CredentialStatus {
  id: string;
  type: string;
}

export interface VerifiablePresentation {
  '@context': string[];
  id: string;
  type: string[];
  holder: string;
  verifiableCredential: VerifiableCredential[];
  proof: Proof;
}

/**
 * DID Manager
 */
export class DIDManager {
  private static instance: DIDManager;

  static getInstance(): DIDManager {
    if (!DIDManager.instance) {
      DIDManager.instance = new DIDManager();
    }
    return DIDManager.instance;
  }

  /**
   * Create a did:key DID from Ed25519 public key
   */
  async createDidKey(publicKey: Uint8Array): Promise<{
    did: string;
    didDocument: DIDDocument;
  }> {
    // Multibase encoding: z = base58btc
    const publicKeyMultibase = 'z' + this.base58Encode(publicKey);
    const did = `did:key:${publicKeyMultibase}`;

    const didDocument: DIDDocument = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
      ],
      id: did,
      verificationMethod: [
        {
          id: `${did}#${publicKeyMultibase}`,
          type: 'Ed25519VerificationKey2020',
          controller: did,
          publicKeyMultibase,
        },
      ],
      authentication: [`${did}#${publicKeyMultibase}`],
      assertionMethod: [`${did}#${publicKeyMultibase}`],
      capabilityDelegation: [`${did}#${publicKeyMultibase}`],
      capabilityInvocation: [`${did}#${publicKeyMultibase}`],
    };

    return { did, didDocument };
  }

  /**
   * Create a did:web DID
   */
  async createDidWeb(domain: string, path?: string): Promise<{
    did: string;
    didDocument: DIDDocument;
  }> {
    const did = path ? `did:web:${domain}:${path}` : `did:web:${domain}`;

    // Generate a key for the DID
    const privateKey = ed25519.utils.randomSecretKey();
    const publicKey = await ed25519.getPublicKey(privateKey);
    const publicKeyMultibase = 'z' + this.base58Encode(publicKey);

    const didDocument: DIDDocument = {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: did,
      verificationMethod: [
        {
          id: `${did}#key-1`,
          type: 'Ed25519VerificationKey2020',
          controller: did,
          publicKeyMultibase,
        },
      ],
      authentication: [`${did}#key-1`],
      assertionMethod: [`${did}#key-1`],
      service: [
        {
          id: `${did}#oxsig`,
          type: 'OxSigService',
          serviceEndpoint: `https://${domain}/api/did`,
        },
      ],
      created: new Date().toISOString(),
    };

    return { did, didDocument };
  }

  /**
   * Resolve a DID to its DID Document
   */
  async resolveDID(did: string): Promise<DIDDocument | null> {
    const [method] = did.split(':').slice(1);

    switch (method) {
      case 'key':
        return this.resolveDidKey(did);
      case 'web':
        return this.resolveDidWeb(did);
      default:
        throw new Error(`Unsupported DID method: ${method}`);
    }
  }

  /**
   * Resolve did:key
   */
  private async resolveDidKey(did: string): Promise<DIDDocument> {
    const publicKeyMultibase = did.split(':')[2];

    return {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
      ],
      id: did,
      verificationMethod: [
        {
          id: `${did}#${publicKeyMultibase}`,
          type: 'Ed25519VerificationKey2020',
          controller: did,
          publicKeyMultibase,
        },
      ],
      authentication: [`${did}#${publicKeyMultibase}`],
      assertionMethod: [`${did}#${publicKeyMultibase}`],
    };
  }

  /**
   * Resolve did:web
   */
  private async resolveDidWeb(did: string): Promise<DIDDocument | null> {
    const parts = did.split(':');
    const domain = parts[2];
    const path = parts.slice(3).join('/');

    const url = path
      ? `https://${domain}/${path}/.well-known/did.json`
      : `https://${domain}/.well-known/did.json`;

    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('Failed to resolve did:web:', error);
      return null;
    }
  }

  /**
   * Issue a Verifiable Credential
   */
  async issueCredential(params: {
    issuerDID: string;
    subjectDID: string;
    credentialType: string[];
    claims: Record<string, any>;
    expirationDate?: Date;
    privateKey: Uint8Array;
  }): Promise<VerifiableCredential> {
    const {
      issuerDID,
      subjectDID,
      credentialType,
      claims,
      expirationDate,
      privateKey,
    } = params;

    const credential: Omit<VerifiableCredential, 'proof'> = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
      ],
      id: `urn:uuid:${crypto.randomUUID()}`,
      type: ['VerifiableCredential', ...credentialType],
      issuer: issuerDID,
      issuanceDate: new Date().toISOString(),
      ...(expirationDate && { expirationDate: expirationDate.toISOString() }),
      credentialSubject: {
        id: subjectDID,
        ...claims,
      },
    };

    // Create proof
    const credentialBytes = new TextEncoder().encode(
      JSON.stringify(credential)
    );
    const signature = await ed25519.sign(credentialBytes, privateKey);

    const proof: Proof = {
      type: 'Ed25519Signature2020',
      created: new Date().toISOString(),
      verificationMethod: `${issuerDID}#key-1`,
      proofPurpose: 'assertionMethod',
      proofValue: bytesToHex(signature),
    };

    return {
      ...credential,
      proof,
    };
  }

  /**
   * Verify a Verifiable Credential
   */
  async verifyCredential(
    credential: VerifiableCredential,
    issuerPublicKey: Uint8Array
  ): Promise<{ valid: boolean; errors?: string[] }> {
    try {
      // Extract proof
      const { proof, ...credentialWithoutProof } = credential;

      // Reconstruct the signed data
      const credentialBytes = new TextEncoder().encode(
        JSON.stringify(credentialWithoutProof)
      );

      // Convert signature from hex
      const signature = new Uint8Array(
        proof.proofValue.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
      );

      // Verify signature
      const valid = await ed25519.verify(
        signature,
        credentialBytes,
        issuerPublicKey
      );

      if (!valid) {
        return { valid: false, errors: ['Invalid signature'] };
      }

      // Check expiration
      if (credential.expirationDate) {
        const expiration = new Date(credential.expirationDate);
        if (expiration < new Date()) {
          return { valid: false, errors: ['Credential expired'] };
        }
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        errors: [String(error)],
      };
    }
  }

  /**
   * Create a Verifiable Presentation
   */
  async createPresentation(params: {
    holderDID: string;
    credentials: VerifiableCredential[];
    privateKey: Uint8Array;
    challenge?: string;
    domain?: string;
  }): Promise<VerifiablePresentation> {
    const { holderDID, credentials, privateKey, challenge, domain } = params;

    const presentation: Omit<VerifiablePresentation, 'proof'> = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
      ],
      id: `urn:uuid:${crypto.randomUUID()}`,
      type: ['VerifiablePresentation'],
      holder: holderDID,
      verifiableCredential: credentials,
    };

    // Create proof
    const presentationBytes = new TextEncoder().encode(
      JSON.stringify(presentation) + (challenge || '') + (domain || '')
    );
    const signature = await ed25519.sign(presentationBytes, privateKey);

    const proof: Proof = {
      type: 'Ed25519Signature2020',
      created: new Date().toISOString(),
      verificationMethod: `${holderDID}#key-1`,
      proofPurpose: 'authentication',
      proofValue: bytesToHex(signature),
    };

    return {
      ...presentation,
      proof,
    };
  }

  /**
   * Base58 encoding helper
   */
  private base58Encode(bytes: Uint8Array): string {
    const alphabet =
      '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let result = '';
    let num = BigInt('0x' + bytesToHex(bytes));

    const base = BigInt(58);
    const zero = BigInt(0);

    while (num > zero) {
      result = alphabet[Number(num % base)] + result;
      num = num / base;
    }

    // Add leading zeros
    for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
      result = '1' + result;
    }

    return result;
  }
}

// Export singleton
export const didManager = DIDManager.getInstance();

/**
 * Helper: Generate complete DID identity
 */
export async function generateDIDIdentity(): Promise<{
  did: string;
  didDocument: DIDDocument;
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}> {
  const privateKey = ed25519.utils.randomSecretKey();
  const publicKey = await ed25519.getPublicKey(privateKey);

  const { did, didDocument } = await didManager.createDidKey(publicKey);

  return {
    did,
    didDocument,
    privateKey,
    publicKey,
  };
}

/**
 * Helper: Issue identity credential
 */
export async function issueIdentityCredential(params: {
  issuerDID: string;
  subjectDID: string;
  name: string;
  email?: string;
  organization?: string;
  issuerPrivateKey: Uint8Array;
}): Promise<VerifiableCredential> {
  return didManager.issueCredential({
    issuerDID: params.issuerDID,
    subjectDID: params.subjectDID,
    credentialType: ['IdentityCredential'],
    claims: {
      name: params.name,
      ...(params.email && { email: params.email }),
      ...(params.organization && { organization: params.organization }),
    },
    privateKey: params.issuerPrivateKey,
  });
}
