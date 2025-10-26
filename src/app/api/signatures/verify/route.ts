/**
 * Signature Verify API Route - POST /api/signatures/verify
 */

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import * as ed25519 from '@noble/ed25519';

let pool: Pool | null = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'oxsig',
      user: process.env.POSTGRES_USER || 'oxsig',
      password: process.env.POSTGRES_PASSWORD || 'oxsig_secure_password',
      max: 20,
    });
  }
  return pool;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { documentId, signatureId, documentHash } = body;

    if (!documentId || !signatureId || !documentHash) {
      return NextResponse.json(
        { error: 'Missing required fields: documentId, signatureId, documentHash' },
        { status: 400 }
      );
    }

    // Get signature
    const signatureQuery = `
      SELECT 
        id,
        document_id,
        signer_id,
        signature_data,
        public_key,
        algorithm,
        verified,
        created_at
      FROM signatures
      WHERE id = $1 AND document_id = $2
    `;

    const signatureResult = await getPool().query(signatureQuery, [signatureId, documentId]);

    if (signatureResult.rows.length === 0) {
      return NextResponse.json({ error: 'Signature not found' }, { status: 404 });
    }

    const signature = signatureResult.rows[0];

    // Verify signature based on algorithm
    let valid = false;
    let verificationMethod = '';
    let details = '';

    try {
      if (signature.algorithm === 'ed25519') {
        // Decode base64 signature and public key
        const signatureBytes = Buffer.from(signature.signature_data, 'base64');
        const publicKeyBytes = Buffer.from(signature.public_key, 'base64');
        const messageBytes = Buffer.from(documentHash, 'hex');

        // Verify signature
        valid = await ed25519.verify(signatureBytes, messageBytes, publicKeyBytes);
        verificationMethod = 'ed25519_cryptographic';
        details = valid
          ? 'Signature cryptographically verified'
          : 'Signature verification failed';
      } else {
        details = `Verification not implemented for algorithm: ${signature.algorithm}`;
      }
    } catch (error) {
      details = `Verification error: ${String(error)}`;
    }

    // Update verified status
    if (valid && !signature.verified) {
      await getPool().query(
        `UPDATE signatures SET verified = true, verified_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [signatureId]
      );
    }

    const result = {
      valid,
      signature: {
        id: signature.id,
        documentId: signature.document_id,
        signerId: signature.signer_id,
        signatureData: signature.signature_data,
        publicKey: signature.public_key,
        algorithm: signature.algorithm,
        verified: valid,
        createdAt: signature.created_at,
      },
      timestamp: new Date().toISOString(),
      verificationMethod,
      details,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error verifying signature:', error);
    return NextResponse.json(
      { error: 'Failed to verify signature', details: String(error) },
      { status: 500 }
    );
  }
}
