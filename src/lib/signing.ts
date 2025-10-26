/**
 * Updated Sign Page Integration Helper
 * This module provides updated handlers for the sign page using real API
 * Includes Post-Quantum Cryptography support
 */

import { documents, signatures } from '@/lib/api';
import { toast } from 'sonner';
import * as ed25519 from '@noble/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { pqCrypto, shouldUseQuantumSafe } from '@/lib/crypto/pqc';
import { zkProofs } from '@/lib/crypto/zkp';
import { didManager } from '@/lib/did';

export interface SignatureData {
  signatureData: string;
  publicKey: string;
  signatureType: 'draw' | 'type' | 'upload' | 'certificate';
}

/**
 * Upload and create document with real backend
 */
export async function uploadDocument(
  file: File,
  title: string,
  encrypted: boolean = true
): Promise<{ id: string; hash: string } | null> {
  try {
    // Calculate file hash
    const buffer = await file.arrayBuffer();
    const hashBytes = sha256(new Uint8Array(buffer));
    const hash = bytesToHex(hashBytes);

    // Upload to backend
    const doc = await documents.upload(file, {
      title: title || file.name,
      encrypted,
      tags: ['uploaded'],
      metadata: {
        originalHash: hash,
        uploadedAt: new Date().toISOString(),
      },
    });

    toast.success('Document uploaded successfully', {
      description: `${file.name} is now encrypted and ready for signing`,
    });

    return {
      id: doc.id,
      hash: `sha256:${hash}`,
    };
  } catch (error) {
    console.error('Upload failed:', error);
    toast.error('Failed to upload document', {
      description: String(error),
    });
    return null;
  }
}

/**
 * Create document from editor content
 */
export async function createDocument(
  title: string,
  content: string,
  contentType: 'html' | 'markdown' | 'text' = 'html',
  encrypted: boolean = true
): Promise<{ id: string; hash: string } | null> {
  try {
    // Calculate content hash
    const encoder = new TextEncoder();
    const contentBytes = encoder.encode(content);
    const hashBytes = sha256(contentBytes);
    const hash = bytesToHex(hashBytes);

    // Create document
    const doc = await documents.create({
      title,
      content,
      contentType,
      encrypted,
      tags: ['document', 'draft'],
      status: 'draft',
      metadata: {
        contentHash: hash,
        createdAt: new Date().toISOString(),
      },
    });

    toast.success('Document created successfully', {
      description: 'Ready for signing',
    });

    return {
      id: doc.id,
      hash: `sha256:${hash}`,
    };
  } catch (error) {
    console.error('Document creation failed:', error);
    toast.error('Failed to create document', {
      description: String(error),
    });
    return null;
  }
}

/**
 * Generate Ed25519 keypair for signing (classical)
 */
export async function generateKeypair(): Promise<{
  privateKey: string;
  publicKey: string;
}> {
  const privateKey = ed25519.utils.randomSecretKey();
  const publicKey = await ed25519.getPublicKey(privateKey);

  return {
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey),
  };
}

/**
 * Generate Post-Quantum keypair (Dilithium3)
 */
export async function generateQuantumSafeKeypair(): Promise<{
  privateKey: string;
  publicKey: string;
  keyId: string;
}> {
  const keyPair = await pqCrypto.generateDilithiumKeyPair();
  const exported = pqCrypto.exportKeyPair(keyPair);

  return {
    privateKey: exported.secretKey,
    publicKey: exported.publicKey,
    keyId: exported.keyId,
  };
}

/**
 * Generate Hybrid keypair (Ed25519 + Dilithium3)
 */
export async function generateHybridKeypair(): Promise<{
  classical: { privateKey: string; publicKey: string };
  postQuantum: { privateKey: string; publicKey: string };
  keyId: string;
}> {
  const hybridKeyPair = await pqCrypto.generateHybridSigningKeyPair();

  return {
    classical: {
      privateKey: bytesToHex(hybridKeyPair.classical.secretKey),
      publicKey: bytesToHex(hybridKeyPair.classical.publicKey),
    },
    postQuantum: {
      privateKey: bytesToHex(hybridKeyPair.postQuantum.secretKey),
      publicKey: bytesToHex(hybridKeyPair.postQuantum.publicKey),
    },
    keyId: hybridKeyPair.keyId,
  };
}

