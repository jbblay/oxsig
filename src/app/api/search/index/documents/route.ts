import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const doc = await request.json();
    const meiliUrl = process.env.MEILISEARCH_URL || 'http://localhost:7700';
    const apiKey = process.env.MEILISEARCH_KEY || '';

    const res = await fetch(`${meiliUrl}/indexes/documents/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(Array.isArray(doc) ? doc : [doc]),
    });

    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: 'Indexing failed', details: json }, { status: res.status });
    }
    return NextResponse.json({ taskUid: json.taskUid });
  } catch (error) {
    console.error('Index document error:', error);
    return NextResponse.json({ error: 'Failed to index document' }, { status: 500 });
  }
}