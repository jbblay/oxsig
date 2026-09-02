import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';

const ALLOWED_INDEXES = new Set(['documents', 'users']);

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    try {
      const body = await req.json().catch(() => ({}));
      const query = typeof body?.query === 'string' ? body.query.slice(0, 500) : '';
      const index = typeof body?.index === 'string' ? body.index : '';
      const rawLimit = Number(body?.limit || 5);
      const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(Math.trunc(rawLimit), 1), 20)
        : 5;

      if (!ALLOWED_INDEXES.has(index)) {
        return NextResponse.json({ error: 'Unsupported search index' }, { status: 400 });
      }

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
          q: query,
          limit,
          attributesToRetrieve:
            index === 'documents'
              ? ['title', 'id']
              : ['name', 'displayName', 'id'],
          ...(index === 'documents'
            ? { filter: `ownerId = ${JSON.stringify(user.id)}` }
            : {}),
        }),
      });

      if (!res.ok) {
        console.error('Suggest upstream error:', res.status);
        return NextResponse.json({ error: 'Suggestion search failed' }, { status: 502 });
      }

      const json = await res.json();
      const suggestions: string[] = (json.hits || [])
        .map((hit: Record<string, unknown>) =>
          hit.title || hit.displayName || hit.name || hit.id
        )
        .filter((value: unknown): value is string => typeof value === 'string');

      return NextResponse.json(suggestions);
    } catch (error) {
      console.error('Suggest error:', error);
      return NextResponse.json({ error: 'Failed to get suggestions' }, { status: 500 });
    }
  });
}
