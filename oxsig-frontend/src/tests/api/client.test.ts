/**
 * API Client Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, unwrap, isSuccess, isError } from '../../lib/api/client';

describe('API Client', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET requests', () => {
    it('should make successful GET request', async () => {
      const mockData = { id: '1', name: 'Test' };
      
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValue(mockData),
        text: vi.fn().mockResolvedValue(JSON.stringify(mockData)),
        blob: vi.fn().mockResolvedValue(new Blob([JSON.stringify(mockData)])),
      });
      global.fetch = mockFetch;

      const response = await apiClient.get('/api/test');

      expect(mockFetch).toHaveBeenCalled();
      expect(response.data).toEqual(mockData);
      expect(response.status).toBe(200);
      expect(response.error).toBeUndefined();
    });

    it('should handle errors', async () => {
      const errorData = { error: 'Not found' };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValue(errorData),
        text: vi.fn().mockResolvedValue(JSON.stringify(errorData)),
        blob: vi.fn().mockResolvedValue(new Blob([JSON.stringify(errorData)])),
      });
      global.fetch = mockFetch;

      const response = await apiClient.get('/api/test');

      expect(response.error).toBeDefined();
      expect(response.error?.statusCode).toBe(404);
    });

    it('should retry on failure', async () => {
      let attempts = 0;
      
      const mockFetch = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('Network error'));
        }
        const successData = { success: true };
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: vi.fn().mockResolvedValue(successData),
          text: vi.fn().mockResolvedValue(JSON.stringify(successData)),
          blob: vi.fn().mockResolvedValue(new Blob([JSON.stringify(successData)])),
        });
      });
      global.fetch = mockFetch;

      const response = await apiClient.get('/api/test', { retries: 3 });

      expect(attempts).toBe(3);
      expect(response.data).toEqual({ success: true });
    });
  });

  describe('POST requests', () => {
    it('should make successful POST request', async () => {
      const mockData = { id: '1', created: true };
      
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValue(mockData),
        text: vi.fn().mockResolvedValue(JSON.stringify(mockData)),
        blob: vi.fn().mockResolvedValue(new Blob([JSON.stringify(mockData)])),
      });
      global.fetch = mockFetch;

      const response = await apiClient.post('/api/test', { name: 'Test' });

      expect(mockFetch).toHaveBeenCalled();
      expect(response.data).toEqual(mockData);
      expect(response.status).toBe(201);
    });
  });

  describe('Helper functions', () => {
    it('unwrap should return data on success', async () => {
      const mockData = { id: '1' };
      
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValue(mockData),
        text: vi.fn().mockResolvedValue(JSON.stringify(mockData)),
        blob: vi.fn().mockResolvedValue(new Blob([JSON.stringify(mockData)])),
      });
      global.fetch = mockFetch;

      const data = await unwrap(apiClient.get('/api/test'));
      expect(data).toEqual(mockData);
    });

    it('unwrap should throw on error', async () => {
      const errorData = { error: 'Not found' };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValue(errorData),
        text: vi.fn().mockResolvedValue(JSON.stringify(errorData)),
        blob: vi.fn().mockResolvedValue(new Blob([JSON.stringify(errorData)])),
      });
      global.fetch = mockFetch;

      await expect(unwrap(apiClient.get('/api/test'))).rejects.toThrow();
    });

    it('isSuccess should return true for 2xx status', () => {
      expect(isSuccess({ status: 200, headers: new Headers() })).toBe(true);
      expect(isSuccess({ status: 404, headers: new Headers(), error: {} as any })).toBe(false);
    });

    it('isError should return true for errors', () => {
      expect(isError({ status: 404, headers: new Headers(), error: {} as any })).toBe(true);
      expect(isError({ status: 200, headers: new Headers(), data: {} })).toBe(false);
    });
  });
});
