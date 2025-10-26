/**
 * Storage API - File storage and retrieval (MinIO/S3)
 */

import { apiClient, unwrap, type ApiResponse } from './client';

// ============================================================================
// Types
// ============================================================================

export interface StorageObject {
  id: string;
  key: string;
  bucket: string;
  filename: string;
  size: number;
  mimeType: string;
  url: string;
  publicUrl?: string;
  metadata: Record<string, unknown>;
  encrypted: boolean;
  checksum: string;
  uploadedBy: string;
  createdAt: string;
}

export interface UploadOptions {
  bucket?: string;
  filename?: string;
  metadata?: Record<string, unknown>;
  encrypted?: boolean;
  publicRead?: boolean;
  contentType?: string;
}

export interface MultipartUploadSession {
  uploadId: string;
  key: string;
  bucket: string;
  partSize: number;
  expiresAt: string;
}

export interface PresignedUrl {
  url: string;
  expiresAt: string;
  headers?: Record<string, string>;
}

// ============================================================================
// Storage API
// ============================================================================

export const storageApi = {
  /**
   * Upload a file
   */
  async upload(file: File, options: UploadOptions = {}): Promise<ApiResponse<StorageObject>> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('options', JSON.stringify(options));

    return apiClient.request<StorageObject>('/api/storage/upload', {
      method: 'POST',
      body: formData,
      headers: {},
    });
  },

  /**
   * Upload multiple files
   */
  async uploadMultiple(
    files: File[],
    options: UploadOptions = {}
  ): Promise<ApiResponse<StorageObject[]>> {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    formData.append('options', JSON.stringify(options));

    return apiClient.request<StorageObject[]>('/api/storage/upload-multiple', {
      method: 'POST',
      body: formData,
      headers: {},
    });
  },

  /**
   * Start multipart upload (for large files)
   */
  async startMultipartUpload(
    filename: string,
    size: number,
    options: UploadOptions = {}
  ): Promise<ApiResponse<MultipartUploadSession>> {
    return apiClient.post<MultipartUploadSession>('/api/storage/multipart/start', {
      filename,
      size,
      ...options,
    });
  },

  /**
   * Upload a part of multipart upload
   */
  async uploadPart(
    uploadId: string,
    partNumber: number,
    data: Blob
  ): Promise<ApiResponse<{ etag: string }>> {
    const formData = new FormData();
    formData.append('uploadId', uploadId);
    formData.append('partNumber', String(partNumber));
    formData.append('data', data);

    return apiClient.request<{ etag: string }>('/api/storage/multipart/part', {
      method: 'POST',
      body: formData,
      headers: {},
    });
  },

  /**
   * Complete multipart upload
   */
  async completeMultipartUpload(
    uploadId: string,
    parts: { partNumber: number; etag: string }[]
  ): Promise<ApiResponse<StorageObject>> {
    return apiClient.post<StorageObject>('/api/storage/multipart/complete', {
      uploadId,
      parts,
    });
  },

  /**
   * Abort multipart upload
   */
  async abortMultipartUpload(uploadId: string): Promise<ApiResponse<void>> {
    return apiClient.post('/api/storage/multipart/abort', { uploadId });
  },

  /**
   * Get presigned download URL
   */
  async getPresignedUrl(
    key: string,
    bucket?: string,
    expiresIn?: number
  ): Promise<ApiResponse<PresignedUrl>> {
    return apiClient.post<PresignedUrl>('/api/storage/presigned-url', {
      key,
      bucket,
      expiresIn,
    });
  },

  /**
   * Download a file
   */
  async download(key: string, bucket?: string): Promise<ApiResponse<Blob>> {
    const params = new URLSearchParams({ key });
    if (bucket) params.append('bucket', bucket);

    return apiClient.get<Blob>(`/api/storage/download?${params.toString()}`);
  },

  /**
   * Get file metadata
   */
  async getMetadata(key: string, bucket?: string): Promise<ApiResponse<StorageObject>> {
    const params = new URLSearchParams({ key });
    if (bucket) params.append('bucket', bucket);

    return apiClient.get<StorageObject>(`/api/storage/metadata?${params.toString()}`);
  },

  /**
   * Delete a file
   */
  async delete(key: string, bucket?: string): Promise<ApiResponse<void>> {
    const params = new URLSearchParams({ key });
    if (bucket) params.append('bucket', bucket);

    return apiClient.delete(`/api/storage?${params.toString()}`);
  },

  /**
   * Delete multiple files
   */
  async deleteMultiple(keys: string[], bucket?: string): Promise<ApiResponse<void>> {
    return apiClient.request('/api/storage/delete-multiple', {
      method: 'DELETE',
      body: JSON.stringify({ keys, bucket }),
    });
  },

  /**
   * List files in bucket
   */
  async list(
    bucket?: string,
    prefix?: string,
    maxKeys?: number
  ): Promise<ApiResponse<StorageObject[]>> {
    const params = new URLSearchParams();
    if (bucket) params.append('bucket', bucket);
    if (prefix) params.append('prefix', prefix);
    if (maxKeys) params.append('maxKeys', String(maxKeys));

    const query = params.toString();
    return apiClient.get<StorageObject[]>(`/api/storage/list${query ? `?${query}` : ''}`);
  },

  /**
   * Copy a file
   */
  async copy(
    sourceKey: string,
    destKey: string,
    sourceBucket?: string,
    destBucket?: string
  ): Promise<ApiResponse<StorageObject>> {
    return apiClient.post<StorageObject>('/api/storage/copy', {
      sourceKey,
      destKey,
      sourceBucket,
      destBucket,
    });
  },

  /**
   * Generate thumbnail
   */
  async generateThumbnail(
    key: string,
    width: number,
    height: number,
    bucket?: string
  ): Promise<ApiResponse<StorageObject>> {
    return apiClient.post<StorageObject>('/api/storage/thumbnail', {
      key,
      width,
      height,
      bucket,
    });
  },
};

