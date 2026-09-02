import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';

const ALLOWED_INDEXES = new Set(['documents', 'users']);

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ index: string }> }
) {
  return requireAdmin(request, async (req) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json(
        { error: 'Invalid or missing CSRF token' },
        { status: 403 }
      );
    }

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

      const res = await fetch(`${meiliUrl}/indexes/${index}/documents`, {
        method: 'DELETE',
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
      });

      if (!res.ok) {
        console.error('Clear index upstream error:', res.status);
        return NextResponse.json({ error: 'Clear index failed' }, { status: 502 });
      }

      const json = await res.json().catch(() => ({}));
      return NextResponse.json({ taskUid: json.taskUid ?? null });
    } catch (error) {
      console.error('Clear index error:', error);
      return NextResponse.json({ error: 'Failed to clear index' }, { status: 500 });
    }
  });
}
