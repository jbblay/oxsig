/**
 * Integration Tests for Authentication Flow
 * 
 * Tests the complete auth journey:
 * 1. Register new user
 * 2. Login with credentials
 * 3. Access protected routes
 * 4. Rate limiting
 * 
 * NOTE: These tests require a running Next.js server on port 3000.
 * Run with: pnpm dev (in another terminal) then pnpm test:integration
 * 
 * Skipped in CI - use for manual E2E verification only.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const API_BASE = 'http://localhost:3000';

// Skip these tests if server is not running (CI environment)
const shouldSkip = process.env.CI === 'true' || process.env.SKIP_INTEGRATION === 'true';
const testMode = shouldSkip ? describe.skip : describe;

// Test user credentials
const testUser = {
  email: `test-${Date.now()}@example.com`,
  password: 'TestPassword123!',
};

let accessToken: string | null = null;
let refreshToken: string | null = null;

testMode('Authentication Flow Integration', () => {
  describe('User Registration', () => {
    it('should register a new user', async () => {
      const response = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser),
      });

      expect(response.status).toBe(201);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe(testUser.email);
      expect(data.user.id).toBeDefined();

      // Check cookies
      const cookies = response.headers.get('set-cookie');
      expect(cookies).toBeTruthy();
      expect(cookies).toContain('accessToken');
      expect(cookies).toContain('refreshToken');
      expect(cookies).toContain('HttpOnly');
    });

    it('should reject duplicate email registration', async () => {
      const response = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser),
      });

      expect(response.status).toBe(409);
      
      const data = await response.json();
      expect(data.error).toBe('User exists');
    });

    it('should validate email format', async () => {
      const response = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'invalid-email',
          password: 'Test123!',
        }),
      });

      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toBe('Invalid email');
    });

    it('should enforce password strength', async () => {
      const response = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'newuser@example.com',
          password: 'weak',
        }),
      });

      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toBe('Weak password');
    });
  });

  describe('User Login', () => {
    it('should login with correct credentials', async () => {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser),
      });

      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe(testUser.email);

      // Extract tokens from cookies
      const cookies = response.headers.get('set-cookie');
      expect(cookies).toBeTruthy();
      expect(cookies).toContain('accessToken');
      expect(cookies).toContain('HttpOnly');
    });

    it('should reject incorrect password', async () => {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testUser.email,
          password: 'WrongPassword123!',
        }),
      });

      expect(response.status).toBe(401);
      
      const data = await response.json();
      expect(data.error).toBe('Invalid credentials');
    });

    it('should reject non-existent user', async () => {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          password: 'Test123!',
        }),
      });

      expect(response.status).toBe(401);
      
      const data = await response.json();
      expect(data.error).toBe('Invalid credentials');
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit login attempts', async () => {
      // Make 6 rapid login requests (limit is 5/minute)
      const requests = Array.from({ length: 6 }, () =>
        fetch(`${API_BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'ratelimit@example.com',
            password: 'Test123!',
          }),
        })
      );

      const responses = await Promise.all(requests);
      
      // Last request should be rate limited
      const lastResponse = responses[responses.length - 1];
      expect(lastResponse.status).toBe(429);
      
      const data = await lastResponse.json();
      expect(data.error).toBe('Too Many Requests');
      expect(data.retryAfter).toBeDefined();
      
      // Check rate limit headers
      expect(lastResponse.headers.get('Retry-After')).toBeTruthy();
      expect(lastResponse.headers.get('X-RateLimit-Limit')).toBe('5');
      expect(lastResponse.headers.get('X-RateLimit-Remaining')).toBe('0');
    }, { timeout: 10000 });

    it('should rate limit registration attempts', async () => {
      // Make 4 rapid registration requests (limit is 3/minute)
      const requests = Array.from({ length: 4 }, (_, i) =>
        fetch(`${API_BASE}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: `ratelimit${i}-${Date.now()}@example.com`,
            password: 'Test123!',
          }),
        })
      );

      const responses = await Promise.all(requests);
      
      // Last request should be rate limited
      const lastResponse = responses[responses.length - 1];
      expect(lastResponse.status).toBe(429);
      
      const data = await lastResponse.json();
      expect(data.error).toBe('Too Many Requests');
    }, { timeout: 10000 });
  });

  describe('Security Headers', () => {
    it('should include security headers on all responses', async () => {
      const response = await fetch(`${API_BASE}/api/health`);
      
      // Check for security headers
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
      expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(response.headers.get('Content-Security-Policy')).toBeTruthy();
      expect(response.headers.get('Permissions-Policy')).toBeTruthy();
    });

    it('should include CSP header with proper directives', async () => {
      const response = await fetch(`${API_BASE}/`);
      const csp = response.headers.get('Content-Security-Policy');
      
      expect(csp).toBeTruthy();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("upgrade-insecure-requests");
    });
  });
});

testMode('Protected Routes', () => {
  it('should reject unauthenticated API requests', async () => {
    const response = await fetch(`${API_BASE}/api/documents`, {
      method: 'GET',
    });

    expect(response.status).toBe(401);
    
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  // Note: Full protected route testing requires cookie handling
  // which is complex in integration tests. Consider E2E tests with Playwright.
});
