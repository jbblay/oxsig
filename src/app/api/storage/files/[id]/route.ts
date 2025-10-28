/**
 * File Management API Route - Individual File Operations
 * GET /api/storage/files/[id] - Get file metadata and signed download URL
 * DELETE /api/storage/files/[id] - Delete file and metadata
 * PATCH /api/storage/files/[id] - Update file metadata
 */

import { NextRequest, NextResponse } from 'next/server';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';

/**
 * GET /api/storage/files/[id]
 * Get file metadata and generate signed download URL
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return requireAuth(request, async (req, user) => {
    try {
      const { id: fileId } = await params;

      if (!fileId || !/^\d+$/.test(fileId)) {
        return NextResponse.json(
          { error: 'Invalid file ID' },
          { status: 400 }
        );
      }

      const pool = getPool();
      const client = await pool.connect();
      
      try {
        // Get file metadata
        const result = await client.query(
          `SELECT 
            f.id, f.filename, f.original_filename, f.file_size, f.mime_type,
            f.file_hash, f.is_encrypted, f.storage_provider, f.bucket_name,
            f.object_key, f.uploaded_at, f.last_accessed_at, f.metadata, f.tags
          FROM files f
          WHERE f.id = $1 AND f.user_id = $2 AND f.status = 'active'`,
          [fileId, user.id]
        );

        if (result.rows.length === 0) {
          return NextResponse.json(
            { error: 'File not found' },
            { status: 404 }
          );
        }

        const file = result.rows[0];

        // Update last accessed timestamp
        await client.query(
          `UPDATE files SET last_accessed_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [fileId]
        );

        // Generate signed download URL (MinIO presigned URL)
        const downloadUrl = await generatePresignedUrl(file.bucket_name, file.object_key);

        // Log access activity
        await client.query(
          `INSERT INTO activity_log (user_id, action, entity_type, entity_id, entity_name, ip_address)
           VALUES ($1, 'ACCESS_FILE', 'file', $2, $3, $4)`,
          [user.id, file.id, file.filename, req.ip || null]
        );

        return NextResponse.json({
          file: {
            id: file.id,
            filename: file.filename,
            originalFilename: file.original_filename,
            fileSize: parseInt(file.file_size),
            mimeType: file.mime_type,
            fileHash: file.file_hash,
            isEncrypted: file.is_encrypted,
            storageProvider: file.storage_provider,
            uploadedAt: file.uploaded_at,
            lastAccessedAt: file.last_accessed_at,
            metadata: file.metadata,
            tags: file.tags || []
          },
          downloadUrl
        });

      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Failed to get file:', error);
      return NextResponse.json(
        { error: 'Failed to get file' },
        { status: 500 }
      );
    }
  });
}

/**
 * DELETE /api/storage/files/[id]
 * Delete file from storage and database
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return requireAuth(request, async (req, user) => {
    try {
      const { id: fileId } = await params;

      if (!fileId || !/^\d+$/.test(fileId)) {
        return NextResponse.json(
          { error: 'Invalid file ID' },
          { status: 400 }
        );
      }

      const pool = getPool();
      const client = await pool.connect();
      
      try {
        // Get file info for deletion
        const result = await client.query(
          `SELECT id, filename, bucket_name, object_key, storage_provider
          FROM files
          WHERE id = $1 AND user_id = $2 AND status = 'active'`,
          [fileId, user.id]
        );

        if (result.rows.length === 0) {
          return NextResponse.json(
            { error: 'File not found' },
            { status: 404 }
          );
        }

        const file = result.rows[0];

        // Mark file as deleted (soft delete)
        await client.query(
          `UPDATE files SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [fileId]
        );

        // Remove from collaboration documents if associated
        await client.query(
          `DELETE FROM collaboration_documents WHERE file_id = $1`,
          [fileId]
        );

        // Log deletion activity
        await client.query(
          `INSERT INTO activity_log (user_id, action, entity_type, entity_id, entity_name, ip_address)
           VALUES ($1, 'DELETE_FILE', 'file', $2, $3, $4)`,
          [user.id, file.id, file.filename, req.ip || null]
        );

        // Schedule physical deletion from MinIO (async)
        if (file.storage_provider === 'minio') {
          schedulePhysicalDeletion(file.bucket_name, file.object_key);
        }

        return NextResponse.json({ message: 'File deleted successfully' });

      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Failed to delete file:', error);
      return NextResponse.json(
        { error: 'Failed to delete file' },
        { status: 500 }
      );
    }
  });
}

/**
 * PATCH /api/storage/files/[id]
 * Update file metadata (filename, tags, etc.)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return requireAuth(request, async (req, user) => {
    try {
      const { id: fileId } = await params;
      const body = await req.json();
      const { filename, tags, metadata } = body;

      if (!fileId || !/^\d+$/.test(fileId)) {
        return NextResponse.json(
          { error: 'Invalid file ID' },
          { status: 400 }
        );
      }

      const pool = getPool();
      const client = await pool.connect();
      
      try {
        // Check if file exists and belongs to user
        const existsResult = await client.query(
          `SELECT id, filename FROM files WHERE id = $1 AND user_id = $2 AND status = 'active'`,
          [fileId, user.id]
        );

        if (existsResult.rows.length === 0) {
          return NextResponse.json(
            { error: 'File not found' },
            { status: 404 }
          );
        }

        // Build update query dynamically
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (filename !== undefined) {
          updates.push(`filename = $${paramIndex}`);
          values.push(filename);
          paramIndex++;
        }

        if (tags !== undefined) {
          updates.push(`tags = $${paramIndex}`);
          values.push(JSON.stringify(tags));
          paramIndex++;
        }

        if (metadata !== undefined) {
          updates.push(`metadata = $${paramIndex}`);
          values.push(JSON.stringify(metadata));
          paramIndex++;
        }

        if (updates.length === 0) {
          return NextResponse.json(
            { error: 'No valid fields to update' },
            { status: 400 }
          );
        }

        // Add updated timestamp
        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(fileId, user.id);

        const updateQuery = `
          UPDATE files 
          SET ${updates.join(', ')}
          WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
          RETURNING id, filename, tags, metadata, updated_at
        `;

        const result = await client.query(updateQuery, values);
        const updatedFile = result.rows[0];

        // Log update activity
        await client.query(
          `INSERT INTO activity_log (user_id, action, entity_type, entity_id, entity_name, ip_address, metadata)
           VALUES ($1, 'UPDATE_FILE', 'file', $2, $3, $4, $5)`,
          [user.id, fileId, updatedFile.filename, req.ip || null, JSON.stringify({ updates: Object.keys(body) })]
        );

        return NextResponse.json({
          file: {
            id: updatedFile.id,
            filename: updatedFile.filename,
            tags: updatedFile.tags || [],
            metadata: updatedFile.metadata || {},
            updatedAt: updatedFile.updated_at
          }
        });

      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Failed to update file:', error);
      return NextResponse.json(
        { error: 'Failed to update file' },
        { status: 500 }
      );
    }
  });
}

/**
 * Generate presigned URL for MinIO download
 */
async function generatePresignedUrl(bucketName: string, objectKey: string): Promise<string> {
  try {
    // In production, this would use MinIO client
    // For now, return a placeholder URL
    const minioEndpoint = process.env.MINIO_ENDPOINT || 'http://localhost:9000';
    return `${minioEndpoint}/${bucketName}/${objectKey}?X-Amz-Expires=3600`;
  } catch (error) {
    console.error('Failed to generate presigned URL:', error);
    throw new Error('Failed to generate download URL');
  }
}

/**
 * Schedule physical deletion from MinIO storage
 */
async function schedulePhysicalDeletion(bucketName: string, objectKey: string): Promise<void> {
  try {
    const s3Client = new S3Client({
      endpoint: process.env.STORAGE_ENDPOINT || 'http://localhost:9000',
      region: process.env.STORAGE_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY || 'minioadmin',
        secretAccessKey: process.env.STORAGE_SECRET_KEY || 'minioadmin',
      },
      forcePathStyle: true,
    });

    await s3Client.send(new DeleteObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    }));

    console.log(`Successfully deleted ${bucketName}/${objectKey} from S3`);
  } catch (error) {
    console.error('Failed to delete from S3:', error);
    throw error;
  }
}