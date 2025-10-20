/**
 * Document API - Type-safe document management endpoints
 */

import { apiClient, unwrap, type ApiResponse, type PaginatedResponse } from './client';

// ============================================================================
// Types
// ============================================================================

export interface Document {
  id: string;
  title: string;
  content: string;
  contentType: 'text' | 'html' | 'markdown' | 'pdf';
  ownerId: string;
  encrypted: boolean;
  encryptionKey?: string;
  fileUrl?: string;
  fileSize?: number;
  mimeType?: string;
  metadata: Record<string, unknown>;
  tags: string[];
  status: 'draft' | 'published' | 'archived';
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface CreateDocumentInput {
  title: string;
  content?: string;
  contentType?: Document['contentType'];
  encrypted?: boolean;
  metadata?: Record<string, unknown>;
  tags?: string[];
  status?: Document['status'];
}

export interface UpdateDocumentInput {
  title?: string;
  content?: string;
  encrypted?: boolean;
  metadata?: Record<string, unknown>;
  tags?: string[];
  status?: Document['status'];
}

export interface DocumentSearchOptions {
  query?: string;
  tags?: string[];
  status?: Document['status'];
  encrypted?: boolean;
  ownerId?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'title';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  version: number;
  content: string;
  metadata: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
}

export interface DocumentShare {
  id: string;
  documentId: string;
  userId: string;
  permission: 'read' | 'write' | 'admin';
  expiresAt?: string;
  createdAt: string;
}

// ============================================================================
// Document API
// ============================================================================

export const documentApi = {
  /**
   * Create a new document
   */
  async create(input: CreateDocumentInput): Promise<ApiResponse<Document>> {
    return apiClient.post<Document>('/api/documents', input);
  },

  /**
   * Get a document by ID
   */
  async get(id: string): Promise<ApiResponse<Document>> {
    return apiClient.get<Document>(`/api/documents/${id}`);
  },

  /**
   * List documents with optional filters
   */
  async list(
    options: DocumentSearchOptions = {}
  ): Promise<ApiResponse<PaginatedResponse<Document>>> {
    const params = new URLSearchParams();

    if (options.query) params.append('query', options.query);
    if (options.tags) params.append('tags', options.tags.join(','));
    if (options.status) params.append('status', options.status);
    if (options.encrypted !== undefined) params.append('encrypted', String(options.encrypted));
    if (options.ownerId) params.append('ownerId', options.ownerId);
    if (options.sortBy) params.append('sortBy', options.sortBy);
    if (options.sortOrder) params.append('sortOrder', options.sortOrder);
    if (options.page) params.append('page', String(options.page));
    if (options.pageSize) params.append('pageSize', String(options.pageSize));

    const queryString = params.toString();
    const endpoint = queryString ? `/api/documents?${queryString}` : '/api/documents';

    return apiClient.get<PaginatedResponse<Document>>(endpoint);
  },

  /**
   * Update a document
   */
  async update(id: string, input: UpdateDocumentInput): Promise<ApiResponse<Document>> {
    return apiClient.put<Document>(`/api/documents/${id}`, input);
  },

  /**
   * Delete a document (soft delete)
   */
  async delete(id: string): Promise<ApiResponse<void>> {
    return apiClient.delete(`/api/documents/${id}`);
  },

  /**
   * Permanently delete a document
   */
  async hardDelete(id: string): Promise<ApiResponse<void>> {
    return apiClient.delete(`/api/documents/${id}/hard`);
  },

  /**
   * Upload a file as a document
   */
  async upload(file: File, metadata?: CreateDocumentInput): Promise<ApiResponse<Document>> {
    const formData = new FormData();
    formData.append('file', file);

    if (metadata) {
      formData.append('metadata', JSON.stringify(metadata));
    }

    return apiClient.request<Document>('/api/documents/upload', {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set Content-Type with boundary
    });
  },

  /**
   * Download document file
   */
  async download(id: string): Promise<ApiResponse<Blob>> {
    return apiClient.get<Blob>(`/api/documents/${id}/download`);
  },

  /**
   * Get document versions
   */
  async getVersions(id: string): Promise<ApiResponse<DocumentVersion[]>> {
    return apiClient.get<DocumentVersion[]>(`/api/documents/${id}/versions`);
  },

  /**
   * Restore a specific version
   */
  async restoreVersion(id: string, version: number): Promise<ApiResponse<Document>> {
    return apiClient.post<Document>(`/api/documents/${id}/versions/${version}/restore`);
  },

  /**
   * Share document with another user
   */
  async share(
    id: string,
    userId: string,
    permission: DocumentShare['permission'],
    expiresAt?: string
  ): Promise<ApiResponse<DocumentShare>> {
    return apiClient.post<DocumentShare>(`/api/documents/${id}/share`, {
      userId,
      permission,
      expiresAt,
    });
  },

  /**
   * List document shares
   */
  async listShares(id: string): Promise<ApiResponse<DocumentShare[]>> {
    return apiClient.get<DocumentShare[]>(`/api/documents/${id}/shares`);
  },

  /**
   * Revoke document share
   */
  async revokeShare(id: string, shareId: string): Promise<ApiResponse<void>> {
    return apiClient.delete(`/api/documents/${id}/shares/${shareId}`);
  },

  /**
   * Duplicate a document
   */
  async duplicate(id: string): Promise<ApiResponse<Document>> {
    return apiClient.post<Document>(`/api/documents/${id}/duplicate`);
  },

  /**
   * Export document in different formats
   */
  async export(id: string, format: 'pdf' | 'docx' | 'markdown' | 'html'): Promise<ApiResponse<Blob>> {
    return apiClient.get<Blob>(`/api/documents/${id}/export/${format}`);
  },
};

// ============================================================================
// Convenience Functions with unwrap
// ============================================================================

export const documents = {
  create: (input: CreateDocumentInput) => unwrap(documentApi.create(input)),
  get: (id: string) => unwrap(documentApi.get(id)),
  list: (options?: DocumentSearchOptions) => unwrap(documentApi.list(options)),
  update: (id: string, input: UpdateDocumentInput) => unwrap(documentApi.update(id, input)),
  delete: (id: string) => unwrap(documentApi.delete(id)),
  hardDelete: (id: string) => unwrap(documentApi.hardDelete(id)),
  upload: (file: File, metadata?: CreateDocumentInput) => unwrap(documentApi.upload(file, metadata)),
  download: (id: string) => unwrap(documentApi.download(id)),
  getVersions: (id: string) => unwrap(documentApi.getVersions(id)),
  restoreVersion: (id: string, version: number) => unwrap(documentApi.restoreVersion(id, version)),
  share: (id: string, userId: string, permission: DocumentShare['permission'], expiresAt?: string) =>
    unwrap(documentApi.share(id, userId, permission, expiresAt)),
  listShares: (id: string) => unwrap(documentApi.listShares(id)),
  revokeShare: (id: string, shareId: string) => unwrap(documentApi.revokeShare(id, shareId)),
  duplicate: (id: string) => unwrap(documentApi.duplicate(id)),
  export: (id: string, format: 'pdf' | 'docx' | 'markdown' | 'html') =>
    unwrap(documentApi.export(id, format)),
};
