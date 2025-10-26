import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ index: string; documentId: string }> }
) {
  try {
    const { index, documentId } = await params;
    const meiliUrl = process.env.MEILISEARCH_URL || 'http://localhost:7700';
    const apiKey = process.env.MEILISEARCH_KEY || '';

    const res = await fetch(`${meiliUrl}/indexes/${index}/documents/${documentId}`, {
      method: 'DELETE',
      headers: {
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
    });

    if (!res.ok) {
      const details = await res.text();
      return NextResponse.json({ error: 'Delete from index failed', details }, { status: res.status });
    }
    return NextResponse.json({ taskUid: (await res.json()).taskUid || null });
  } catch (error) {
    console.error('Delete from index error:', error);
    return NextResponse.json({ error: 'Failed to delete from index' }, { status: 500 });
  }
}