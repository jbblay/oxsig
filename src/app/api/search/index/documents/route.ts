import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';

export async function POST(request: NextRequest) {
  return requireAdmin(request, async (req) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json(
        { error: 'Invalid or missing CSRF token' },
        { status: 403 }
      );
    }

    try {
      const document = await req.json().catch(() => null);
      if (
        !document ||
        typeof document !== 'object' ||
        Array.isArray(document) ||
        typeof document.id !== 'string' ||
        typeof document.ownerId !== 'string'
      ) {
        return NextResponse.json(
          { error: 'A valid indexed document with id and ownerId is required' },
          { status: 400 }
        );
      }

      const meiliUrl = process.env.MEILISEARCH_URL || process.env.MEILISEARCH_HOST;
      const apiKey = process.env.MEILISEARCH_KEY || process.env.MEILISEARCH_API_KEY || '';
      if (!meiliUrl) {
        return NextResponse.json({ error: 'Search is not configured' }, { status: 503 });
      }

      const res = await fetch(`${meiliUrl}/indexes/documents/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify([document]),
      });

      if (!res.ok) {
        console.error('Index document upstream error:', res.status);
        return NextResponse.json({ error: 'Indexing failed' }, { status: 502 });
      }

      const json = await res.json();
      return NextResponse.json({ taskUid: json.taskUid ?? null });
    } catch (error) {
      console.error('Index document error:', error);
      return NextResponse.json({ error: 'Failed to index document' }, { status: 500 });
    }
  });
}
