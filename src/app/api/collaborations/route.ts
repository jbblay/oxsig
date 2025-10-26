/**
 * Collaborations API Routes
 * GET /api/collaborations - List user's collaborations
 * POST /api/collaborations - Create new collaboration
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { Pool } from 'pg';

// Initialize PostgreSQL connection pool
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'oxsig',
  user: process.env.POSTGRES_USER || 'oxsig',
  password: process.env.POSTGRES_PASSWORD || 'oxsig_secure_password',
});

/**
 * GET /api/collaborations
 * List collaborations where user is owner or member
 */
export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    try {
      const client = await pool.connect();
      
      try {
        // Get collaborations where user is owner or member
        const result = await client.query(
          `SELECT DISTINCT
            c.id,
            c.name,
            c.description,
            c.owner_id,
            c.status,
            c.created_at,
            c.updated_at,
            c.metadata,
            u.display_name as owner_name,
            u.email as owner_email,
            cm.role as user_role,
            cm.permissions as user_permissions,
            (SELECT COUNT(*) FROM collaboration_members cm2 WHERE cm2.collaboration_id = c.id AND cm2.status = 'active') as member_count,
            (SELECT COUNT(*) FROM collaboration_documents cd WHERE cd.collaboration_id = c.id) as document_count
          FROM collaborations c
          JOIN users u ON c.owner_id = u.id
          LEFT JOIN collaboration_members cm ON c.id = cm.collaboration_id AND cm.user_id = $1
          WHERE (c.owner_id = $1 OR cm.user_id = $1)
            AND c.status = 'active'
            AND (cm.status = 'active' OR c.owner_id = $1)
          ORDER BY c.updated_at DESC`,
          [user.id]
        );

        const collaborations = result.rows.map(row => ({
          id: row.id,
          name: row.name,
          description: row.description,
          ownerId: row.owner_id,
          ownerName: row.owner_name,
          ownerEmail: row.owner_email,
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          metadata: row.metadata,
          userRole: row.user_role || (row.owner_id === user.id ? 'owner' : 'member'),
          userPermissions: row.user_permissions || { read: true, write: true, admin: true },
          memberCount: parseInt(row.member_count),
          documentCount: parseInt(row.document_count),
          isOwner: row.owner_id === user.id
        }));

        return NextResponse.json({
          collaborations,
          total: collaborations.length
        });

      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Failed to fetch collaborations:', error);
      return NextResponse.json(
        { error: 'Failed to fetch collaborations' },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/collaborations
 * Create new collaboration
 */
export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    try {
      const body = await req.json();
      const { name, description, metadata = {} } = body;

      // Validate input
      if (!name || name.trim().length === 0) {
        return NextResponse.json(
          { error: 'Collaboration name is required' },
          { status: 400 }
        );
      }

      if (name.length > 255) {
        return NextResponse.json(
          { error: 'Collaboration name must be less than 255 characters' },
          { status: 400 }
        );
      }

      const client = await pool.connect();
      
      try {
        // Start transaction
        await client.query('BEGIN');

        // Create collaboration
        const collaborationResult = await client.query(
          `INSERT INTO collaborations (name, description, owner_id, metadata)
           VALUES ($1, $2, $3, $4)
           RETURNING id, name, description, owner_id, status, created_at, updated_at, metadata`,
          [name.trim(), description?.trim() || null, user.id, metadata]
        );

        const collaboration = collaborationResult.rows[0];

        // Add owner as admin member
        await client.query(
          `INSERT INTO collaboration_members (collaboration_id, user_id, role, permissions, invited_by)
           VALUES ($1, $2, 'owner', $3, $2)`,
          [
            collaboration.id,
            user.id,
            JSON.stringify({ read: true, write: true, admin: true, manage: true })
          ]
        );

        // Log activity
        await client.query(
          `INSERT INTO activity_log (user_id, action, entity_type, entity_id, entity_name, ip_address, metadata)
           VALUES ($1, 'CREATE_COLLABORATION', 'collaboration', $2, $3, $4, $5)`,
          [
            user.id,
            collaboration.id,
            collaboration.name,
            req.ip || null,
            JSON.stringify({ description: collaboration.description })
          ]
        );

        await client.query('COMMIT');

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
            userRole: 'owner',
            userPermissions: { read: true, write: true, admin: true, manage: true },
            memberCount: 1,
            documentCount: 0,
            isOwner: true
          }
        }, { status: 201 });

      } catch (dbError) {
        await client.query('ROLLBACK');
        throw dbError;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Failed to create collaboration:', error);
      return NextResponse.json(
        { error: 'Failed to create collaboration' },
        { status: 500 }
      );
    }
  });
}