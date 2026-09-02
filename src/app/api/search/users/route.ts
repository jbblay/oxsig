import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req) => {
    try {
      const body = await req.json().catch(() => ({}));
      const query = typeof body?.query === 'string'
        ? body.query
        : typeof body?.q === 'string'
          ? body.q
          : '';
      const rawLimit = Number(body?.limit || 20);
      const rawOffset = Number(body?.offset || 0);
      const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(Math.trunc(rawLimit), 1), 50)
        : 20;
      const offset = Number.isFinite(rawOffset)
        ? Math.min(Math.max(Math.trunc(rawOffset), 0), 10000)
        : 0;

      const meiliUrl = process.env.MEILISEARCH_URL || process.env.MEILISEARCH_HOST;
      const apiKey = process.env.MEILISEARCH_KEY || process.env.MEILISEARCH_API_KEY || '';

      if (!meiliUrl) {
        return NextResponse.json({ error: 'Search is not configured' }, { status: 503 });
      }

      const res = await fetch(`${meiliUrl}/indexes/users/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          q: query.slice(0, 500),
          limit,
          offset,
          attributesToRetrieve: ['id', 'name', 'displayName', 'publicKey'],
        }),
      });

      if (!res.ok) {
        console.error('Users search upstream error:', res.status);
        return NextResponse.json({ error: 'Search failed' }, { status: 502 });
      }

      return NextResponse.json(await res.json());
    } catch (error) {
      console.error('Users search error:', error);
      return NextResponse.json({ error: 'Failed to search users' }, { status: 500 });
    }
  });
}
