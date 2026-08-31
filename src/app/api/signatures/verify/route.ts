import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserFromRequest } from '@/lib/auth/middleware';
import { AUDIT_ACTIONS, logSignatureEvent } from '@/lib/audit/logger';
import { getPool } from '@/lib/db/pool';
import { verifyEd25519DocumentSignature } from '@/lib/signatures/ed25519';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';

const verifySchema = z.object({
  documentId: z.string().uuid(),
  signatureId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.API_SIGNATURES, user.id);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const parsed = verifySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Valid document and signature IDs are required' }, { status: 400 });
    }
    const result = await getPool().query(
      `SELECT s.id, s.document_id, s.signer_id, s.signature_data, s.public_key,
              s.algorithm, s.created_at, d.content_hash
       FROM signatures s
       JOIN documents d ON d.id = s.document_id
       WHERE s.id = $1 AND s.document_id = $2 AND s.signer_id = $3 AND d.owner_id = $3`,
      [parsed.data.signatureId, parsed.data.documentId, user.id],
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Signature not found' }, { status: 404 });
    }
    const signature = result.rows[0];
    const valid = signature.algorithm === 'ed25519' && await verifyEd25519DocumentSignature({
      signatureData: signature.signature_data,
      publicKey: signature.public_key,
      contentHash: signature.content_hash,
    });
    const updateResult = await getPool().query(
      `UPDATE signatures
       SET verified = $1, verified_at = CASE WHEN $1 THEN NOW() ELSE NULL END
       WHERE id = $2
       RETURNING verified_at`,
      [valid, signature.id],
    );
    await logSignatureEvent(AUDIT_ACTIONS.SIGNATURE_VERIFY, user.id, signature.id, request, {
      documentId: signature.document_id,
      valid,
    });
    return NextResponse.json({
      valid,
      signatureId: signature.id,
      documentId: signature.document_id,
      algorithm: signature.algorithm,
      verifiedAt: updateResult.rows[0]?.verified_at ?? null,
    });
  } catch (error) {
    console.error('Signature verification failed:', error);
    return NextResponse.json({ error: 'Failed to verify signature' }, { status: 500 });
  }
}
