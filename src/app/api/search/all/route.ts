import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    try {
      const body = await req.json().catch(() => ({}));
      const query = typeof body?.query === 'string'
        ? body.query
        : typeof body?.q === 'string'
          ? body.q
          : '';
      const rawLimit = Number(body?.limit || 10);
      const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(Math.trunc(rawLimit), 1), 25)
        : 10;

      const meiliUrl = process.env.MEILISEARCH_URL || process.env.MEILISEARCH_HOST;
      const apiKey = process.env.MEILISEARCH_KEY || process.env.MEILISEARCH_API_KEY || '';

      if (!meiliUrl) {
        return NextResponse.json({ error: 'Search is not configured' }, { status: 503 });
      }

      const headers = {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      };

      const [documentsResponse, usersResponse] = await Promise.all([
        fetch(`${meiliUrl}/indexes/documents/search`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            q: query.slice(0, 500),
            limit,
            filter: `ownerId = ${JSON.stringify(user.id)}`,
          }),
        }),
        fetch(`${meiliUrl}/indexes/users/search`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            q: query.slice(0, 500),
            limit,
            attributesToRetrieve: ['id', 'name', 'displayName', 'publicKey'],
          }),
        }),
      ]);

      if (!documentsResponse.ok || !usersResponse.ok) {
        console.error('Cross-index search upstream error:', {
          documents: documentsResponse.status,
          users: usersResponse.status,
        });
        return NextResponse.json({ error: 'Search failed' }, { status: 502 });
      }

      const [documents, users] = await Promise.all([
        documentsResponse.json(),
        usersResponse.json(),
      ]);

      return NextResponse.json({ documents, users });
    } catch (error) {
      console.error('All search error:', error);
      return NextResponse.json({ error: 'Failed to search all indexes' }, { status: 500 });
    }
  });
}
