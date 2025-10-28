/**
 * Collaboration Files API Routes
 * GET /api/collaborations/[id]/files - List files in a collaboration
 * POST /api/collaborations/[id]/files - Upload a file reference
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/postgres';

/**
 * GET /api/collaborations/[id]/files
 * List files shared in a collaboration
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return requireAuth(request, async (_req, user) => {
    try {
      const { id } = await params;
      const pool = getPool();

      // Check if user has access to this collaboration
      const accessCheck = await pool.query(
        `SELECT c.id
         FROM collaborations c
         LEFT JOIN collaboration_members cm ON c.id = cm.collaboration_id AND cm.user_id = $1
         WHERE c.id = $2 
           AND (c.owner_id = $1 OR (cm.user_id = $1 AND cm.status = 'active'))`,
        [user.id, id]
      );

      if (accessCheck.rows.length === 0) {
        return NextResponse.json(
          { error: 'Collaboration not found or access denied' },
          { status: 404 }
        );
      }

      // Get files from collaboration_documents
      const filesResult = await pool.query(
        `SELECT 
          cd.id,
          cd.document_id,
          cd.added_by,
          cd.added_at,
          d.title as name,
          d.file_size,
          d.content_type,
          d.storage_path,
          d.encryption_metadata,
          u.display_name as added_by_name
         FROM collaboration_documents cd
         JOIN documents d ON cd.document_id = d.id
         LEFT JOIN users u ON cd.added_by = u.id
         WHERE cd.collaboration_id = $1
         ORDER BY cd.added_at DESC`,
        [id]
      );

      const files = filesResult.rows.map(file => ({
        id: file.id,
        name: file.name || 'Untitled Document',
        size: formatFileSize(file.file_size),
        encrypted: file.encryption_metadata != null,
        contentType: file.content_type,
        storagePath: file.storage_path,
        addedBy: file.added_by,
        addedByName: file.added_by_name,
        addedAt: file.added_at,
        documentId: file.document_id
      }));

      return NextResponse.json({
        files,
        total: files.length
      });
    } catch (error) {
      console.error('Failed to fetch files:', error);
      return NextResponse.json(
        { error: 'Failed to fetch files' },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/collaborations/[id]/files
 * Add a file reference to a collaboration
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return requireAuth(request, async (req, user) => {
    try {
      const { id } = await params;
      const body = await req.json();
      const { documentId, permissions = {} } = body;

      // Validate input
      if (!documentId) {
        return NextResponse.json(
          { error: 'Document ID is required' },
          { status: 400 }
        );
      }

      const pool = getPool();

      // Check if user has access to this collaboration
      const accessCheck = await pool.query(
        `SELECT c.id, cm.permissions
         FROM collaborations c
         LEFT JOIN collaboration_members cm ON c.id = cm.collaboration_id AND cm.user_id = $1
         WHERE c.id = $2 
           AND (c.owner_id = $1 OR (cm.user_id = $1 AND cm.status = 'active'))`,
        [user.id, id]
      );

      if (accessCheck.rows.length === 0) {
        return NextResponse.json(
          { error: 'Collaboration not found or access denied' },
          { status: 404 }
        );
      }

      // Check if user has write permissions
      const memberPermissions = accessCheck.rows[0].permissions;
      if (memberPermissions && !memberPermissions.write) {
        return NextResponse.json(
          { error: 'Insufficient permissions to add files' },
          { status: 403 }
        );
      }

      // Check if document exists and user owns it
      const documentCheck = await pool.query(
        `SELECT id, title, file_size, content_type, storage_path, encryption_metadata
         FROM documents
         WHERE id = $1 AND owner_id = $2`,
        [documentId, user.id]
      );

      if (documentCheck.rows.length === 0) {
        return NextResponse.json(
          { error: 'Document not found or you do not own it' },
          { status: 404 }
        );
      }

      const document = documentCheck.rows[0];

      // Add document to collaboration
      const result = await pool.query(
        `INSERT INTO collaboration_documents (collaboration_id, document_id, added_by, permissions)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (collaboration_id, document_id) DO UPDATE
         SET permissions = $4, added_at = NOW()
         RETURNING id, added_at`,
        [id, documentId, user.id, JSON.stringify(permissions)]
      );

      const collabDoc = result.rows[0];

      // Log activity
      await pool.query(
        `INSERT INTO activity_log (user_id, action, entity_type, entity_id, entity_name, metadata)
         VALUES ($1, 'ADD_DOCUMENT_TO_COLLABORATION', 'collaboration', $2, $3, $4)`,
        [
          user.id,
          id,
          document.title,
          JSON.stringify({ documentId })
        ]
      );

      return NextResponse.json({
        file: {
          id: collabDoc.id,
          name: document.title || 'Untitled Document',
          size: formatFileSize(document.file_size),
          encrypted: document.encryption_metadata != null,
          contentType: document.content_type,
          storagePath: document.storage_path,
          addedBy: user.id,
          addedAt: collabDoc.added_at,
          documentId: document.id
        }
      }, { status: 201 });
    } catch (error) {
      console.error('Failed to add file to collaboration:', error);
      return NextResponse.json(
        { error: 'Failed to add file to collaboration' },
        { status: 500 }
      );
    }
  });
}

/**
 * Helper function to format file size
 */
function formatFileSize(bytes: number | null): string {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}
