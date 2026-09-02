import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/middleware';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskUid: string }> }
) {
  return requireAdmin(request, async () => {
    try {
      const { taskUid } = await params;
      if (!/^\d+$/.test(taskUid)) {
        return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
      }

      const meiliUrl = process.env.MEILISEARCH_URL || process.env.MEILISEARCH_HOST;
      const apiKey = process.env.MEILISEARCH_KEY || process.env.MEILISEARCH_API_KEY || '';
      if (!meiliUrl) {
        return NextResponse.json({ error: 'Search is not configured' }, { status: 503 });
      }

      const res = await fetch(`${meiliUrl}/tasks/${taskUid}`, {
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
      });

      if (!res.ok) {
        console.error('Task status upstream error:', res.status);
        return NextResponse.json({ error: 'Get task status failed' }, { status: 502 });
      }

      return NextResponse.json(await res.json());
    } catch (error) {
      console.error('Task status error:', error);
      return NextResponse.json({ error: 'Failed to get task status' }, { status: 500 });
    }
  });
}
