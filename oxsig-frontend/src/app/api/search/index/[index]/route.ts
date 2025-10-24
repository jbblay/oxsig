import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ index: string }> }
) {
  try {
    const { index } = await params;
    const meiliUrl = process.env.MEILISEARCH_URL || 'http://localhost:7700';
    const apiKey = process.env.MEILISEARCH_KEY || '';

    const res = await fetch(`${meiliUrl}/indexes/${index}/documents`, {
      method: 'DELETE',
      headers: {
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: 'Clear index failed', details: json }, { status: res.status });
    }
    return NextResponse.json({ taskUid: json.taskUid || null });
  } catch (error) {
    console.error('Clear index error:', error);
    return NextResponse.json({ error: 'Failed to clear index' }, { status: 500 });
  }
}