import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { uuidSchema } from '@/lib/http/schemas';
import { mapSignatureRow } from '@/lib/signatures/map-signature';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role === 'demo') {
    return NextResponse.json({ error: 'Signature not found' }, { status: 404 });
  }

  try {
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid signature ID' }, { status: 400 });
    }
    const result = await getPool().query(
      `SELECT s.id, s.document_id, d.title AS document_title, s.signer_id,
              s.signer_name, s.signer_email, s.signature_data, s.signature_type,
              s.public_key, s.algorithm, s.signed_at, s.metadata, s.verified,
              s.verified_at, s.created_at
       FROM signatures s
       JOIN documents d ON d.id = s.document_id
       WHERE s.id = $1 AND s.signer_id = $2`,
      [id, user.id],
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Signature not found' }, { status: 404 });
    }
    return NextResponse.json(mapSignatureRow(result.rows[0]));
  } catch (error) {
    console.error('Signature fetch failed:', error);
    return NextResponse.json({ error: 'Failed to fetch signature' }, { status: 500 });
  }
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Signatures are immutable and cannot be deleted' },
    { status: 405, headers: { Allow: 'GET' } },
  );
}
