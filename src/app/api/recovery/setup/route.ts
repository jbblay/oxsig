/**
 * Social Recovery API Routes
 * POST /api/recovery/setup - Create recovery package
 * GET /api/recovery/guardians - List guardians
 * POST /api/recovery/guardians - Add guardian
 * DELETE /api/recovery/guardians/[did] - Remove guardian
 * POST /api/recovery/initiate - Start recovery session
 * POST /api/recovery/submit-share - Guardian submits share
 * POST /api/recovery/complete - Complete recovery
 * POST /api/recovery/cancel - Cancel recovery
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/postgres';
import { z } from 'zod';
import {
  createRecoveryPackage,
  addGuardian,
  removeGuardian,
  validateRecoveryPackage,
  type Guardian,
  type RecoveryConfig,
} from '@/lib/crypto/social-recovery';

const setupRecoverySchema = z.object({
  masterKey: z.string().length(64), // 32 bytes hex
  guardians: z.array(z.object({
    did: z.string(),
    publicKey: z.string(),
    displayName: z.string().optional(),
  })).min(2),
  threshold: z.number().int().min(2),
  timeLock: z.number().int().min(0).optional(),
  sessionExpiry: z.number().int().positive().optional(),
});

/**
 * POST /api/recovery/setup
 * Create or update recovery package
 */
export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    try {
      const body = await req.json();
      const validation = setupRecoverySchema.safeParse(body);

      if (!validation.success) {
        return NextResponse.json(
          { error: 'Validation failed', errors: validation.error.errors },
          { status: 400 }
        );
      }

      const { masterKey, guardians, threshold, timeLock, sessionExpiry } = validation.data;

      // Convert master key from hex to Buffer
      const masterKeyBuffer = Buffer.from(masterKey, 'hex');

      const config: RecoveryConfig = {
        threshold,
        totalGuardians: guardians.length,
        timeLock,
        sessionExpiry,
      };

      // Create recovery package
      const recoveryPackage = await createRecoveryPackage(
        masterKeyBuffer,
        guardians.map(g => ({
          ...g,
          addedAt: Date.now(),
        })),
        config
      );

      // Validate package
      if (!validateRecoveryPackage(recoveryPackage)) {
        return NextResponse.json(
          { error: 'Failed to create valid recovery package' },
          { status: 500 }
        );
      }

      // Store recovery package in database
      const pool = getPool();
      await pool.query(
        `INSERT INTO recovery_packages (user_id, config, guardians, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET
           config = EXCLUDED.config,
           guardians = EXCLUDED.guardians,
           updated_at = NOW()`,
        [
          user.id,
          JSON.stringify(recoveryPackage.config),
          JSON.stringify(recoveryPackage.guardians),
        ]
      );

      // Log activity
      await pool.query(
        `INSERT INTO activity_log (user_id, action, entity_type, metadata)
         VALUES ($1, 'SETUP_RECOVERY', 'recovery', $2)`,
        [
          user.id,
          JSON.stringify({
            threshold,
            totalGuardians: guardians.length,
            guardianDids: guardians.map(g => g.did),
          }),
        ]
      );

      return NextResponse.json({
        success: true,
        config: recoveryPackage.config,
        guardians: recoveryPackage.guardians.map(g => ({
          did: g.did,
          displayName: g.displayName,
          addedAt: g.addedAt,
          hasShare: !!g.encryptedShare,
        })),
      });
    } catch (error) {
      console.error('Failed to setup recovery:', error);
      return NextResponse.json(
        { error: 'Failed to setup recovery' },
        { status: 500 }
      );
    }
  });
}

/**
 * GET /api/recovery/setup
 * Get current recovery configuration
 */
export async function GET(request: NextRequest) {
  return requireAuth(request, async (_req, user) => {
    try {
      const pool = getPool();
      
      const result = await pool.query(
        `SELECT config, guardians, created_at, updated_at
         FROM recovery_packages
         WHERE user_id = $1`,
        [user.id]
      );

      if (result.rows.length === 0) {
        return NextResponse.json(
          { configured: false },
          { status: 200 }
        );
      }

      const pkg = result.rows[0];

      return NextResponse.json({
        configured: true,
        config: pkg.config,
        guardians: pkg.guardians.map((g: Guardian) => ({
          did: g.did,
          displayName: g.displayName,
          addedAt: g.addedAt,
          hasShare: !!g.encryptedShare,
        })),
        createdAt: pkg.created_at,
        updatedAt: pkg.updated_at,
      });
    } catch (error) {
      console.error('Failed to get recovery config:', error);
      return NextResponse.json(
        { error: 'Failed to get recovery config' },
        { status: 500 }
      );
    }
  });
}
