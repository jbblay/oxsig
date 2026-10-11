import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { z } from 'zod';
import { countOtherPlatformAdmins, purgeUserAccount, terminateUserCloudResources } from '@/lib/account/lifecycle';
import { UUID_PATTERN, withPlatformAdmin } from '@/lib/admin/http';
import { getAdminUserDetail } from '@/lib/admin/queries';
import { getRequestMetadata, logAudit } from '@/lib/audit/logger';
import { isClerkConfigured } from '@/lib/auth/clerk-config';
import { isE2EAuthEnabled } from '@/lib/auth/e2e-auth';
import { isFounderIdentity } from '@/lib/auth/platform-role';
import { getPool } from '@/lib/db/pool';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('suspend'), reason: z.string().trim().min(3).max(500), terminateResources: z.boolean().optional() }).strict(),
  z.object({ action: z.literal('restore') }).strict(),
  z.object({ action: z.literal('set-role'), role: z.enum(['user', 'admin']) }).strict(),
  z.object({ action: z.literal('terminate-resources') }).strict(),
]);

const deleteSchema = z.object({ confirmEmail: z.string().trim().min(3).max(255) }).strict();

async function loadTarget(id: string) {
  const result = await getPool().query(
    `SELECT id, email, email_verified, role, is_active, suspended_at, clerk_user_id FROM users WHERE id=$1 LIMIT 1`,
    [id]
  );
  return result.rows[0] as
    | { id: string; email: string | null; email_verified: boolean; role: string; is_active: boolean; suspended_at: string | null; clerk_user_id: string | null }
    | undefined;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  return withPlatformAdmin(request, async () => {
    const { id } = await params;
    if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    const detail = await getAdminUserDetail(getPool(), id);
    if (!detail) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json(detail);
  });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  return withPlatformAdmin(request, async (req, admin) => {
    const { id } = await params;
    if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    const parsed = actionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid admin action' }, { status: 400 });

    const target = await loadTarget(id);
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const body = parsed.data;
    const pool = getPool();
    const self = target.id === admin.id;
    const founder = isFounderIdentity(target);
    const audit = { userId: admin.id, resourceType: 'user', resourceId: target.id, ...getRequestMetadata(req) };

    if (body.action === 'suspend') {
      if (self) return NextResponse.json({ error: 'You cannot suspend your own account.' }, { status: 409 });
      if (founder) return NextResponse.json({ error: 'Founder accounts cannot be suspended.' }, { status: 409 });
      await pool.query(
        `UPDATE users SET suspended_at=NOW(), suspended_reason=$2, suspended_by=$3, updated_at=NOW() WHERE id=$1`,
        [target.id, body.reason, admin.id]
      );
      const termination = body.terminateResources ? await terminateUserCloudResources(pool, target.id) : null;
      await logAudit({ ...audit, action: 'admin.user.suspend', metadata: { reason: body.reason, termination } });
      return NextResponse.json({ ok: true, termination });
    }

    if (body.action === 'restore') {
      await pool.query(
        `UPDATE users SET suspended_at=NULL, suspended_reason=NULL, suspended_by=NULL, updated_at=NOW() WHERE id=$1`,
        [target.id]
      );
      await logAudit({ ...audit, action: 'admin.user.restore' });
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'set-role') {
      if (self && body.role !== 'admin') return NextResponse.json({ error: 'You cannot remove your own admin access.' }, { status: 409 });
      if (founder && body.role !== 'admin') return NextResponse.json({ error: 'Founder access is managed by OXSIG_FOUNDER_EMAILS.' }, { status: 409 });
      if (body.role === 'user' && target.role === 'admin' && (await countOtherPlatformAdmins(pool, target.id)) === 0) {
        return NextResponse.json({ error: 'At least one platform admin must remain.' }, { status: 409 });
      }
      await pool.query(`UPDATE users SET role=$2, updated_at=NOW() WHERE id=$1`, [target.id, body.role]);
      await logAudit({ ...audit, action: 'admin.user.role', metadata: { from: target.role, to: body.role } });
      return NextResponse.json({ ok: true });
    }

    const termination = await terminateUserCloudResources(pool, target.id);
    await logAudit({ ...audit, action: 'admin.user.terminate_resources', metadata: { termination } });
    return NextResponse.json({ ok: true, termination });
  }, { mutation: true });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  return withPlatformAdmin(request, async (req, admin) => {
    const { id } = await params;
    if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Type the account email to confirm deletion.' }, { status: 400 });

    const target = await loadTarget(id);
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (target.id === admin.id) return NextResponse.json({ error: 'Delete your own account from Account settings.' }, { status: 409 });
    if (isFounderIdentity(target)) return NextResponse.json({ error: 'Founder accounts cannot be deleted from the console.' }, { status: 409 });
    if ((target.email || '').toLowerCase() !== parsed.data.confirmEmail.toLowerCase()) {
      return NextResponse.json({ error: 'The confirmation email does not match this account.' }, { status: 400 });
    }

    await purgeUserAccount(getPool(), target.id);

    let identityRemoved = false;
    if (target.clerk_user_id && !isE2EAuthEnabled() && isClerkConfigured()) {
      try {
        await (await clerkClient()).users.deleteUser(target.clerk_user_id);
        identityRemoved = true;
      } catch (error) {
        console.error('Clerk identity removal failed after admin purge:', error);
      }
    }

    await logAudit({
      userId: admin.id,
      action: 'admin.user.delete',
      resourceType: 'user',
      resourceId: target.id,
      ...getRequestMetadata(req),
      // No personal data is retained about the deleted account; the id is enough to correlate.
      metadata: { identityRemoved },
    });
    return NextResponse.json({ ok: true, identityRemoved });
  }, { mutation: true });
}
