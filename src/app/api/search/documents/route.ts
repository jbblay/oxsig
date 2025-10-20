/**
 * Search Documents API Route - POST /api/search/documents
 */

import { NextRequest, NextResponse } from 'next/server';

let meilisearchUrl = process.env.MEILISEARCH_URL || 'http://localhost:7700';
let meilisearchKey = process.env.MEILISEARCH_KEY || 'masterKey';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      query,
      limit = 20,
      offset = 0,
      filter,
      sort,
      facets,
      attributesToRetrieve,
      attributesToHighlight,
      attributesToCrop,
    } = body;

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    // Call Meilisearch
    const searchParams: any = {
      q: query,
      limit,
      offset,
    };

    if (filter) searchParams.filter = filter;
    if (sort) searchParams.sort = sort;
    if (facets) searchParams.facets = facets;
    if (attributesToRetrieve) searchParams.attributesToRetrieve = attributesToRetrieve;
    if (attributesToHighlight) searchParams.attributesToHighlight = attributesToHighlight;
    if (attributesToCrop) searchParams.attributesToCrop = attributesToCrop;

    const response = await fetch(`${meilisearchUrl}/indexes/documents/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${meilisearchKey}`,
      },
      body: JSON.stringify(searchParams),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Meilisearch error:', error);
      
      // Return empty results if index doesn't exist yet
      if (response.status === 404) {
        return NextResponse.json({
          hits: [],
          query,
          processingTimeMs: 0,
          limit,
          offset,
          estimatedTotalHits: 0,
        });
      }
      
      throw new Error(`Meilisearch error: ${error}`);
    }

    const data = await response.json();

    return NextResponse.json({
      hits: data.hits,
      query: data.query,
      processingTimeMs: data.processingTimeMs,
      limit: data.limit,
      offset: data.offset,
      estimatedTotalHits: data.estimatedTotalHits,
      facetDistribution: data.facetDistribution,
    });
  } catch (error) {
    console.error('Error searching documents:', error);
    return NextResponse.json(
      { error: 'Failed to search documents', details: String(error) },
      { status: 500 }
    );
  }
}
