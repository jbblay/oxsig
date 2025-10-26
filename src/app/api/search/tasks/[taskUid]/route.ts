import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskUid: string }> }
) {
  try {
    const { taskUid } = await params;
    const meiliUrl = process.env.MEILISEARCH_URL || 'http://localhost:7700';
    const apiKey = process.env.MEILISEARCH_KEY || '';

    const res = await fetch(`${meiliUrl}/tasks/${taskUid}`, {
      method: 'GET',
      headers: {
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
    });

    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: 'Get task status failed', details: json }, { status: res.status });
    }
    return NextResponse.json(json);
  } catch (error) {
    console.error('Task status error:', error);
    return NextResponse.json({ error: 'Failed to get task status' }, { status: 500 });
  }
}