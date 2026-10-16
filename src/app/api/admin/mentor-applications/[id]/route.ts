import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { UUID_PATTERN, withPlatformAdmin } from '@/lib/admin/http';
import { getRequestMetadata, logAudit } from '@/lib/audit/logger';
import { getPool } from '@/lib/db/pool';
import { decideMentorApplication, getMentorApplicationForReview } from '@/lib/mentorship/admin';
import { mentorshipErrorResponse } from '@/lib/mentorship/http';
import { MENTOR_SPECIALIZATION_IDS } from '@/lib/mentorship/specializations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

const reviewerNote = z.string().trim().max(2000).optional();
const decisionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start_review'), reviewerNote }).strict(),
  z.object({ action: z.literal('request_changes'), note: z.string().trim().min(10).max(1000), reviewerNote }).strict(),
  z.object({ action: z.literal('reject'), note: z.string().trim().min(10).max(1000), reviewerNote }).strict(),
  z
    .object({
      action: z.literal('approve'),
      tier: z.enum(['approved_peer_mentor', 'verified_mentor', 'senior_mentor']),
      specializationIds: z.array(z.enum(MENTOR_SPECIALIZATION_IDS)).min(1).max(6),
      verifiedCredentialIndexes: z.array(z.number().int().min(0).max(9)).max(10).default([]),
      note: z.string().trim().max(1000).optional(),
      reviewerNote,
    })
    .strict(),
]);

export async function GET(request: NextRequest, { params }: RouteContext) {
  return withPlatformAdmin(request, async () => {
    const { id } = await params;
    if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid application id' }, { status: 400 });
    const detail = await getMentorApplicationForReview(getPool(), id);
    if (!detail) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    return NextResponse.json(detail);
  });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  return withPlatformAdmin(
    request,
    async (req, admin) => {
      const { id } = await params;
      if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid application id' }, { status: 400 });
      const parsed = decisionSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid review decision' }, { status: 400 });
      }
      try {
        const outcome = await decideMentorApplication({ adminId: admin.id, applicationId: id, decision: parsed.data });
        await logAudit({
          userId: admin.id,
          action: `admin.mentor.application.${parsed.data.action}`,
          resourceType: 'mentor_application',
          resourceId: id,
          metadata: {
            applicantId: outcome.applicantId,
            from: outcome.from,
            to: outcome.to,
            ...(parsed.data.action === 'approve'
              ? { tier: parsed.data.tier, specializations: parsed.data.specializationIds, verifiedCredentials: parsed.data.verifiedCredentialIndexes.length }
              : {}),
          },
          ...getRequestMetadata(req),
        });
        return NextResponse.json({ application: outcome.application });
      } catch (error) {
        return mentorshipErrorResponse(error, 'Mentor application review');
      }
    },
    { mutation: true }
  );
}
