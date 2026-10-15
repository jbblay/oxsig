import { NextRequest, NextResponse } from 'next/server';
import { withPlatformAdmin } from '@/lib/admin/http';
import { getPool } from '@/lib/db/pool';
import { listMentorsForAdmin } from '@/lib/mentorship/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return withPlatformAdmin(request, async () => NextResponse.json({ mentors: await listMentorsForAdmin(getPool()) }));
}
