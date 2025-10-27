/**
 * Individual Collaboration API Routes
 * GET /api/collaborations/[id] - Get collaboration details
 * PATCH /api/collaborations/[id] - Update collaboration
 * DELETE /api/collaborations/[id] - Delete collaboration
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/postgres';
import { z } from 'zod';

// Validation schema
const updateCollaborationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: z.enum(['active', 'archived', 'inactive']).optional(),
  metadata: z.record(z.any()).optional(),
});

/**
 * GET /api/collaborations/[id]
 * Get collaboration details with members and documents
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return requireAuth(request, async (_req, user) => {
    try {
      const { id } = params;
      const pool = getPool();

      // Check if user has access to this collaboration
      const accessCheck = await pool.query(
        `SELECT c.*, cm.role, cm.permissions
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

      const collaboration = accessCheck.rows[0];

      // Get members
      const membersResult = await pool.query(
        `SELECT 
          cm.id,
          cm.user_id,
          cm.role,
          cm.permissions,
          cm.status,
          cm.joined_at,
          cm.last_active_at,
          u.email,
          u.display_name,
          u.avatar_url
         FROM collaboration_members cm
         JOIN users u ON cm.user_id = u.id
         WHERE cm.collaboration_id = $1
         ORDER BY cm.joined_at ASC`,
        [id]
      );

      // Get documents
      const documentsResult = await pool.query(
        `SELECT 
          cd.id,
          cd.document_id,
          cd.added_by,
          cd.added_at,
          cd.permissions,
          d.title,
          d.content_type,
          d.status as document_status,
          u.display_name as added_by_name
         FROM collaboration_documents cd
         JOIN documents d ON cd.document_id = d.id
         LEFT JOIN users u ON cd.added_by = u.id
         WHERE cd.collaboration_id = $1
         ORDER BY cd.added_at DESC`,
        [id]
      );

      return NextResponse.json({
        collaboration: {
          id: collaboration.id,
          name: collaboration.name,
          description: collaboration.description,
          ownerId: collaboration.owner_id,
          status: collaboration.status,
          createdAt: collaboration.created_at,
          updatedAt: collaboration.updated_at,
          metadata: collaboration.metadata,
          userRole: collaboration.role || (collaboration.owner_id === user.id ? 'owner' : 'member'),
          userPermissions: collaboration.permissions || { read: true, write: true, admin: true },
          isOwner: collaboration.owner_id === user.id,
        },
        members: membersResult.rows.map(m => ({
          id: m.id,
          userId: m.user_id,
          email: m.email,
          displayName: m.display_name,
          avatarUrl: m.avatar_url,
          role: m.role,
          permissions: m.permissions,
          status: m.status,
          joinedAt: m.joined_at,
          lastActiveAt: m.last_active_at,
        })),
        documents: documentsResult.rows.map(d => ({
          id: d.id,
          documentId: d.document_id,
          title: d.title,
          contentType: d.content_type,
          status: d.document_status,
          addedBy: d.added_by,
          addedByName: d.added_by_name,
          addedAt: d.added_at,
          permissions: d.permissions,
        })),
      });
    } catch (error) {
      console.error('Failed to fetch collaboration:', error);
      return NextResponse.json(
        { error: 'Failed to fetch collaboration' },
        { status: 500 }
      );
    }
  });
}

/**
 * PATCH /api/collaborations/[id]
 * Update collaboration (owner or admin only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return requireAuth(request, async (req, user) => {
    try {
      const { id } = params;
      const body = await req.json();

      // Validate input
      const validation = updateCollaborationSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          {
            error: 'Validation failed',
            errors: validation.error.errors,
          },
          { status: 400 }
        );
      }

      const updates = validation.data;
      const pool = getPool();

      // Check if user is owner or admin
      const accessCheck = await pool.query(
        `SELECT c.*, cm.role, cm.permissions
         FROM collaborations c
         LEFT JOIN collaboration_members cm ON c.id = cm.collaboration_id AND cm.user_id = $1
         WHERE c.id = $2`,
        [user.id, id]
      );

      if (accessCheck.rows.length === 0) {
        return NextResponse.json(
          { error: 'Collaboration not found' },
          { status: 404 }
        );
      }

      const collaboration = accessCheck.rows[0];
      const isOwner = collaboration.owner_id === user.id;
      const isAdmin = collaboration.permissions?.admin === true;

      if (!isOwner && !isAdmin) {
        return NextResponse.json(
          { error: 'Insufficient permissions' },
          { status: 403 }
        );
      }

      // Build update query dynamically
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramIndex = 1;

      if (updates.name !== undefined) {
        updateFields.push(`name = $${paramIndex++}`);
        updateValues.push(updates.name);
      }
      if (updates.description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        updateValues.push(updates.description);
      }
      if (updates.status !== undefined) {
        updateFields.push(`status = $${paramIndex++}`);
        updateValues.push(updates.status);
      }
      if (updates.metadata !== undefined) {
        updateFields.push(`metadata = $${paramIndex++}`);
        updateValues.push(JSON.stringify(updates.metadata));
      }

      if (updateFields.length === 0) {
        return NextResponse.json(
          { error: 'No fields to update' },
          { status: 400 }
        );
      }

      updateFields.push(`updated_at = NOW()`);
      updateValues.push(id);

      const result = await pool.query(
        `UPDATE collaborations
         SET ${updateFields.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING *`,
        updateValues
      );

      const updated = result.rows[0];

      // Log activity
      await pool.query(
        `INSERT INTO activity_log (user_id, action, entity_type, entity_id, entity_name, metadata)
         VALUES ($1, 'UPDATE_COLLABORATION', 'collaboration', $2, $3, $4)`,
        [
          user.id,
          updated.id,
          updated.name,
          JSON.stringify({ updates }),
        ]
      );

      return NextResponse.json({
        collaboration: {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          ownerId: updated.owner_id,
          status: updated.status,
          createdAt: updated.created_at,
          updatedAt: updated.updated_at,
          metadata: updated.metadata,
        },
      });
    } catch (error) {
      console.error('Failed to update collaboration:', error);
      return NextResponse.json(
        { error: 'Failed to update collaboration' },
        { status: 500 }
      );
    }
  });
}

/**
 * DELETE /api/collaborations/[id]
 * Delete collaboration (owner only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return requireAuth(request, async (_req, user) => {
    try {
      const { id } = params;
      const pool = getPool();

      // Check if user is owner
      const ownerCheck = await pool.query(
        `SELECT * FROM collaborations WHERE id = $1 AND owner_id = $2`,
        [id, user.id]
      );

      if (ownerCheck.rows.length === 0) {
        return NextResponse.json(
          { error: 'Collaboration not found or you are not the owner' },
          { status: 404 }
        );
      }

      const collaboration = ownerCheck.rows[0];

      // Soft delete by setting status to 'deleted'
      await pool.query(
        `UPDATE collaborations SET status = 'deleted', updated_at = NOW() WHERE id = $1`,
        [id]
      );

      // Log activity
      await pool.query(
        `INSERT INTO activity_log (user_id, action, entity_type, entity_id, entity_name)
         VALUES ($1, 'DELETE_COLLABORATION', 'collaboration', $2, $3)`,
        [user.id, id, collaboration.name]
      );

      return NextResponse.json({
        success: true,
        message: 'Collaboration deleted successfully',
      });
    } catch (error) {
      console.error('Failed to delete collaboration:', error);
      return NextResponse.json(
        { error: 'Failed to delete collaboration' },
        { status: 500 }
      );
    }
  });
}
