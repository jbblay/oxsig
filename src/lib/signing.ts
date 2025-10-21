/**
 * Updated Sign Page Integration Helper
 * This module provides updated handlers for the sign page using real API
 */

import { documents, signatures } from '@/lib/api';
import { toast } from 'sonner';
import * as ed25519 from '@noble/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

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
 * Generate Ed25519 keypair for signing
 */
export async function generateKeypair(): Promise<{
  privateKey: string;
  publicKey: string;
}> {
  const privateKey = ed25519.utils.randomSecretKey();
  const publicKey = await ed25519.getPublicKeyAsync(privateKey);

  return {
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey),
  };
}

/**
 * Sign document with Ed25519
 */
export async function signDocument(
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
