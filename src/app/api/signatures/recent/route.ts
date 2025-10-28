/**
 * Recent Signatures API
 * GET /api/signatures/recent - Get user's recent signatures
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    try {
      const { searchParams } = new URL(req.url);
      const limit = parseInt(searchParams.get('limit') || '10');
      const offset = parseInt(searchParams.get('offset') || '0');

      const result = await getPool().query(
        `SELECT 
          s.id,
          s.document_id,
          s.signature_data,
          s.algorithm,
          s.created_at,
          s.verified,
          d.filename,
          d.file_size,
          d.mime_type,
          (SELECT COUNT(*) FROM signatures WHERE document_id = d.id) as total_signatures
         FROM signatures s
         JOIN documents d ON s.document_id = d.id
         WHERE s.signer_id = $1
         ORDER BY s.created_at DESC
         LIMIT $2 OFFSET $3`,
        [user.id, limit, offset]
      );

      const signatures = result.rows.map((row: any) => ({
        id: row.id,
        documentId: row.document_id,
        name: row.filename,
        status: row.verified ? 'Completed' : 'Pending',
        verified: row.verified,
        time: formatRelativeTime(new Date(row.created_at)),
        timestamp: row.created_at,
        algorithm: row.algorithm,
        totalSigners: row.total_signatures,
        fileSize: formatFileSize(row.file_size),
        mimeType: row.mime_type
      }));

      // Get total count
      const countResult = await getPool().query(
        'SELECT COUNT(*) as total FROM signatures WHERE signer_id = $1',
        [user.id]
      );
      const total = parseInt(countResult.rows[0]?.total || '0');

      return NextResponse.json({
        signatures,
        total,
        limit,
        offset
      });
    } catch (error) {
      console.error('Failed to get recent signatures:', error);
      return NextResponse.json(
        { error: 'Failed to retrieve signatures' },
        { status: 500 }
      );
    }
  });
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
