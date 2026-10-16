import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { UUID_PATTERN, withPlatformAdmin } from '@/lib/admin/http';
import { getRequestMetadata, logAudit } from '@/lib/audit/logger';
import { manageMentor } from '@/lib/mentorship/admin';
import { mentorshipErrorResponse } from '@/lib/mentorship/http';
import { MENTOR_SPECIALIZATION_IDS } from '@/lib/mentorship/specializations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

const reason = z.string().trim().min(5).max(500);
const commandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('suspend'), reason }).strict(),
  z.object({ action: z.literal('reinstate'), reason }).strict(),
  z.object({ action: z.literal('revoke'), reason }).strict(),
  z.object({ action: z.literal('set_tier'), tier: z.enum(['approved_peer_mentor', 'verified_mentor', 'senior_mentor']), reason }).strict(),
  z.object({ action: z.literal('grant_qualification'), specializationId: z.enum(MENTOR_SPECIALIZATION_IDS), reason }).strict(),
  z.object({ action: z.literal('revoke_qualification'), qualificationId: z.string().uuid(), reason }).strict(),
]);

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  return withPlatformAdmin(
    request,
    async (req, admin) => {
      const { id } = await params;
      if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid mentor id' }, { status: 400 });
      const parsed = commandSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid mentor action' }, { status: 400 });
      try {
        const result = await manageMentor({ adminId: admin.id, mentorId: id, command: parsed.data });
        await logAudit({
          userId: admin.id,
          action: `admin.mentor.${parsed.data.action}`,
          resourceType: 'mentor_profile',
          resourceId: id,
          metadata: { ...parsed.data },
          ...getRequestMetadata(req),
        });
        return NextResponse.json({ ok: true, ...result });
      } catch (error) {
        return mentorshipErrorResponse(error, 'Mentor management');
      }
    },
    { mutation: true }
  );
}
