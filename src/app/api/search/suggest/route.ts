import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { query, index, limit = 5 } = await request.json();
    const meiliUrl = process.env.MEILISEARCH_URL || 'http://localhost:7700';
    const apiKey = process.env.MEILISEARCH_KEY || '';

    const res = await fetch(`${meiliUrl}/indexes/${index}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        q: query,
        limit,
        attributesToRetrieve: ['title', 'name', 'id'],
      }),
    });

    const json = await res.json();
    const suggestions: string[] = (json.hits || [])
      .map((h: any) => h.title || h.name || h.id)
      .filter(Boolean);

    return NextResponse.json(suggestions);
  } catch (error) {
    console.error('Suggest error:', error);
    return NextResponse.json({ error: 'Failed to get suggestions' }, { status: 500 });
  }
}