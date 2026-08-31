import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserFromRequest } from '@/lib/auth/middleware';
import { AUDIT_ACTIONS, logSignatureEvent } from '@/lib/audit/logger';
import { query as dbQuery, transaction } from '@/lib/db/pool';
import { metadataSchema } from '@/lib/http/schemas';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyEd25519DocumentSignature } from '@/lib/signatures/ed25519';
import { mapSignatureRow } from '@/lib/signatures/map-signature';

const signatureSchema = z.object({
  documentId: z.string().uuid(),
  signatureData: z.string().min(80).max(100),
  publicKey: z.string().min(40).max(60),
  signatureType: z.string().trim().min(1).max(50).default('approval'),
  algorithm: z.literal('ed25519').default('ed25519'),
  metadata: metadataSchema.default({}),
});

class SignatureError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.API_SIGNATURES, user.id);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const parsed = signatureSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid signature', message: parsed.error.issues[0]?.message },
        { status: 400 },
      );
    }

    const row = await transaction(async (client) => {
      const documentResult = await client.query(
        `SELECT d.id, d.content_hash, d.title, u.display_name, u.email
         FROM documents d
         JOIN users u ON u.id = d.owner_id
         WHERE d.id = $1 AND d.owner_id = $2 AND d.deleted_at IS NULL
         FOR SHARE OF d`,
        [parsed.data.documentId, user.id],
      );
      if (documentResult.rows.length === 0) {
        throw new SignatureError('Document not found', 404);
      }
      const document = documentResult.rows[0];
      if (!document.content_hash) {
        throw new SignatureError('Document has no stored digest', 409);
      }

      const valid = await verifyEd25519DocumentSignature({
        signatureData: parsed.data.signatureData,
        publicKey: parsed.data.publicKey,
        contentHash: document.content_hash,
      });
      if (!valid) throw new SignatureError('Cryptographic signature is invalid', 422);

      const result = await client.query(
        `INSERT INTO signatures (
           document_id, signer_id, signer_name, signer_email, signature_data,
           signature_type, public_key, algorithm, metadata, verified, verified_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ed25519', $8, true, NOW())
         RETURNING id, document_id, signer_id, signer_name, signer_email,
                   signature_data, signature_type, public_key, algorithm,
                   signed_at, metadata, verified, verified_at, created_at`,
        [
          document.id,
          user.id,
          document.display_name,
          document.email,
          parsed.data.signatureData,
          parsed.data.signatureType,
          parsed.data.publicKey,
          parsed.data.metadata,
        ],
      );
      await client.query(
        `UPDATE documents SET status = 'signed', updated_at = NOW() WHERE id = $1`,
        [document.id],
      );
      return { ...result.rows[0], document_title: document.title };
    });

    await logSignatureEvent(AUDIT_ACTIONS.SIGNATURE_CREATE, user.id, row.id, request, {
      documentId: row.document_id,
      algorithm: row.algorithm,
    });
    return NextResponse.json(mapSignatureRow(row), { status: 201 });
  } catch (error) {
    if (error instanceof SignatureError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Signature creation failed:', error);
    return NextResponse.json({ error: 'Failed to create signature' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const documentId = request.nextUrl.searchParams.get('documentId');
    if (documentId && !z.string().uuid().safeParse(documentId).success) {
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
    }
    const page = Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('pageSize') || '20', 10) || 20));
    const offset = (page - 1) * pageSize;
    const values: any[] = [user.id];
    let documentCondition = '';
    if (documentId) {
      values.push(documentId);
      documentCondition = ` AND s.document_id = $${values.length}`;
    }

    const countResult = await dbQuery(
      `SELECT COUNT(*) FROM signatures s WHERE s.signer_id = $1${documentCondition}`,
      values,
    );
    const total = Number.parseInt(countResult.rows[0].count, 10);
    values.push(pageSize, offset);
    const result = await dbQuery(
      `SELECT s.id, s.document_id, d.title AS document_title, s.signer_id,
              s.signer_name, s.signer_email, s.signature_data, s.signature_type,
              s.public_key, s.algorithm, s.signed_at, s.metadata, s.verified,
              s.verified_at, s.created_at
       FROM signatures s
       JOIN documents d ON d.id = s.document_id
       WHERE s.signer_id = $1${documentCondition}
       ORDER BY s.created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return NextResponse.json({
      data: result.rows.map(mapSignatureRow),
      total,
      page,
      pageSize,
      hasMore: offset + pageSize < total,
    });
  } catch (error) {
    console.error('Signature list failed:', error);
    return NextResponse.json({ error: 'Failed to fetch signatures' }, { status: 500 });
  }
}
