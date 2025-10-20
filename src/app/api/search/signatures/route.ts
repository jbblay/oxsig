import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const meiliUrl = process.env.MEILISEARCH_URL || 'http://localhost:7700';
    const apiKey = process.env.MEILISEARCH_KEY || '';

    const res = await fetch(`${meiliUrl}/indexes/signatures/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: 'Search failed', details: json }, { status: res.status });
    }
    return NextResponse.json(json);
  } catch (error) {
    console.error('Signatures search error:', error);
    return NextResponse.json({ error: 'Failed to search signatures' }, { status: 500 });
  }
}