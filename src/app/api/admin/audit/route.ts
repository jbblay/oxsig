import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { UUID_PATTERN, withPlatformAdmin } from '@/lib/admin/http';
import { listAdminAudit } from '@/lib/admin/queries';
import { getPool } from '@/lib/db/pool';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  action: z.string().trim().regex(/^[a-z0-9_.]*$/i).max(80).optional(),
  userId: z.string().regex(UUID_PATTERN).optional(),
  before: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(request: NextRequest) {
  return withPlatformAdmin(request, async (req) => {
    const params = Object.fromEntries([...req.nextUrl.searchParams].filter(([, value]) => value !== ''));
    const parsed = querySchema.safeParse(params);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid audit query' }, { status: 400 });
    return NextResponse.json(await listAdminAudit(getPool(), parsed.data));
  });
}
