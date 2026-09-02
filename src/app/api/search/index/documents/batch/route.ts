import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';

const MAX_DOCUMENTS = 100;

export async function POST(request: NextRequest) {
  return requireAdmin(request, async (req) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json(
        { error: 'Invalid or missing CSRF token' },
        { status: 403 }
      );
    }

    try {
      const body = await req.json().catch(() => null);
      const documents = body?.documents;

      if (
        !Array.isArray(documents) ||
        documents.length === 0 ||
        documents.length > MAX_DOCUMENTS ||
        documents.some(
          (document) =>
            !document ||
            typeof document !== 'object' ||
            typeof document.id !== 'string' ||
            typeof document.ownerId !== 'string'
        )
      ) {
        return NextResponse.json(
          { error: `Provide between 1 and ${MAX_DOCUMENTS} valid indexed documents` },
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
        body: JSON.stringify(documents),
      });

      if (!res.ok) {
        console.error('Batch indexing upstream error:', res.status);
        return NextResponse.json({ error: 'Batch indexing failed' }, { status: 502 });
      }

      const json = await res.json();
      return NextResponse.json({ taskUid: json.taskUid ?? null });
    } catch (error) {
      console.error('Batch index error:', error);
      return NextResponse.json({ error: 'Failed to index documents' }, { status: 500 });
    }
  });
}
