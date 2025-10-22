/**
 * Meilisearch Integration
 * Document indexing and full-text search
 */

interface MeilisearchConfig {
  host: string;
  apiKey?: string;
}

// Meilisearch configuration
const config: MeilisearchConfig = {
  host: process.env.MEILISEARCH_HOST || 'http://localhost:7700',
  apiKey: process.env.MEILISEARCH_API_KEY || '',
};

export interface IndexedDocument {
  id: string;
  title: string;
  content: string;
  ownerId: string;
  tags: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResult<T> {
  hits: T[];
  query: string;
  processingTimeMs: number;
  limit: number;
  offset: number;
  estimatedTotalHits: number;
}

/**
 * Index a document in Meilisearch
 */
export async function indexDocument(document: IndexedDocument): Promise<void> {
  try {
    const url = `${config.host}/indexes/documents/documents`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify([document]),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to index document: ${error}`);
    }
  } catch (error) {
    console.error('Meilisearch indexing error:', error);
    // Don't throw - indexing failures shouldn't break the API
  }
}

/**
 * Update a document in the index
 */
export async function updateDocument(document: Partial<IndexedDocument> & { id: string }): Promise<void> {
  try {
    const url = `${config.host}/indexes/documents/documents`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify([document]),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to update document: ${error}`);
    }
  } catch (error) {
    console.error('Meilisearch update error:', error);
  }
}

/**
 * Delete a document from the index
 */
export async function deleteDocument(documentId: string): Promise<void> {
  try {
    const url = `${config.host}/indexes/documents/documents/${documentId}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to delete document: ${error}`);
    }
  } catch (error) {
    console.error('Meilisearch deletion error:', error);
  }
}

/**
 * Search documents
 */
export async function searchDocuments(
  query: string,
  options?: {
    limit?: number;
    offset?: number;
    filter?: string;
    sort?: string[];
  }
): Promise<SearchResult<IndexedDocument>> {
  try {
    const url = `${config.host}/indexes/documents/search`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        q: query,
        limit: options?.limit || 20,
        offset: options?.offset || 0,
        filter: options?.filter,
        sort: options?.sort,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Search failed: ${error}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Meilisearch search error:', error);
    // Return empty results on error
    return {
      hits: [],
      query,
      processingTimeMs: 0,
      limit: options?.limit || 20,
      offset: options?.offset || 0,
      estimatedTotalHits: 0,
    };
  }
}

/**
 * Batch index multiple documents
 */
export async function batchIndexDocuments(documents: IndexedDocument[]): Promise<void> {
  try {
    const url = `${config.host}/indexes/documents/documents`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify(documents),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to batch index documents: ${error}`);
    }
  } catch (error) {
    console.error('Meilisearch batch indexing error:', error);
  }
}

/**
 * Create or update index settings
 */
export async function configureIndex(): Promise<void> {
  try {
    // Create index if it doesn't exist
    await fetch(`${config.host}/indexes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        uid: 'documents',
        primaryKey: 'id',
      }),
    });

    // Configure searchable attributes
    await fetch(`${config.host}/indexes/documents/settings/searchable-attributes`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify(['title', 'content', 'tags']),
    });

    // Configure filterable attributes
    await fetch(`${config.host}/indexes/documents/settings/filterable-attributes`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify(['ownerId', 'status', 'tags']),
    });

    // Configure sortable attributes
    await fetch(`${config.host}/indexes/documents/settings/sortable-attributes`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify(['createdAt', 'updatedAt']),
    });

    console.log('✅ Meilisearch index configured');
  } catch (error) {
    console.error('Meilisearch configuration error:', error);
  }
}
