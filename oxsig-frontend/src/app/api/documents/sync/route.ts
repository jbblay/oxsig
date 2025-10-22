/**
 * Document Sync API - POST /api/documents/sync
 * Upsert document content/metadata from offline cache synchronization.
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id,
      hash,
      name,
      content,
      signatures,
      timestamp,
      metadata,
    } = body;

    const ownerId = 'temp-user-id'; // TODO: replace with session user
    const title = name || 'Synced Document';
    const contentType = 'text';

    if (id) {
      // Try update existing
      const exists = await getPool().query(
        `SELECT id FROM documents WHERE id = $1 AND deleted_at IS NULL`,
        [id]
      );

      if (exists.rows.length > 0) {
        const updated = await getPool().query(
          `
          UPDATE documents
          SET 
            title = COALESCE($1, title),
            content = COALESCE($2, content),
            metadata = COALESCE($3, metadata),
            updated_at = NOW()
          WHERE id = $4
          RETURNING 
            id, title, content, content_type, owner_id, encrypted, encryption_key,
            file_url, file_size, mime_type, metadata, tags, status, version,
            created_at, updated_at
          `,
          [title, content ?? '', metadata ?? {}, id]
        );

        // Note: signatures sync is not implemented server-side here
        return NextResponse.json(mapRow(updated.rows[0]));
      }
    }

    // Create new
    const created = await getPool().query(
      `
      INSERT INTO documents (
        title, content, content_type, owner_id, encrypted, metadata, tags, status, version
      ) VALUES ($1, $2, $3, $4, false, $5, $6, 'draft', 1)
      RETURNING 
        id, title, content, content_type, owner_id, encrypted, encryption_key,
        file_url, file_size, mime_type, metadata, tags, status, version,
        created_at, updated_at
      `,
      [title, content ?? '', contentType, ownerId, metadata ?? {}, [],]
    );

    return NextResponse.json(mapRow(created.rows[0]), { status: 201 });
  } catch (error) {
    console.error('Error syncing document:', error);
    return NextResponse.json(
      { error: 'Failed to sync document', details: String(error) },
      { status: 500 }
    );
  }
}