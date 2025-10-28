/**
 * Delete WebAuthn Credential
 * DELETE /api/webauthn/credentials/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/postgres';

/**
 * DELETE /api/webauthn/credentials/[id]
 * Remove a WebAuthn credential
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return requireAuth(request, async (req, user) => {
    try {
      const { id: credentialId } = await params;
      const pool = getPool();

      // Check credential exists and belongs to user
      const checkResult = await pool.query(
        `SELECT device_name FROM webauthn_credentials 
         WHERE id = $1 AND user_id = $2`,
        [credentialId, user.id]
      );

      if (checkResult.rows.length === 0) {
        return NextResponse.json(
          { error: 'Credential not found' },
          { status: 404 }
        );
      }

      const deviceName = checkResult.rows[0].device_name;

      // Check if user has at least one other credential or password
      const securityResult = await pool.query(
        `SELECT 
           (SELECT COUNT(*) FROM webauthn_credentials WHERE user_id = $1) as cred_count,
           (SELECT password_hash IS NOT NULL FROM users WHERE id = $1) as has_password`,
        [user.id]
      );

      const { cred_count, has_password } = securityResult.rows[0];

      if (cred_count <= 1 && !has_password) {
        return NextResponse.json(
          { error: 'Cannot remove last authentication method. Add a password or another credential first.' },
          { status: 400 }
        );
      }

      // Delete credential
      await pool.query(
        `DELETE FROM webauthn_credentials WHERE id = $1 AND user_id = $2`,
        [credentialId, user.id]
      );

      // Log activity
      await pool.query(
        `INSERT INTO activity_log (user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, 'REMOVE_WEBAUTHN', 'credential', $2, $3)`,
        [
          user.id,
          credentialId,
          JSON.stringify({ deviceName }),
        ]
      );

      return NextResponse.json({
        success: true,
        message: `Removed ${deviceName}`,
      });
    } catch (error) {
      console.error('Failed to delete credential:', error);
      return NextResponse.json(
        { error: 'Failed to delete credential' },
        { status: 500 }
      );
    }
  });
}