/**
 * Sign document with Ed25519 or Post-Quantum (auto-detect based on settings)
 */
export async function signDocument(
  documentId: string,
  documentHash: string,
  privateKey: string,
  signerName?: string,
  signerEmail?: string,
  options?: {
    useQuantumSafe?: boolean;
    useHybrid?: boolean;
    hybridKeys?: {
      classical: { privateKey: string; publicKey: string };
      postQuantum: { privateKey: string; publicKey: string };
    };
  }
): Promise<boolean> {
  try {
    const useQuantumSafe = options?.useQuantumSafe ?? shouldUseQuantumSafe();

    if (options?.useHybrid && options.hybridKeys) {
      return signDocumentHybrid(
        documentId,
        documentHash,
        options.hybridKeys,
        signerName,
        signerEmail
      );
    }

    if (useQuantumSafe) {
      return signDocumentQuantumSafe(
        documentId,
        documentHash,
        privateKey,
        signerName,
        signerEmail
      );
    }

    // Classical Ed25519 signing
    // Convert hash to bytes
    const hashBytes = new Uint8Array(
      documentHash.replace('sha256:', '').match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );

    // Convert private key from hex
    const privateKeyBytes = new Uint8Array(
      privateKey.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );

    // Sign the hash
    const signatureBytes = await ed25519.sign(hashBytes, privateKeyBytes);
    const publicKeyBytes = await ed25519.getPublicKey(privateKeyBytes);

    // Encode to base64
    const signatureData = Buffer.from(signatureBytes).toString('base64');
    const publicKey = Buffer.from(publicKeyBytes).toString('base64');

    // Create signature on backend
    const signature = await signatures.create({
      documentId,
      signatureData,
      signatureType: 'certificate',
      publicKey,
      algorithm: 'ed25519',
      signerName,
      signerEmail,
      metadata: {
        documentHash,
        signedAt: new Date().toISOString(),
        quantumSafe: false,
      },
    });

    // Verify signature immediately
    const verification = await signatures.verify({
      documentId,
      signatureId: signature.id,
      documentHash: documentHash.replace('sha256:', ''),
    });

    if (!verification.valid) {
      throw new Error('Signature verification failed');
    }

    toast.success('Document signed successfully!', {
      description: `Signature ID: ${signature.id.substring(0, 8)}...`,
    });

    return true;
  } catch (error) {
    console.error('Signing failed:', error);
    toast.error('Failed to sign document', {
      description: String(error),
    });
    return false;
  }
}

/**
 * Sign document with Post-Quantum Dilithium3
 */
async function signDocumentQuantumSafe(
  documentId: string,
  documentHash: string,
  privateKey: string,
  signerName?: string,
  signerEmail?: string
): Promise<boolean> {
  try {
    // Convert hash to bytes
    const hashBytes = new Uint8Array(
      documentHash.replace('sha256:', '').match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );

    // Import PQ key
    const keyPair = pqCrypto.importKeyPair({
      algorithm: 'Dilithium3',
      publicKey: '', // Will be derived
      secretKey: privateKey,
      keyId: crypto.randomUUID(),
      createdAt: Date.now(),
    });

    // Sign with Dilithium3
    const pqSignature = await pqCrypto.signDilithium(hashBytes, keyPair);

    // Encode to base64
    const signatureData = Buffer.from(pqSignature.signature).toString('base64');
    const publicKey = Buffer.from(keyPair.publicKey).toString('base64');

    // Create signature on backend
    const signature = await signatures.create({
      documentId,
      signatureData,
      signatureType: 'certificate',
      publicKey,
      algorithm: 'dilithium3' as any,
      signerName,
      signerEmail,
      metadata: {
        documentHash,
        signedAt: new Date().toISOString(),
        'quantum-safe': true,
        algorithm: 'Dilithium3',
      },
    });

    toast.success('Document signed with quantum-safe signature!', {
      description: `Dilithium3 • Signature ID: ${signature.id.substring(0, 8)}...`,
    });

    return true;
  } catch (error) {
    console.error('Quantum-safe signing failed:', error);
    toast.error('Failed to sign document', {
      description: String(error),
    });
    return false;
  }
}

/**
 * Sign document with Hybrid (Ed25519 + Dilithium3)
 */
