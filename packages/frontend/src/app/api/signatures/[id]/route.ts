/**
 * Signature by ID API - GET/DELETE /api/signatures/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

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

function mapRow(row: any) {
  return {
    id: row.id,
    documentId: row.document_id,
    signerId: row.signer_id,
    signerName: row.signer_name,
    signerEmail: row.signer_email,
    signatureData: row.signature_data,
    signatureType: row.signature_type,
    publicKey: row.public_key,
    algorithm: row.algorithm,
    timestamp: row.timestamp,
    ipAddress: row.ip_address,
    location: row.location,
    metadata: row.metadata,
    verified: row.verified,
    verifiedAt: row.verified_at,
    blockchainTxHash: row.blockchain_tx_hash,
    createdAt: row.created_at,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const query = `
      SELECT 
        id,
        document_id,
        signer_id,
        signer_name,
        signer_email,
        signature_data,
        signature_type,
        public_key,
        algorithm,
        timestamp,
        ip_address,
        location,
        metadata,
        verified,
        verified_at,
        blockchain_tx_hash,
        created_at
      FROM signatures
      WHERE id = $1
    `;
    const result = await getPool().query(query, [id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Signature not found' }, { status: 404 });
    }

    return NextResponse.json(mapRow(result.rows[0]));
  } catch (error) {
    console.error('Error fetching signature:', error);
    return NextResponse.json(
      { error: 'Failed to fetch signature', details: String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const result = await getPool().query(
      'DELETE FROM signatures WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Signature not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting signature:', error);
    return NextResponse.json(
      { error: 'Failed to delete signature', details: String(error) },
      { status: 500 }
    );
  }
}