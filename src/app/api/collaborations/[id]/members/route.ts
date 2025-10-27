/**
 * Collaboration Members API
 * POST /api/collaborations/[id]/members - Add member to collaboration
 * PATCH /api/collaborations/[id]/members/[userId] - Update member role/permissions
 * DELETE /api/collaborations/[id]/members/[userId] - Remove member from collaboration
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/postgres';
import { z } from 'zod';

const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['owner', 'admin', 'member', 'viewer']).default('member'),
  permissions: z.object({
    read: z.boolean().default(true),
    write: z.boolean().default(false),
    admin: z.boolean().default(false),
    manage: z.boolean().default(false),
  }).optional(),
});

/**
 * POST /api/collaborations/[id]/members
 * Add member to collaboration (owner or admin only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return requireAuth(request, async (req, user) => {
    try {
      const { id: collaborationId } = params;
      const body = await req.json();

      // Validate input
      const validation = addMemberSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Validation failed', errors: validation.error.errors },
          { status: 400 }
        );
      }

      const { userId, role, permissions } = validation.data;
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

      // Check if user exists
      const userCheck = await pool.query(
        `SELECT id, email, display_name FROM users WHERE id = $1`,
        [userId]
      );

      if (userCheck.rows.length === 0) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        );
      }

      const newMember = userCheck.rows[0];

      // Check if user is already a member
      const memberCheck = await pool.query(
        `SELECT * FROM collaboration_members 
         WHERE collaboration_id = $1 AND user_id = $2`,
        [collaborationId, userId]
      );

      if (memberCheck.rows.length > 0) {
        return NextResponse.json(
          { error: 'User is already a member of this collaboration' },
          { status: 409 }
        );
      }

      // Set default permissions based on role
      const defaultPermissions = {
        owner: { read: true, write: true, admin: true, manage: true },
        admin: { read: true, write: true, admin: true, manage: false },
        member: { read: true, write: true, admin: false, manage: false },
        viewer: { read: true, write: false, admin: false, manage: false },
      };

      const memberPermissions = permissions || defaultPermissions[role];

      // Add member
      const result = await pool.query(
        `INSERT INTO collaboration_members 
         (collaboration_id, user_id, role, permissions, invited_by, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         RETURNING *`,
        [collaborationId, userId, role, JSON.stringify(memberPermissions), user.id]
      );

      const member = result.rows[0];

      // Log activity
      await pool.query(
        `INSERT INTO activity_log (user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, 'ADD_COLLABORATION_MEMBER', 'collaboration', $2, $3)`,
        [
          user.id,
          collaborationId,
          JSON.stringify({
            addedUserId: userId,
            addedUserEmail: newMember.email,
            role,
          }),
        ]
      );

      return NextResponse.json({
        member: {
          id: member.id,
          userId: member.user_id,
          email: newMember.email,
          displayName: newMember.display_name,
          role: member.role,
          permissions: member.permissions,
          status: member.status,
          joinedAt: member.joined_at,
        },
      }, { status: 201 });
    } catch (error) {
      console.error('Failed to add member:', error);
      return NextResponse.json(
        { error: 'Failed to add member' },
        { status: 500 }
      );
    }
  });
}
