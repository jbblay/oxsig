import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { z } from 'zod';
import { countOtherPlatformAdmins, purgeUserAccount } from '@/lib/account/lifecycle';
import { getRequestMetadata, logAudit } from '@/lib/audit/logger';
import { isClerkConfigured } from '@/lib/auth/clerk-config';
import { deactivateClerkUser } from '@/lib/auth/clerk-user';
import { isE2EAuthEnabled } from '@/lib/auth/e2e-auth';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const ACCOUNT_DELETE_CONFIRMATION = 'DELETE';

const bodySchema = z.object({
  confirmation: z.string().trim().transform((value) => value.toUpperCase()).pipe(z.literal(ACCOUNT_DELETE_CONFIRMATION)),
}).strict();

/**
 * Self-service, production-grade account deletion.
 * Order matters: OXSIG data and cloud resources are purged first, then the
 * Clerk identity is removed so the person cannot sign back in to an empty shell.
 */
export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    const rateLimit = await checkRateLimit(req, { maxRequests: 3, windowMs: 60 * 60_000, failClosed: true }, user.id, 'account-delete');
    if (rateLimit) return rateLimit;

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: `Type ${ACCOUNT_DELETE_CONFIRMATION} to confirm` }, { status: 400 });

    const pool = getPool();
    if (user.role === 'admin' && (await countOtherPlatformAdmins(pool, user.id)) === 0) {
      return NextResponse.json(
        { error: 'You are the only platform admin. Promote another admin before deleting this account.' },
        { status: 409 }
      );
    }

    const metadata = getRequestMetadata(req);
    try {
      await purgeUserAccount(pool, user.id);
      // Keep a deleted identity from being re-created by a delayed webhook or session.
      if (user.clerkUserId && !isE2EAuthEnabled()) {
        await deactivateClerkUser(user.clerkUserId, 'self_service');
      }
    } catch (error) {
      console.error('Account deletion failed during purge:', error);
      return NextResponse.json(
        { error: 'We could not finish deleting your data. Nothing was removed from your sign-in. Please try again or contact support.' },
        { status: 500 }
      );
    }

    // The user row is gone; keep an anonymised trail for compliance.
    await logAudit({ action: 'account.deleted', resourceType: 'user', resourceId: user.id, ...metadata, metadata: { selfService: true } });

    let identityRemoved = false;
    if (user.clerkUserId && !isE2EAuthEnabled() && isClerkConfigured()) {
      try {
        const client = await clerkClient();
        await client.users.deleteUser(user.clerkUserId);
        identityRemoved = true;
      } catch (error) {
        console.error('Clerk identity removal failed after OXSIG purge:', error);
      }
    }

    return NextResponse.json({ deleted: true, identityRemoved, signOutRequired: true }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
