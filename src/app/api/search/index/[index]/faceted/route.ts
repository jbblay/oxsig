import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ index: string }> }
) {
  try {
    const { index } = await params;
    const body = await request.json();
    const meiliUrl = process.env.MEILISEARCH_URL || 'http://localhost:7700';
    const apiKey = process.env.MEILISEARCH_KEY || '';

    const res = await fetch(`${meiliUrl}/indexes/${index}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ ...body, facetsDistribution: true }),
    });

    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: 'Faceted search failed', details: json }, { status: res.status });
    }
    return NextResponse.json(json);
  } catch (error) {
    console.error('Faceted search error:', error);
    return NextResponse.json({ error: 'Failed to perform faceted search' }, { status: 500 });
  }
}