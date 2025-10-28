/**
 * Documents API Route - GET /api/documents
 * List and search documents
 */

import { NextRequest, NextResponse } from 'next/server';
import { query as dbQuery } from '@/lib/db/postgres';
import { getAuthUserId } from '@/lib/auth/api-helpers';
import { indexDocument } from '@/lib/search/meilisearch';
import { publishDocumentCreated } from '@/lib/events/nats';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
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
    const countResult = await dbQuery(countQuery, values);
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
    const documentsResult = await dbQuery(documentsQuery, values);

    // Transform to camelCase
    const documents = documentsResult.rows.map((row: any) => ({
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
    // Get authenticated user
    const ownerId = await getAuthUserId(request);
    
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

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const insertQuery = `
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
    const result = await dbQuery(insertQuery, values);
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

    // Index in Meilisearch (async, don't wait)
    indexDocument({
      id: document.id,
      title: document.title,
      content: document.content,
      ownerId: document.ownerId,
      tags: document.tags || [],
      status: document.status,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    }).catch(err => console.error('Indexing error:', err));

    // Publish event to NATS (async, don't wait)
    publishDocumentCreated(document.id, document.ownerId, {
      title: document.title,
      contentType: document.contentType,
      encrypted: document.encrypted,
    }).catch(err => console.error('Event publishing error:', err));

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    console.error('Error creating document:', error);
    
    // Handle authentication errors
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to create document', details: String(error) },
      { status: 500 }
    );
  }
}