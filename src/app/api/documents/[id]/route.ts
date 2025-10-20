/**
 * Document API Route - GET/PUT/DELETE /api/documents/[id]
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

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const query = `
      SELECT 
        id,
        title,
        content,
        content_type,
        owner_id,
        encrypted,
        encryption_key,
        file_url,
        file_size,
        mime_type,
        metadata,
        tags,
        status,
        version,
        created_at,
        updated_at,
        deleted_at
      FROM documents
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await getPool().query(query, [id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const row = result.rows[0];
    const document = {
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

    return NextResponse.json(document);
  } catch (error) {
    console.error('Error fetching document:', error);
    return NextResponse.json(
      { error: 'Failed to fetch document', details: String(error) },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();

    // Build dynamic UPDATE query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (body.title !== undefined) {
      updates.push(`title = $${paramIndex}`);
      values.push(body.title);
      paramIndex++;
    }

    if (body.content !== undefined) {
      updates.push(`content = $${paramIndex}`);
      values.push(body.content);
      paramIndex++;
    }

    if (body.encrypted !== undefined) {
      updates.push(`encrypted = $${paramIndex}`);
      values.push(body.encrypted);
      paramIndex++;
    }

    if (body.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex}`);
      values.push(body.metadata);
      paramIndex++;
    }

    if (body.tags !== undefined) {
      updates.push(`tags = $${paramIndex}`);
      values.push(body.tags);
      paramIndex++;
    }

    if (body.status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      values.push(body.status);
      paramIndex++;
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // Increment version
    updates.push(`version = version + 1`);
    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    values.push(id);
    const query = `
      UPDATE documents
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex} AND deleted_at IS NULL
      RETURNING 
        id,
        title,
        content,
        content_type,
        owner_id,
        encrypted,
        encryption_key,
        file_url,
        file_size,
        mime_type,
        metadata,
        tags,
        status,
        version,
        created_at,
        updated_at
    `;

    const result = await getPool().query(query, values);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const row = result.rows[0];
    const document = {
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

    // TODO: Update in Meilisearch
    // TODO: Publish update event to NATS

    return NextResponse.json(document);
  } catch (error) {
    console.error('Error updating document:', error);
    return NextResponse.json(
      { error: 'Failed to update document', details: String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Soft delete
    const query = `
      UPDATE documents
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;

    const result = await getPool().query(query, [id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // TODO: Remove from Meilisearch
    // TODO: Publish delete event to NATS

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting document:', error);
    return NextResponse.json(
      { error: 'Failed to delete document', details: String(error) },
      { status: 500 }
    );
  }
}
