/**
 * Search API - Full-text search using Meilisearch
 */

import { apiClient, unwrap, type ApiResponse } from './client';

// ============================================================================
// Types
// ============================================================================

export interface SearchResult<T = any> {
  hits: T[];
  query: string;
  processingTimeMs: number;
  limit: number;
  offset: number;
  estimatedTotalHits: number;
}

export interface SearchOptions {
  query: string;
  limit?: number;
  offset?: number;
  filter?: string | string[];
  sort?: string[];
  facets?: string[];
  attributesToRetrieve?: string[];
  attributesToHighlight?: string[];
  highlightPreTag?: string;
  highlightPostTag?: string;
  attributesToCrop?: string[];
  cropLength?: number;
  cropMarker?: string;
  matchingStrategy?: 'last' | 'all';
}

export interface FacetDistribution {
  [facetName: string]: {
    [facetValue: string]: number;
  };
}

export interface SearchStats {
  numberOfDocuments: number;
  isIndexing: boolean;
  fieldDistribution: Record<string, number>;
}

// ============================================================================
// Search API
// ============================================================================

export const searchApi = {
  /**
   * Search documents
   */
  async searchDocuments(options: SearchOptions): Promise<ApiResponse<SearchResult>> {
    return apiClient.post<SearchResult>('/api/search/documents', options);
  },

  /**
   * Search signatures
   */
  async searchSignatures(options: SearchOptions): Promise<ApiResponse<SearchResult>> {
    return apiClient.post<SearchResult>('/api/search/signatures', options);
  },

  /**
   * Search users
   */
  async searchUsers(options: SearchOptions): Promise<ApiResponse<SearchResult>> {
    return apiClient.post<SearchResult>('/api/search/users', options);
  },

  /**
   * Search across all indexes
   */
  async searchAll(options: SearchOptions): Promise<ApiResponse<{ [index: string]: SearchResult }>> {
    return apiClient.post<{ [index: string]: SearchResult }>('/api/search/all', options);
  },

  /**
   * Get search suggestions/autocomplete
   */
  async suggest(
    query: string,
    index: 'documents' | 'signatures' | 'users',
    limit?: number
  ): Promise<ApiResponse<string[]>> {
    return apiClient.post<string[]>('/api/search/suggest', {
      query,
      index,
      limit,
    });
  },

  /**
   * Get faceted search results
   */
  async facetedSearch(
    index: string,
    options: SearchOptions & { facets: string[] }
  ): Promise<ApiResponse<SearchResult & { facetDistribution: FacetDistribution }>> {
    return apiClient.post<SearchResult & { facetDistribution: FacetDistribution }>(
      `/api/search/${index}/faceted`,
      options
    );
  },

  /**
   * Index a document
   */
  async indexDocument(document: any): Promise<ApiResponse<{ taskUid: number }>> {
    return apiClient.post<{ taskUid: number }>('/api/search/index/documents', document);
  },

  /**
   * Index multiple documents
   */
  async indexDocuments(documents: any[]): Promise<ApiResponse<{ taskUid: number }>> {
    return apiClient.post<{ taskUid: number }>('/api/search/index/documents/batch', {
      documents,
    });
  },

  /**
   * Delete document from index
   */
  async deleteFromIndex(
    index: string,
    documentId: string
  ): Promise<ApiResponse<{ taskUid: number }>> {
    return apiClient.delete<{ taskUid: number }>(`/api/search/index/${index}/${documentId}`);
  },

  /**
   * Clear an index
   */
  async clearIndex(index: string): Promise<ApiResponse<{ taskUid: number }>> {
    return apiClient.delete<{ taskUid: number }>(`/api/search/index/${index}`);
  },

  /**
   * Get index stats
   */
  async getIndexStats(index: string): Promise<ApiResponse<SearchStats>> {
    return apiClient.get<SearchStats>(`/api/search/index/${index}/stats`);
  },

  /**
   * Get search task status
   */
  async getTaskStatus(taskUid: number): Promise<ApiResponse<any>> {
    return apiClient.get(`/api/search/tasks/${taskUid}`);
  },
};

// ============================================================================
// Convenience Functions with unwrap
// ============================================================================

export const search = {
  documents: (options: SearchOptions) => unwrap(searchApi.searchDocuments(options)),
  signatures: (options: SearchOptions) => unwrap(searchApi.searchSignatures(options)),
  users: (options: SearchOptions) => unwrap(searchApi.searchUsers(options)),
  all: (options: SearchOptions) => unwrap(searchApi.searchAll(options)),
  suggest: (query: string, index: 'documents' | 'signatures' | 'users', limit?: number) =>
    unwrap(searchApi.suggest(query, index, limit)),
  faceted: (index: string, options: SearchOptions & { facets: string[] }) =>
    unwrap(searchApi.facetedSearch(index, options)),
  indexDocument: (document: any) => unwrap(searchApi.indexDocument(document)),
  indexDocuments: (documents: any[]) => unwrap(searchApi.indexDocuments(documents)),
  deleteFromIndex: (index: string, documentId: string) =>
    unwrap(searchApi.deleteFromIndex(index, documentId)),
  clearIndex: (index: string) => unwrap(searchApi.clearIndex(index)),
  getIndexStats: (index: string) => unwrap(searchApi.getIndexStats(index)),
  getTaskStatus: (taskUid: number) => unwrap(searchApi.getTaskStatus(taskUid)),
};
