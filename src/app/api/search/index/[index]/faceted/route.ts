import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';

const ALLOWED_INDEXES = new Set(['documents', 'users']);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ index: string }> }
) {
  return requireAuth(request, async (req, user) => {
    try {
      const { index } = await params;
      if (!ALLOWED_INDEXES.has(index)) {
        return NextResponse.json({ error: 'Unsupported search index' }, { status: 400 });
      }

      const body = await req.json().catch(() => ({}));
      const query = typeof body?.query === 'string'
        ? body.query
        : typeof body?.q === 'string'
          ? body.q
          : '';
      const rawLimit = Number(body?.limit || 20);
      const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(Math.trunc(rawLimit), 1), 50)
        : 20;
      const facets = Array.isArray(body?.facets)
        ? body.facets.filter((value: unknown): value is string => typeof value === 'string').slice(0, 10)
        : [];

      const meiliUrl = process.env.MEILISEARCH_URL || process.env.MEILISEARCH_HOST;
      const apiKey = process.env.MEILISEARCH_KEY || process.env.MEILISEARCH_API_KEY || '';
      if (!meiliUrl) {
        return NextResponse.json({ error: 'Search is not configured' }, { status: 503 });
      }

      const res = await fetch(`${meiliUrl}/indexes/${index}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          q: query.slice(0, 500),
          limit,
          facets,
          ...(index === 'documents'
            ? { filter: `ownerId = ${JSON.stringify(user.id)}` }
            : { attributesToRetrieve: ['id', 'name', 'displayName', 'publicKey'] }),
        }),
      });

      if (!res.ok) {
        console.error('Faceted search upstream error:', res.status);
        return NextResponse.json({ error: 'Faceted search failed' }, { status: 502 });
      }

      return NextResponse.json(await res.json());
    } catch (error) {
      console.error('Faceted search error:', error);
      return NextResponse.json({ error: 'Failed to perform faceted search' }, { status: 500 });
    }
  });
}
