/**
 * Documents API Route - GET /api/documents
 * List and search documents
 */

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

// Database connection (reuse across requests)
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

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query');
    const tags = searchParams.get('tags')?.split(',');
    const status = searchParams.get('status');
    const encrypted = searchParams.get('encrypted');
    const ownerId = searchParams.get('ownerId');
    const sortByParam = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');

    const offset = (page - 1) * pageSize;

    // Build WHERE clause
    const conditions: string[] = ['deleted_at IS NULL'];
    const values: any[] = [];
    let paramIndex = 1;

    if (query) {
      conditions.push(`(title ILIKE $${paramIndex} OR content ILIKE $${paramIndex})`);
      values.push(`%${query}%`);
      paramIndex++;
    }

    if (tags && tags.length > 0) {
      conditions.push(`tags && $${paramIndex}`);
      values.push(tags);
      paramIndex++;
    }

    if (status) {
      conditions.push(`status = $${paramIndex}`);
      values.push(status);
      paramIndex++;
    }

    if (encrypted !== null && encrypted !== undefined) {
      conditions.push(`encrypted = $${paramIndex}`);
      values.push(encrypted === 'true');
      paramIndex++;
    }

    if (ownerId) {
      conditions.push(`owner_id = $${paramIndex}`);
      values.push(ownerId);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Map sortBy from API to actual DB columns
    const sortMap: Record<string, string> = {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      title: 'title',
    };
    const sortBy = sortMap[sortByParam] || 'created_at';

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM documents WHERE ${whereClause}`;
    const countResult = await getPool().query(countQuery, values);
    const total = parseInt(countResult.rows[0].count);

    // Get paginated documents
    const documentsQuery = `
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
        updated_at
      FROM documents
      WHERE ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    values.push(pageSize, offset);
    const documentsResult = await getPool().query(documentsQuery, values);

    // Transform to camelCase
    const documents = documentsResult.rows.map((row) => ({
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
    }));

    return NextResponse.json({
      data: documents,
      total,
      page,
      pageSize,
      hasMore: offset + pageSize < total,
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch documents', details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      title,
      content = '',
      contentType = 'html',
      encrypted = false,
      metadata = {},
      tags = [],
      status = 'draft',
    } = body;

    // TODO: Get user ID from session/auth
    const ownerId = 'temp-user-id';

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const query = `
      INSERT INTO documents (
        title,
        content,
        content_type,
        owner_id,
        encrypted,
        metadata,
        tags,
        status,
        version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)
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

    const values = [title, content, contentType, ownerId, encrypted, metadata, tags, status];
    const result = await getPool().query(query, values);
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

    // TODO: Index in Meilisearch
    // TODO: Publish event to NATS

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    console.error('Error creating document:', error);
    return NextResponse.json(
      { error: 'Failed to create document', details: String(error) },
      { status: 500 }
    );
  }
}