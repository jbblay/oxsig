/**
 * Files API Routes
 * GET /api/storage/files - List user's files
 * POST /api/storage/files - Upload file metadata after MinIO upload
 * DELETE /api/storage/files/[id] - Delete file and metadata
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { Pool } from 'pg';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

// Initialize PostgreSQL connection pool
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'oxsig',
  user: process.env.POSTGRES_USER || 'oxsig',
  password: process.env.POSTGRES_PASSWORD || 'oxsig_secure_password',
});

/**
 * GET /api/storage/files
 * List user's files with metadata
 */
export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    try {
      const { searchParams } = new URL(req.url);
      const page = parseInt(searchParams.get('page') || '1');
      const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
      const search = searchParams.get('search') || '';
      const mimeType = searchParams.get('type') || '';
      const offset = (page - 1) * limit;

      const client = await pool.connect();
      
      try {
        // Build WHERE clause
        let whereClause = 'WHERE f.user_id = $1 AND f.status = \'active\'';
        let params: any[] = [user.id];
        let paramIndex = 2;

        if (search) {
          whereClause += ` AND (f.filename ILIKE $${paramIndex} OR f.original_filename ILIKE $${paramIndex})`;
          params.push(`%${search}%`);
          paramIndex++;
        }

        if (mimeType) {
          whereClause += ` AND f.mime_type LIKE $${paramIndex}`;
          params.push(`${mimeType}%`);
          paramIndex++;
        }

        // Get total count
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM files f ${whereClause}`,
          params
        );
        const total = parseInt(countResult.rows[0].total);

        // Get files with pagination
        const filesResult = await client.query(
          `SELECT 
            f.id,
            f.filename,
            f.original_filename,
            f.file_size,
            f.mime_type,
            f.file_hash,
            f.is_encrypted,
            f.storage_provider,
            f.bucket_name,
            f.object_key,
            f.uploaded_at,
            f.last_accessed_at,
            f.metadata,
            f.tags
          FROM files f
          ${whereClause}
          ORDER BY f.uploaded_at DESC
          LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        );

        const files = filesResult.rows.map(row => ({
          id: row.id,
          filename: row.filename,
          originalFilename: row.original_filename,
          fileSize: parseInt(row.file_size),
          mimeType: row.mime_type,
          fileHash: row.file_hash,
          isEncrypted: row.is_encrypted,
          storageProvider: row.storage_provider,
          bucketName: row.bucket_name,
          objectKey: row.object_key,
          uploadedAt: row.uploaded_at,
          lastAccessedAt: row.last_accessed_at,
          metadata: row.metadata,
          tags: row.tags || []
        }));

        // Calculate storage stats
        const statsResult = await client.query(
          `SELECT 
            COUNT(*) as file_count,
            SUM(file_size) as total_size,
            COUNT(CASE WHEN is_encrypted THEN 1 END) as encrypted_count
          FROM files 
          WHERE user_id = $1 AND status = 'active'`,
          [user.id]
        );

        const stats = {
          fileCount: parseInt(statsResult.rows[0].file_count),
          totalSize: parseInt(statsResult.rows[0].total_size || '0'),
          encryptedCount: parseInt(statsResult.rows[0].encrypted_count),
          totalPages: Math.ceil(total / limit),
          currentPage: page
        };

        return NextResponse.json({
          files,
          stats,
          pagination: {
            total,
            page,
            limit,
            totalPages: stats.totalPages
          }
        });

      } finally {
        client.release();
      }
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
 * POST /api/storage/files
 * Record file metadata after successful MinIO upload
 */
export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    try {
      const body = await req.json();
      const {
        filename,
        originalFilename,
        fileSize,
        mimeType,
        fileHash,
        isEncrypted,
        storageProvider = 'minio',
        bucketName,
        objectKey,
        metadata = {},
        tags = []
      } = body;

      // Validate required fields
      if (!filename || !originalFilename || !fileSize || !objectKey) {
        return NextResponse.json(
          { error: 'Missing required fields: filename, originalFilename, fileSize, objectKey' },
          { status: 400 }
        );
      }

      if (fileSize <= 0 || fileSize > 5 * 1024 * 1024 * 1024) { // 5GB limit
        return NextResponse.json(
          { error: 'Invalid file size (must be between 1 byte and 5GB)' },
          { status: 400 }
        );
      }

      const client = await pool.connect();
      
      try {
        // Insert file metadata
        const result = await client.query(
          `INSERT INTO files (
            user_id, filename, original_filename, file_size, mime_type, 
            file_hash, is_encrypted, storage_provider, bucket_name, object_key,
            metadata, tags
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING id, filename, file_size, mime_type, uploaded_at`,
          [
            user.id,
            filename,
            originalFilename,
            fileSize,
            mimeType || 'application/octet-stream',
            fileHash || null,
            isEncrypted || false,
            storageProvider,
            bucketName || 'oxsig-files',
            objectKey,
            metadata,
            tags
          ]
        );

        const file = result.rows[0];

        // Log activity
        await client.query(
          `INSERT INTO activity_log (user_id, action, entity_type, entity_id, entity_name, ip_address, metadata)
           VALUES ($1, 'UPLOAD_FILE', 'file', $2, $3, $4, $5)`,
          [
            user.id,
            file.id,
            file.filename,
            req.ip || null,
            JSON.stringify({ 
              fileSize: fileSize,
              mimeType: mimeType,
              isEncrypted: isEncrypted 
            })
          ]
        );

        return NextResponse.json({
          file: {
            id: file.id,
            filename: file.filename,
            fileSize: fileSize,
            mimeType: file.mime_type,
            uploadedAt: file.uploaded_at
          }
        }, { status: 201 });

      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Failed to record file metadata:', error);
      return NextResponse.json(
        { error: 'Failed to record file metadata' },
        { status: 500 }
      );
    }
  });
}