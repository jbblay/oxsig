import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/middleware';

const ALLOWED_INDEXES = new Set(['documents', 'users']);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ index: string }> }
) {
  return requireAdmin(request, async () => {
    try {
      const { index } = await params;
      if (!ALLOWED_INDEXES.has(index)) {
        return NextResponse.json({ error: 'Unsupported search index' }, { status: 400 });
      }

      const meiliUrl = process.env.MEILISEARCH_URL || process.env.MEILISEARCH_HOST;
      const apiKey = process.env.MEILISEARCH_KEY || process.env.MEILISEARCH_API_KEY || '';
      if (!meiliUrl) {
        return NextResponse.json({ error: 'Search is not configured' }, { status: 503 });
      }

      const res = await fetch(`${meiliUrl}/indexes/${index}/stats`, {
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
      });

      if (!res.ok) {
        console.error('Index stats upstream error:', res.status);
        return NextResponse.json({ error: 'Get index stats failed' }, { status: 502 });
      }

      return NextResponse.json(await res.json());
    } catch (error) {
      console.error('Index stats error:', error);
      return NextResponse.json({ error: 'Failed to get index stats' }, { status: 500 });
    }
  });
}