// ============================================================================
// Convenience Functions with unwrap
// ============================================================================

export const storage = {
  upload: (file: File, options?: UploadOptions) => unwrap(storageApi.upload(file, options)),
  uploadMultiple: (files: File[], options?: UploadOptions) =>
    unwrap(storageApi.uploadMultiple(files, options)),
  startMultipartUpload: (filename: string, size: number, options?: UploadOptions) =>
    unwrap(storageApi.startMultipartUpload(filename, size, options)),
  uploadPart: (uploadId: string, partNumber: number, data: Blob) =>
    unwrap(storageApi.uploadPart(uploadId, partNumber, data)),
  completeMultipartUpload: (uploadId: string, parts: { partNumber: number; etag: string }[]) =>
    unwrap(storageApi.completeMultipartUpload(uploadId, parts)),
  abortMultipartUpload: (uploadId: string) => unwrap(storageApi.abortMultipartUpload(uploadId)),
  getPresignedUrl: (key: string, bucket?: string, expiresIn?: number) =>
    unwrap(storageApi.getPresignedUrl(key, bucket, expiresIn)),
  download: (key: string, bucket?: string) => unwrap(storageApi.download(key, bucket)),
  getMetadata: (key: string, bucket?: string) => unwrap(storageApi.getMetadata(key, bucket)),
  delete: (key: string, bucket?: string) => unwrap(storageApi.delete(key, bucket)),
  deleteMultiple: (keys: string[], bucket?: string) =>
    unwrap(storageApi.deleteMultiple(keys, bucket)),
  list: (bucket?: string, prefix?: string, maxKeys?: number) =>
    unwrap(storageApi.list(bucket, prefix, maxKeys)),
  copy: (sourceKey: string, destKey: string, sourceBucket?: string, destBucket?: string) =>
    unwrap(storageApi.copy(sourceKey, destKey, sourceBucket, destBucket)),
  generateThumbnail: (key: string, width: number, height: number, bucket?: string) =>
    unwrap(storageApi.generateThumbnail(key, width, height, bucket)),
};
