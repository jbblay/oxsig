/**
 * Search API - Full-text search using Meilisearch
 */

import { apiClient, unwrap, type ApiResponse } from './client';
import { withClientCsrf } from '@/lib/security/csrf-client';

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

export const searchApi = {
  async searchDocuments(options: SearchOptions): Promise<ApiResponse<SearchResult>> {
    return apiClient.post<SearchResult>('/api/search/documents', options);
  },

  async searchUsers(options: SearchOptions): Promise<ApiResponse<SearchResult>> {
    return apiClient.post<SearchResult>('/api/search/users', options);
  },

  async searchAll(options: SearchOptions): Promise<ApiResponse<{ [index: string]: SearchResult }>> {
    return apiClient.post<{ [index: string]: SearchResult }>('/api/search/all', options);
  },

  async suggest(
    query: string,
    index: 'documents' | 'users',
    limit?: number
  ): Promise<ApiResponse<string[]>> {
    return apiClient.post<string[]>('/api/search/suggest', { query, index, limit });
  },

  async facetedSearch(
    index: 'documents' | 'users',
    options: SearchOptions & { facets: string[] }
  ): Promise<ApiResponse<SearchResult & { facetDistribution: FacetDistribution }>> {
    return apiClient.post<SearchResult & { facetDistribution: FacetDistribution }>(
      `/api/search/index/${index}/faceted`,
      options
    );
  },

  // Administrative index-management methods. Server-side authorization is
  // authoritative; these CSRF headers allow a legitimate admin UI to call them.
  async indexDocument(document: any): Promise<ApiResponse<{ taskUid: number }>> {
    return apiClient.post<{ taskUid: number }>(
      '/api/search/index/documents',
      document,
      { headers: await withClientCsrf() }
    );
  },

  async indexDocuments(documents: any[]): Promise<ApiResponse<{ taskUid: number }>> {
    return apiClient.post<{ taskUid: number }>(
      '/api/search/index/documents/batch',
      { documents },
      { headers: await withClientCsrf() }
    );
  },

  async deleteFromIndex(
    index: 'documents' | 'users',
    documentId: string
  ): Promise<ApiResponse<{ taskUid: number }>> {
    return apiClient.delete<{ taskUid: number }>(
      `/api/search/index/${index}/${encodeURIComponent(documentId)}`,
      { headers: await withClientCsrf() }
    );
  },

  async clearIndex(index: 'documents' | 'users'): Promise<ApiResponse<{ taskUid: number }>> {
    return apiClient.delete<{ taskUid: number }>(`/api/search/index/${index}`, {
      headers: await withClientCsrf(),
    });
  },

  async getIndexStats(index: 'documents' | 'users'): Promise<ApiResponse<SearchStats>> {
    return apiClient.get<SearchStats>(`/api/search/index/${index}/stats`);
  },

  async getTaskStatus(taskUid: number): Promise<ApiResponse<any>> {
    return apiClient.get(`/api/search/tasks/${taskUid}`);
  },
};

export const search = {
  documents: (options: SearchOptions) => unwrap(searchApi.searchDocuments(options)),
  users: (options: SearchOptions) => unwrap(searchApi.searchUsers(options)),
  all: (options: SearchOptions) => unwrap(searchApi.searchAll(options)),
  suggest: (query: string, index: 'documents' | 'users', limit?: number) =>
    unwrap(searchApi.suggest(query, index, limit)),
  faceted: (index: 'documents' | 'users', options: SearchOptions & { facets: string[] }) =>
    unwrap(searchApi.facetedSearch(index, options)),
  indexDocument: (document: any) => unwrap(searchApi.indexDocument(document)),
  indexDocuments: (documents: any[]) => unwrap(searchApi.indexDocuments(documents)),
  deleteFromIndex: (index: 'documents' | 'users', documentId: string) =>
    unwrap(searchApi.deleteFromIndex(index, documentId)),
  clearIndex: (index: 'documents' | 'users') => unwrap(searchApi.clearIndex(index)),
  getIndexStats: (index: 'documents' | 'users') => unwrap(searchApi.getIndexStats(index)),
  getTaskStatus: (taskUid: number) => unwrap(searchApi.getTaskStatus(taskUid)),
};
