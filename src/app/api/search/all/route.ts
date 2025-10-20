import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const meiliUrl = process.env.MEILISEARCH_URL || 'http://localhost:7700';
    const apiKey = process.env.MEILISEARCH_KEY || '';

    const headers = {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
    };

    const [documents, signatures, users] = await Promise.all([
      fetch(`${meiliUrl}/indexes/documents/search`, { method: 'POST', headers, body: JSON.stringify(body) }).then(r => r.json()),
      fetch(`${meiliUrl}/indexes/signatures/search`, { method: 'POST', headers, body: JSON.stringify(body) }).then(r => r.json()),
      fetch(`${meiliUrl}/indexes/users/search`, { method: 'POST', headers, body: JSON.stringify(body) }).then(r => r.json()),
    ]);

    return NextResponse.json({ documents, signatures, users });
  } catch (error) {
    console.error('All search error:', error);
    return NextResponse.json({ error: 'Failed to search all indexes' }, { status: 500 });
  }
}