import { NextRequest, NextResponse } from 'next/server';
import { withPlatformAdmin } from '@/lib/admin/http';
import { getAdminSystemStatus } from '@/lib/admin/queries';
import { getPool } from '@/lib/db/pool';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return withPlatformAdmin(request, async () => NextResponse.json(await getAdminSystemStatus(getPool())));
}
