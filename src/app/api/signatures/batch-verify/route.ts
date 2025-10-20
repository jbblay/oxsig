/**
 * Signature Batch Verify API - POST /api/signatures/batch-verify
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
    const items: { documentId: string; signatureId: string; documentHash: string }[] =
      body?.signatures || [];

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No signatures provided' }, { status: 400 });
    }

    const results: any[] = [];

    for (const item of items) {
      const { documentId, signatureId, documentHash } = item;
      try {
        const sigRes = await getPool().query(
          `SELECT id, document_id, signature_data, public_key, algorithm, verified, created_at 
           FROM signatures WHERE id = $1 AND document_id = $2`,
          [signatureId, documentId]
        );

        if (sigRes.rows.length === 0) {
          results.push({
            valid: false,
            signature: null,
            verificationMethod: '',
            timestamp: new Date().toISOString(),
            details: 'Signature not found',
          });
          continue;
        }

        const signature = sigRes.rows[0];

        let valid = false;
        let verificationMethod = '';
        let details = '';

        if (signature.algorithm === 'ed25519') {
          const signatureBytes = Buffer.from(signature.signature_data, 'base64');
          const publicKeyBytes = Buffer.from(signature.public_key, 'base64');
          const messageBytes = Buffer.from(documentHash, 'hex');

          valid = await ed25519.verify(signatureBytes, messageBytes, publicKeyBytes);
          verificationMethod = 'ed25519_cryptographic';
          details = valid ? 'Signature cryptographically verified' : 'Signature verification failed';

          if (valid && !signature.verified) {
            await getPool().query(
              `UPDATE signatures SET verified = true, verified_at = CURRENT_TIMESTAMP WHERE id = $1`,
              [signatureId]
            );
          }
        } else {
          details = `Verification not implemented for algorithm: ${signature.algorithm}`;
        }

        results.push({
          valid,
          signature: {
            id: signature.id,
            documentId: signature.document_id,
            publicKey: signature.public_key,
            algorithm: signature.algorithm,
            verified: valid,
            createdAt: signature.created_at,
          },
          timestamp: new Date().toISOString(),
          verificationMethod,
          details,
        });
      } catch (err) {
        results.push({
          valid: false,
          signature: null,
          timestamp: new Date().toISOString(),
          verificationMethod: '',
          details: `Verification error: ${String(err)}`,
        });
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error in batch verify:', error);
    return NextResponse.json(
      { error: 'Failed to batch verify signatures', details: String(error) },
      { status: 500 }
    );
  }
}