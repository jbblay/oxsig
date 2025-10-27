/**
 * Individual Member Management API
 * PATCH /api/collaborations/[id]/members/[userId] - Update member role/permissions
 * DELETE /api/collaborations/[id]/members/[userId] - Remove member
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/postgres';
import { z } from 'zod';

const updateMemberSchema = z.object({
  role: z.enum(['owner', 'admin', 'member', 'viewer']).optional(),
  permissions: z.object({
    read: z.boolean(),
    write: z.boolean(),
    admin: z.boolean(),
    manage: z.boolean(),
  }).optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
});

/**
 * PATCH /api/collaborations/[id]/members/[userId]
 * Update member role and permissions (owner or admin only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  return requireAuth(request, async (req, user) => {
    try {
      const { id: collaborationId, userId: targetUserId } = params;
      const body = await req.json();

      // Validate input
      const validation = updateMemberSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Validation failed', errors: validation.error.errors },
          { status: 400 }
        );
      }

      const updates = validation.data;
      const pool = getPool();

      // Check if requester has admin permissions
      const accessCheck = await pool.query(
        `SELECT c.*, cm.role, cm.permissions
         FROM collaborations c
         LEFT JOIN collaboration_members cm ON c.id = cm.collaboration_id AND cm.user_id = $1
         WHERE c.id = $2`,
        [user.id, collaborationId]
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

      // Check if target member exists
      const memberCheck = await pool.query(
        `SELECT cm.*, u.email, u.display_name
         FROM collaboration_members cm
         JOIN users u ON cm.user_id = u.id
         WHERE cm.collaboration_id = $1 AND cm.user_id = $2`,
        [collaborationId, targetUserId]
      );

      if (memberCheck.rows.length === 0) {
        return NextResponse.json(
          { error: 'Member not found' },
          { status: 404 }
        );
      }

      const currentMember = memberCheck.rows[0];

      // Prevent owner from being demoted by non-owners
      if (currentMember.role === 'owner' && !isOwner) {
        return NextResponse.json(
          { error: 'Only the owner can modify the owner role' },
          { status: 403 }
        );
      }

      // Build update query
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramIndex = 1;

      if (updates.role !== undefined) {
        updateFields.push(`role = $${paramIndex++}`);
        updateValues.push(updates.role);
      }
      if (updates.permissions !== undefined) {
        updateFields.push(`permissions = $${paramIndex++}`);
        updateValues.push(JSON.stringify(updates.permissions));
      }
      if (updates.status !== undefined) {
        updateFields.push(`status = $${paramIndex++}`);
        updateValues.push(updates.status);
      }

      if (updateFields.length === 0) {
        return NextResponse.json(
          { error: 'No fields to update' },
          { status: 400 }
        );
      }

      updateValues.push(collaborationId, targetUserId);

      const result = await pool.query(
        `UPDATE collaboration_members
         SET ${updateFields.join(', ')}
         WHERE collaboration_id = $${paramIndex++} AND user_id = $${paramIndex}
         RETURNING *`,
        updateValues
      );

      const updatedMember = result.rows[0];

      // Log activity
      await pool.query(
        `INSERT INTO activity_log (user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, 'UPDATE_COLLABORATION_MEMBER', 'collaboration', $2, $3)`,
        [
          user.id,
          collaborationId,
          JSON.stringify({
            targetUserId,
            targetUserEmail: currentMember.email,
            updates,
          }),
        ]
      );

      return NextResponse.json({
        member: {
          id: updatedMember.id,
          userId: updatedMember.user_id,
          email: currentMember.email,
          displayName: currentMember.display_name,
          role: updatedMember.role,
          permissions: updatedMember.permissions,
          status: updatedMember.status,
          joinedAt: updatedMember.joined_at,
        },
      });
    } catch (error) {
      console.error('Failed to update member:', error);
      return NextResponse.json(
        { error: 'Failed to update member' },
        { status: 500 }
      );
    }
  });
}

/**
 * DELETE /api/collaborations/[id]/members/[userId]
 * Remove member from collaboration (owner or admin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  return requireAuth(request, async (_req, user) => {
    try {
      const { id: collaborationId, userId: targetUserId } = params;
      const pool = getPool();

      // Check if requester has admin permissions
      const accessCheck = await pool.query(
        `SELECT c.*, cm.role, cm.permissions
         FROM collaborations c
         LEFT JOIN collaboration_members cm ON c.id = cm.collaboration_id AND cm.user_id = $1
         WHERE c.id = $2`,
        [user.id, collaborationId]
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

      // Allow users to remove themselves
      const isSelfRemoval = targetUserId === user.id;

      if (!isOwner && !isAdmin && !isSelfRemoval) {
        return NextResponse.json(
          { error: 'Insufficient permissions' },
          { status: 403 }
        );
      }

      // Check if target member exists
      const memberCheck = await pool.query(
        `SELECT cm.*, u.email, u.display_name
         FROM collaboration_members cm
         JOIN users u ON cm.user_id = u.id
         WHERE cm.collaboration_id = $1 AND cm.user_id = $2`,
        [collaborationId, targetUserId]
      );

      if (memberCheck.rows.length === 0) {
        return NextResponse.json(
          { error: 'Member not found' },
          { status: 404 }
        );
      }

      const member = memberCheck.rows[0];

      // Prevent owner from being removed
      if (member.role === 'owner' && !isOwner) {
        return NextResponse.json(
          { error: 'Cannot remove the collaboration owner' },
          { status: 403 }
        );
      }

      // Prevent owner from removing themselves if they're the only owner
      if (isOwner && targetUserId === user.id) {
        const ownerCount = await pool.query(
          `SELECT COUNT(*) as count FROM collaboration_members 
           WHERE collaboration_id = $1 AND role = 'owner'`,
          [collaborationId]
        );
        
        if (parseInt(ownerCount.rows[0].count) <= 1) {
          return NextResponse.json(
            { error: 'Cannot remove the last owner. Transfer ownership first.' },
            { status: 400 }
          );
        }
      }

      // Delete member
      await pool.query(
        `DELETE FROM collaboration_members 
         WHERE collaboration_id = $1 AND user_id = $2`,
        [collaborationId, targetUserId]
      );

      // Log activity
      await pool.query(
        `INSERT INTO activity_log (user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, 'REMOVE_COLLABORATION_MEMBER', 'collaboration', $2, $3)`,
        [
          user.id,
          collaborationId,
          JSON.stringify({
            removedUserId: targetUserId,
            removedUserEmail: member.email,
            isSelfRemoval,
          }),
        ]
      );

      return NextResponse.json({
        success: true,
        message: 'Member removed successfully',
      });
    } catch (error) {
      console.error('Failed to remove member:', error);
      return NextResponse.json(
        { error: 'Failed to remove member' },
        { status: 500 }
      );
    }
  });
}
