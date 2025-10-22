/**
 * Signatures API Route - POST /api/signatures (create), GET /api/signatures (list)
 */

import { NextRequest, NextResponse } from 'next/server';
import { query as dbQuery } from '@/lib/db/postgres';
import { getAuthUserId } from '@/lib/auth/api-helpers';
import { publishSignatureCreated } from '@/lib/events/nats';

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const signerId = await getAuthUserId(request);
    
    const body = await request.json();
    const {
      documentId,
      signatureData,
      signatureType,
      publicKey,
      algorithm = 'ed25519',
      metadata = {},
      signerName,
      signerEmail,
    } = body;

    if (!documentId || !signatureData || !publicKey) {
      return NextResponse.json(
        { error: 'Missing required fields: documentId, signatureData, publicKey' },
        { status: 400 }
      );
    }

    const insertQuery = `
      INSERT INTO signatures (
        document_id,
        signer_id,
        signer_name,
        signer_email,
        signature_data,
        signature_type,
        public_key,
        algorithm,
        metadata,
        verified
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
      RETURNING 
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
    `;

    const values = [
      documentId,
      signerId,
      signerName,
      signerEmail,
      signatureData,
      signatureType,
      publicKey,
      algorithm,
      metadata,
    ];

    const result = await dbQuery(insertQuery, values);
    const row = result.rows[0];

    const signature = {
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

    // Publish event to NATS (async, don't wait)
    publishSignatureCreated(signature.id, signature.documentId, signature.signerId, {
      signatureType: signature.signatureType,
      algorithm: signature.algorithm,
    }).catch(err => console.error('Event publishing error:', err));

    return NextResponse.json(signature, { status: 201 });
  } catch (error) {
    console.error('Error creating signature:', error);
    
    // Handle authentication errors
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to create signature', details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const documentId = searchParams.get('documentId');
    const userId = searchParams.get('userId');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');

    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (documentId) {
      conditions.push(`document_id = $${paramIndex}`);
      values.push(documentId);
      paramIndex++;
    }

    if (userId) {
      conditions.push(`signer_id = $${paramIndex}`);
      values.push(userId);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*) FROM signatures ${whereClause}`;
    const countResult = await dbQuery(countQuery, values);
    const total = parseInt(countResult.rows[0].count);

    const signaturesQuery = `
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
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    values.push(pageSize, offset);
    const signaturesResult = await dbQuery(signaturesQuery, values);

    const signatures = signaturesResult.rows.map((row: any) => ({
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
    }));

    return NextResponse.json({
      data: signatures,
      total,
      page,
      pageSize,
      hasMore: offset + pageSize < total,
    });
  } catch (error) {
    console.error('Error fetching signatures:', error);
    return NextResponse.json(
      { error: 'Failed to fetch signatures', details: String(error) },
      { status: 500 }
    );
  }
}
