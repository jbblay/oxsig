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
 * GET /api/users/search?q=query&limit=20
 * Search for users by display name or email
 */
export async function GET(request: NextRequest) {
  return optionalAuth(request, async (req, currentUser) => {
    try {
      const { searchParams } = new URL(request.url);
      const query = searchParams.get('q');
      const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

      if (!query || query.trim().length < 2) {
        return NextResponse.json(
          { error: 'Search query must be at least 2 characters' },
          { status: 400 }
        );
      }

      const client = await pool.connect();

      try {
        // Search users by display name or email (case-insensitive)
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
          WHERE 
            is_active = true
            AND (
              display_name ILIKE $1
              OR email ILIKE $1
              OR public_key ILIKE $1
            )
          ORDER BY 
            CASE WHEN display_name ILIKE $2 THEN 0 ELSE 1 END,
            display_name
          LIMIT $3`,
          [`%${query}%`, `${query}%`, limit]
        );

        const users = result.rows.map((user) => ({
          id: user.id,
          publicKey: user.public_key,
          displayName: user.display_name,
          bio: user.bio,
          avatarUrl: user.avatar_url,
          role: user.role,
          createdAt: user.created_at,
        }));

        return NextResponse.json({
          users,
          count: users.length,
          query,
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error searching users:', error);
      return NextResponse.json(
        { error: 'Failed to search users' },
        { status: 500 }
      );
    }
  });
}
