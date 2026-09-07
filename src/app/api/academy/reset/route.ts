import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/pool';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

export async function DELETE(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 3, windowMs: 60 * 60 * 1000, failClosed: true }, user.id);
    if (rateLimit) return rateLimit;

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM academy_courses WHERE owner_id = $1', [user.id]);

      // Migration 039 may intentionally lag an application deployment. When the
      // capability-path model exists, deleting enrollments cascades capability
      // evidence so "Clear Academy" really returns the learner journey to zero.
      // Cyber Lab and other product resources are intentionally untouched.
      const capabilityPaths = await client.query(`SELECT to_regclass('public.learning_path_enrollments') AS relation`);
      if (capabilityPaths.rows[0]?.relation) {
        await client.query('DELETE FROM learning_path_enrollments WHERE owner_id = $1', [user.id]);
      }

      // Migration 038 may intentionally lag an application deployment. If the
      // learner activity ledger exists, remove only Academy activity. Lab activity
      // on the same day remains intact.
      const ledger = await client.query(`SELECT to_regclass('public.learning_activity_days') AS relation`);
      if (ledger.rows[0]?.relation) {
        await client.query(
          `UPDATE learning_activity_days
           SET academy_actions = 0, updated_at = NOW()
           WHERE owner_id = $1`,
          [user.id]
        );
        await client.query(
          `DELETE FROM learning_activity_days
           WHERE owner_id = $1 AND academy_actions = 0 AND lab_actions = 0`,
          [user.id]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return NextResponse.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  });
}
