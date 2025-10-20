import { NextRequest, NextResponse } from 'next/server';
import { optionalAuth } from '@/lib/auth/middleware';
import { Pool } from 'pg';

// Initialize PostgreSQL connection pool
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'oxsig',
  user: process.env.POSTGRES_USER || 'oxsig',
  password: process.env.POSTGRES_PASSWORD || 'changeme',
});

/**
 * GET /api/users/[id]
 * Get public user profile by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return optionalAuth(request, async (req, currentUser) => {
    try {
      const userId = params.id;

      const client = await pool.connect();

      try {
        // Fetch public user profile
        const result = await client.query(
          `SELECT 
            id,
            public_key,
            display_name,
            bio,
            avatar_url,
            role,
            created_at
          FROM users 
          WHERE id = $1 AND is_active = true`,
          [userId]
        );

        if (result.rows.length === 0) {
          return NextResponse.json(
            { error: 'User not found' },
            { status: 404 }
          );
        }

        const user = result.rows[0];

        // Return public profile (hide sensitive information)
        return NextResponse.json({
          user: {
            id: user.id,
            publicKey: user.public_key,
            displayName: user.display_name,
            bio: user.bio,
            avatarUrl: user.avatar_url,
            role: user.role,
            createdAt: user.created_at,
          },
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return NextResponse.json(
        { error: 'Failed to fetch user profile' },
        { status: 500 }
      );
    }
  });
}
