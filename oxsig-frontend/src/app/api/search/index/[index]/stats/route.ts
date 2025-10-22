import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: { index: string } }
) {
  try {
    const meiliUrl = process.env.MEILISEARCH_URL || 'http://localhost:7700';
    const apiKey = process.env.MEILISEARCH_KEY || '';

    const res = await fetch(`${meiliUrl}/indexes/${params.index}/stats`, {
      method: 'GET',
      headers: {
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
    });

    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: 'Get index stats failed', details: json }, { status: res.status });
    }
    return NextResponse.json(json);
  } catch (error) {
    console.error('Index stats error:', error);
    return NextResponse.json({ error: 'Failed to get index stats' }, { status: 500 });
  }
}