async function signDocumentHybrid(
  documentId: string,
  documentHash: string,
  hybridKeys: {
    classical: { privateKey: string; publicKey: string };
    postQuantum: { privateKey: string; publicKey: string };
  },
  signerName?: string,
  signerEmail?: string
): Promise<boolean> {
  try {
    // Convert hash to bytes
    const hashBytes = new Uint8Array(
      documentHash.replace('sha256:', '').match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );

    // Create hybrid key pair structure
    const hybridKeyPair = {
      classical: {
        algorithm: 'Ed25519' as const,
        publicKey: new Uint8Array(
          hybridKeys.classical.publicKey.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
        ),
        secretKey: new Uint8Array(
          hybridKeys.classical.privateKey.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
        ),
      },
      postQuantum: {
        algorithm: 'Dilithium3' as const,
        publicKey: new Uint8Array(
          hybridKeys.postQuantum.publicKey.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
        ),
        secretKey: new Uint8Array(
          hybridKeys.postQuantum.privateKey.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
        ),
      },
      keyId: crypto.randomUUID(),
      createdAt: Date.now(),
    };

    // Sign with hybrid mode
    const hybridSig = await pqCrypto.signHybrid(hashBytes, hybridKeyPair);

    // Combine signatures
    const combinedSignature = {
      classical: bytesToHex(hybridSig.classical),
      postQuantum: bytesToHex(hybridSig.postQuantum),
      timestamp: hybridSig.timestamp,
    };

    // Create signature on backend
    const signature = await signatures.create({
      documentId,
      signatureData: Buffer.from(JSON.stringify(combinedSignature)).toString('base64'),
      signatureType: 'certificate',
      publicKey: Buffer.from(JSON.stringify({
        classical: hybridKeys.classical.publicKey,
        postQuantum: hybridKeys.postQuantum.publicKey,
      })).toString('base64'),
      algorithm: 'hybrid-ed25519-dilithium3' as any,
      signerName,
      signerEmail,
      metadata: {
        documentHash,
        signedAt: new Date().toISOString(),
        'quantum-safe': true,
        algorithm: 'Hybrid-Ed25519-Dilithium3',
      },
    });

    toast.success('Document signed with hybrid signature!', {
      description: `Ed25519 + Dilithium3 • ID: ${signature.id.substring(0, 8)}...`,
    });

    return true;
  } catch (error) {
    console.error('Hybrid signing failed:', error);
    toast.error('Failed to sign document', {
      description: String(error),
    });
    return false;
  }
}

/**
 * Sign with canvas/drawn signature
 */
export async function signWithDrawnSignature(
  documentId: string,
  documentHash: string,
  signatureImageData: string,
  signerName?: string,
  signerEmail?: string
): Promise<boolean> {
  try {
    // For drawn signatures, we use a simplified approach
    // Generate a keypair for this signature
    const { privateKey, publicKey } = await generateKeypair();

    // Create signature with the drawn image data
    const signature = await signatures.create({
      documentId,
      signatureData: signatureImageData, // Base64 image
      signatureType: 'draw',
      publicKey,
      algorithm: 'ed25519',
      signerName,
      signerEmail,
      metadata: {
        documentHash,
        signatureMethod: 'drawn',
        signedAt: new Date().toISOString(),
      },
    });

    toast.success('Signature added successfully!', {
      description: `Signature ID: ${signature.id.substring(0, 8)}...`,
    });

    return true;
  } catch (error) {
    console.error('Drawn signature failed:', error);
    toast.error('Failed to add signature', {
      description: String(error),
    });
    return false;
  }
}

/**
 * Get all signatures for a document
 */
export async function getDocumentSignatures(documentId: string) {
  try {
    const result = await signatures.listByDocument(documentId);
    return result.data;
  } catch (error) {
    console.error('Failed to get signatures:', error);
    return [];
  }
}

/**
 * Update document status after signing
 */
export async function markDocumentSigned(documentId: string): Promise<boolean> {
  try {
    await documents.update(documentId, {
      status: 'published',
      metadata: {
        signedAt: new Date().toISOString(),
        finalized: true,
      },
    });
    return true;
  } catch (error) {
    console.error('Failed to update document status:', error);
    return false;
  }
}
