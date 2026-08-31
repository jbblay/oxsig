import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const limit = Math.min(50, Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('limit') || '10', 10) || 10));
    const offset = Math.max(0, Number.parseInt(request.nextUrl.searchParams.get('offset') || '0', 10) || 0);
    const result = await getPool().query(
      `SELECT s.id, s.document_id, s.algorithm, s.signed_at, s.verified,
              d.title, d.file_size, d.mime_type
       FROM signatures s
       JOIN documents d ON d.id = s.document_id
       WHERE s.signer_id = $1 AND s.verified = true
       ORDER BY s.created_at DESC
       LIMIT $2 OFFSET $3`,
      [user.id, limit, offset],
    );
    const countResult = await getPool().query(
      'SELECT COUNT(*) AS total FROM signatures WHERE signer_id = $1 AND verified = true',
      [user.id],
    );
    return NextResponse.json({
      signatures: result.rows.map((row) => ({
        id: row.id,
        documentId: row.document_id,
        name: row.title,
        status: row.verified ? 'Verified' : 'Invalid',
        verified: row.verified,
        timestamp: row.signed_at,
        algorithm: row.algorithm,
        fileSize: row.file_size === null ? null : Number(row.file_size),
        mimeType: row.mime_type,
      })),
      total: Number(countResult.rows[0]?.total || 0),
      limit,
      offset,
    });
  } catch (error) {
    console.error('Recent signatures fetch failed:', error);
    return NextResponse.json({ error: 'Failed to retrieve signatures' }, { status: 500 });
  }
}
