/**
 * WebAuthn Credentials Management
 * GET /api/webauthn/credentials - List user's credentials
 * DELETE /api/webauthn/credentials/[id] - Remove a credential
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/postgres';

/**
 * GET /api/webauthn/credentials
 * List all WebAuthn credentials for the authenticated user
 */
export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    try {
      const pool = getPool();

      const result = await pool.query(
        `SELECT 
           id, 
           device_name, 
           aaguid,
           transports,
           user_verified,
           backup_eligible,
           backup_state,
           last_used_at,
           created_at
         FROM webauthn_credentials 
         WHERE user_id = $1
         ORDER BY last_used_at DESC NULLS LAST, created_at DESC`,
        [user.id]
      );

      const credentials = result.rows.map((row) => ({
        id: row.id,
        deviceName: row.device_name,
        aaguid: row.aaguid,
        transports: JSON.parse(row.transports),
        userVerified: row.user_verified,
        backupEligible: row.backup_eligible,
        backupState: row.backup_state,
        lastUsedAt: row.last_used_at,
        createdAt: row.created_at,
      }));

      return NextResponse.json({
        credentials,
        count: credentials.length,
      });
    } catch (error) {
      console.error('Failed to list credentials:', error);
      return NextResponse.json(
        { error: 'Failed to list credentials' },
        { status: 500 }
      );
    }
  });
}
