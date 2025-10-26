/**
 * Document by ID API - GET/PATCH/DELETE /api/documents/[id]
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
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  return pool;
}

function mapRow(row: any) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    contentType: row.content_type,
    ownerId: row.owner_id,
    encrypted: row.encrypted,
    encryptionKey: row.encryption_key,
    fileUrl: row.file_url,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    metadata: row.metadata,
    tags: row.tags,
    status: row.status,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const query = `
      SELECT 
        id, title, content, content_type, owner_id, encrypted, encryption_key,
        file_url, file_size, mime_type, metadata, tags, status, version,
        created_at, updated_at
      FROM documents
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const result = await getPool().query(query, [id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json(mapRow(result.rows[0]));
  } catch (error) {
    console.error('Error fetching document:', error);
    return NextResponse.json(
      { error: 'Failed to fetch document', details: String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, content, tags, metadata, status, contentType } = body;

    const existing = await getPool().query(
      `SELECT id FROM documents WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const result = await getPool().query(
      `
      UPDATE documents
      SET 
        title = COALESCE($1, title),
        content = COALESCE($2, content),
        tags = COALESCE($3, tags),
        metadata = COALESCE($4, metadata),
        status = COALESCE($5, status),
        content_type = COALESCE($6, content_type),
        updated_at = NOW()
      WHERE id = $7
      RETURNING 
        id, title, content, content_type, owner_id, encrypted, encryption_key,
        file_url, file_size, mime_type, metadata, tags, status, version,
        created_at, updated_at
      `,
      [title ?? null, content ?? null, tags ?? null, metadata ?? null, status ?? null, contentType ?? null, id]
    );

    return NextResponse.json(mapRow(result.rows[0]));
  } catch (error) {
    console.error('Error updating document:', error);
    return NextResponse.json(
      { error: 'Failed to update document', details: String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const result = await getPool().query(
      `UPDATE documents SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Document not found or already deleted' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting document:', error);
    return NextResponse.json(
      { error: 'Failed to delete document', details: String(error) },
      { status: 500 }
    );
  }
}