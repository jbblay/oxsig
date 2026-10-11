import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPlatformAdmin } from '@/lib/admin/http';
import { listAdminUsers } from '@/lib/admin/queries';
import { getPool } from '@/lib/db/pool';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  filter: z.enum(['all', 'active', 'suspended', 'admins', 'new', 'dormant']).default('all'),
  sort: z.enum(['newest', 'oldest', 'recently-active', 'name']).default('newest'),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

export async function GET(request: NextRequest) {
  return withPlatformAdmin(request, async (req) => {
    const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid user query' }, { status: 400 });
    return NextResponse.json(await listAdminUsers(getPool(), { ...parsed.data, q: parsed.data.q || undefined }));
  });
}
