import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPlatformAdmin } from '@/lib/admin/http';
import { getPool } from '@/lib/db/pool';
import { listMentorApplicationsForReview } from '@/lib/mentorship/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const statusSchema = z
  .enum(['open', 'all', 'submitted', 'under_review', 'changes_requested', 'approved', 'rejected', 'withdrawn'])
  .default('open');

export async function GET(request: NextRequest) {
  return withPlatformAdmin(request, async (req) => {
    const status = statusSchema.safeParse(req.nextUrl.searchParams.get('status') ?? undefined);
    if (!status.success) return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 });
    return NextResponse.json(await listMentorApplicationsForReview(getPool(), { status: status.data }));
  });
}
