/**
 * API Client Library - Type-safe HTTP client with interceptors, error handling, and retries
 */

import { backendConfig } from '@/lib/backend-config';

// ============================================================================
// Types
// ============================================================================

export interface ApiClientConfig {
  baseURL?: string;
  timeout?: number;
  headers?: Record<string, string>;
  retries?: number;
  retryDelay?: number;
}

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: ApiError;
  status: number;
  headers: Headers;
}

export interface ApiError {
  message: string;
  code: string;
  details?: unknown;
  statusCode: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface RequestOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  skipAuth?: boolean;
}

// ============================================================================
// Interceptors
// ============================================================================

type RequestInterceptor = (
  url: string,
  options: RequestOptions
) => Promise<{ url: string; options: RequestOptions }>;

type ResponseInterceptor = (
  response: Response,
  url: string
) => Promise<Response>;

type ErrorInterceptor = (error: ApiError, url: string) => Promise<ApiError>;

// ============================================================================
// API Client Class
// ============================================================================

export class ApiClient {
  private config: Required<ApiClientConfig>;
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];

  constructor(config: ApiClientConfig = {}) {
    this.config = {
      baseURL: config.baseURL || '',
      timeout: config.timeout || 30000,
      headers: config.headers || {},
      retries: config.retries || 3,
      retryDelay: config.retryDelay || 1000,
    };

    // Add default request interceptor for auth
    this.addRequestInterceptor(async (url, options) => {
      if (!options.skipAuth && typeof window !== 'undefined') {
        // Get token from localStorage
        const token = localStorage.getItem('accessToken');
        if (token) {
          options.headers = {
            ...options.headers,
            Authorization: `Bearer ${token}`,
          };
        }
      }
      return { url, options };
    });

    // Add default response interceptor for error handling
    this.addResponseInterceptor(async (response, url) => {
      if (!response.ok) {
        const error = await this.parseError(response, url);
        throw error;
      }
      return response;
    });
  }

  // --------------------------------------------------------------------------
  // Interceptor Management
  // --------------------------------------------------------------------------

  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  addErrorInterceptor(interceptor: ErrorInterceptor): void {
    this.errorInterceptors.push(interceptor);
  }

  // --------------------------------------------------------------------------
  // Core Request Method
  // --------------------------------------------------------------------------

  async request<T = unknown>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    let url = this.buildUrl(endpoint);
    let requestOptions: RequestOptions = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers,
        ...options.headers,
      },
    };

    // If sending FormData, let the browser set the multipart boundary.
    if (requestOptions.body instanceof FormData && requestOptions.headers) {
      delete (requestOptions.headers as Record<string, string>)['Content-Type'];
    }

    // Apply request interceptors
    for (const interceptor of this.requestInterceptors) {
      const result = await interceptor(url, requestOptions);
      url = result.url;
      requestOptions = result.options;
    }

    // Execute request with retries
    const timeout = requestOptions.timeout || this.config.timeout;
    const retries = requestOptions.retries ?? this.config.retries;
    const retryDelay = requestOptions.retryDelay || this.config.retryDelay;

    let lastError: ApiError | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          ...requestOptions,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Apply response interceptors
        let processedResponse = response;
        for (const interceptor of this.responseInterceptors) {
          processedResponse = await interceptor(processedResponse, url);
        }

        // Parse response
        const data = await this.parseResponse<T>(processedResponse);

        return {
          data,
          status: processedResponse.status,
          headers: processedResponse.headers,
        };
      } catch (error) {
        lastError = this.normalizeError(error, url);

        // Apply error interceptors
        for (const interceptor of this.errorInterceptors) {
          lastError = await interceptor(lastError, url);
        }

        // Don't retry on client errors (4xx) except 429 (rate limit)
        if (lastError.statusCode >= 400 && lastError.statusCode < 500 && lastError.statusCode !== 429) {
          break;
        }

        // Wait before retry (exponential backoff)
        if (attempt < retries) {
          await this.sleep(retryDelay * Math.pow(2, attempt));
        }
      }
    }

    return {
      error: lastError!,
      status: lastError!.statusCode,
      headers: new Headers(),
    };
  }

  // --------------------------------------------------------------------------
  // HTTP Methods
  // --------------------------------------------------------------------------

  async get<T = unknown>(
    endpoint: string,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async post<T = unknown>(
    endpoint: string,
    data?: unknown,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T = unknown>(
    endpoint: string,
    data?: unknown,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T = unknown>(
    endpoint: string,
    data?: unknown,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T = unknown>(
    endpoint: string,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  // --------------------------------------------------------------------------
  // File Upload
  // --------------------------------------------------------------------------

  async uploadFile<T = unknown>(
    endpoint: string,
    file: File,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    const formData = new FormData();
    formData.append('file', file);

    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: formData,
      headers: {
        // Let browser set Content-Type with boundary
        ...options?.headers,
      },
    });
  }

  async uploadMultipleFiles<T = unknown>(
    endpoint: string,
    files: File[],
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    const formData = new FormData();
    files.forEach((file) => {
      // Backend expects 'files' repeated field
      formData.append('files', file);
    });

    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: formData,
      headers: {
        // Let browser set Content-Type with boundary
        ...options?.headers,
      },
    });
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private buildUrl(endpoint: string): string {
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      return endpoint;
    }

    const base = this.config.baseURL.replace(/\/$/, '');
    const path = endpoint.replace(/^\//, '');
    return `${base}/${path}`;
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      return response.json();
    }

    if (contentType?.includes('text/')) {
      return response.text() as Promise<T>;
    }

    return response.blob() as Promise<T>;
  }

  private async parseError(response: Response, url: string): Promise<ApiError> {
    let message = `Request failed: ${response.status} ${response.statusText}`;
    let code = `HTTP_${response.status}`;
    let details: unknown;

    try {
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const json = await response.json();
        message = json.message || json.error || message;
        code = json.code || code;
        details = json.details || json;
      } else {
        message = await response.text();
      }
    } catch {
      // Use default message if parsing fails
    }

    return {
      message,
      code,
      details,
      statusCode: response.status,
    };
  }

  private normalizeError(error: unknown, url: string): ApiError {
    if (this.isApiError(error)) {
      return error;
    }

    if (error instanceof Error) {
      return {
        message: error.message,
        code: error.name || 'UNKNOWN_ERROR',
        details: error,
        statusCode: 0,
      };
    }

    return {
      message: 'An unknown error occurred',
      code: 'UNKNOWN_ERROR',
      details: error,
      statusCode: 0,
    };
  }

  private isApiError(error: unknown): error is ApiError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      'code' in error &&
      'statusCode' in error
    );
  }

  private getAuthToken(): string | null {
    if (typeof window === 'undefined') return null;

    // Try to get token from localStorage
    try {
      return localStorage.getItem('auth_token');
    } catch {
      return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Default Client Instance
// ============================================================================

export const apiClient = new ApiClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : '',
  timeout: 30000,
  retries: 3,
  retryDelay: 1000,
});

// ============================================================================
// Convenience Functions
// ============================================================================

export async function unwrap<T>(
  response: Promise<ApiResponse<T>>
): Promise<T> {
  const result = await response;

  if (result.error) {
    throw result.error;
  }

  if (!result.data) {
    throw new Error('No data in response');
  }

  return result.data;
}

export function isSuccess<T>(response: ApiResponse<T>): boolean {
  return !response.error && response.status >= 200 && response.status < 300;
}

export function isError<T>(response: ApiResponse<T>): boolean {
  return !!response.error || response.status >= 400;
}