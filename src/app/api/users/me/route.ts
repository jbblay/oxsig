import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
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
 * GET /api/users/me
 * Get current authenticated user profile
 */
export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    try {
      const client = await pool.connect();
      
      try {
        // Fetch user with all details
        const result = await client.query(
          `SELECT 
            id,
            public_key,
            display_name,
            email,
            bio,
            avatar_url,
            role,
            is_active,
            email_verified,
            two_factor_enabled,
            created_at,
            updated_at,
            last_seen_at
          FROM users 
          WHERE id = $1`,
          [user.id]
        );

        if (result.rows.length === 0) {
          return NextResponse.json(
            { error: 'User not found' },
            { status: 404 }
          );
        }

        const userProfile = result.rows[0];

        return NextResponse.json({
          user: {
            id: userProfile.id,
            publicKey: userProfile.public_key,
            displayName: userProfile.display_name,
            email: userProfile.email,
            bio: userProfile.bio,
            avatarUrl: userProfile.avatar_url,
            role: userProfile.role,
            isActive: userProfile.is_active,
            emailVerified: userProfile.email_verified,
            twoFactorEnabled: userProfile.two_factor_enabled,
            createdAt: userProfile.created_at,
            updatedAt: userProfile.updated_at,
            lastSeenAt: userProfile.last_seen_at,
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

/**
 * PATCH /api/users/me
 * Update current user profile
 */
export async function PATCH(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    try {
      const body = await request.json();
      const { displayName, email, bio, avatarUrl } = body;

      // Validate input
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (displayName !== undefined) {
        updates.push(`display_name = $${paramIndex}`);
        values.push(displayName);
        paramIndex++;
      }

      if (email !== undefined) {
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return NextResponse.json(
            { error: 'Invalid email format' },
            { status: 400 }
          );
        }
        updates.push(`email = $${paramIndex}`);
        values.push(email);
        paramIndex++;
        
        // Reset email verification if email changed
        updates.push(`email_verified = false`);
      }

      if (bio !== undefined) {
        if (bio.length > 500) {
          return NextResponse.json(
            { error: 'Bio must be 500 characters or less' },
            { status: 400 }
          );
        }
        updates.push(`bio = $${paramIndex}`);
        values.push(bio);
        paramIndex++;
      }

      if (avatarUrl !== undefined) {
        updates.push(`avatar_url = $${paramIndex}`);
        values.push(avatarUrl);
        paramIndex++;
      }

      if (updates.length === 0) {
        return NextResponse.json(
          { error: 'No fields to update' },
          { status: 400 }
        );
      }

      // Add updated_at timestamp
      updates.push(`updated_at = NOW()`);
      values.push(user.id);

      const client = await pool.connect();

      try {
        const query = `
          UPDATE users 
          SET ${updates.join(', ')}
          WHERE id = $${paramIndex}
          RETURNING 
            id,
            public_key,
            display_name,
            email,
            bio,
            avatar_url,
            role,
            is_active,
            email_verified,
            two_factor_enabled,
            created_at,
            updated_at,
            last_seen_at
        `;

        const result = await client.query(query, values);

        if (result.rows.length === 0) {
          return NextResponse.json(
            { error: 'User not found' },
            { status: 404 }
          );
        }

        const updatedUser = result.rows[0];

        return NextResponse.json({
          user: {
            id: updatedUser.id,
            publicKey: updatedUser.public_key,
            displayName: updatedUser.display_name,
            email: updatedUser.email,
            bio: updatedUser.bio,
            avatarUrl: updatedUser.avatar_url,
            role: updatedUser.role,
            isActive: updatedUser.is_active,
            emailVerified: updatedUser.email_verified,
            twoFactorEnabled: updatedUser.two_factor_enabled,
            createdAt: updatedUser.created_at,
            updatedAt: updatedUser.updated_at,
            lastSeenAt: updatedUser.last_seen_at,
          },
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error updating user profile:', error);
      return NextResponse.json(
        { error: 'Failed to update user profile' },
        { status: 500 }
      );
    }
  });
}

/**
 * DELETE /api/users/me
 * Deactivate current user account
 */
export async function DELETE(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    try {
      const client = await pool.connect();

      try {
        // Soft delete - mark user as inactive
        const result = await client.query(
          `UPDATE users 
           SET is_active = false, updated_at = NOW()
           WHERE id = $1
           RETURNING id`,
          [user.id]
        );

        if (result.rows.length === 0) {
          return NextResponse.json(
            { error: 'User not found' },
            { status: 404 }
          );
        }

        return NextResponse.json({
          message: 'Account deactivated successfully',
          userId: user.id,
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error deactivating user account:', error);
      return NextResponse.json(
        { error: 'Failed to deactivate account' },
        { status: 500 }
      );
    }
  });
}
