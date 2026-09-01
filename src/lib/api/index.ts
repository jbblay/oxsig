/**
 * API Index - Central exports for all API modules
 */

// Export client
export { apiClient, unwrap, isSuccess, isError } from './client';
export type {
  ApiClientConfig,
  ApiResponse,
  ApiError,
  PaginatedResponse,
  RequestOptions,
} from './client';

// Export document API
export { documentApi, documents } from './documents';
export type {
  Document,
  CreateDocumentInput,
  UpdateDocumentInput,
  DocumentSearchOptions,
  DocumentVersion,
  DocumentShare,
} from './documents';

// Export storage API
export { storageApi, storage } from './storage';
export type {
  StorageObject,
  UploadOptions,
  MultipartUploadSession,
  PresignedUrl,
} from './storage';

// Export search API
export { searchApi, search } from './search';
export type {
  SearchResult,
  SearchOptions,
  FacetDistribution,
  SearchStats,
} from './search';

// Import for convenience API object
import { documents } from './documents';
import { storage } from './storage';
import { search } from './search';

// Convenience combined API object
export const api = {
  documents,
  storage,
  search,
};
