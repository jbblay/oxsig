/**
 * Rate Limiting Middleware
 * 
 * In-memory rate limiter with sliding window algorithm.
 * For production with multiple servers, replace with Redis-backed solution.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/http/client-info';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface RequestRecord {
  count: number;
  resetTime: number;
}

// In-memory store (use Redis for production multi-server setups)
const requestStore = new Map<string, RequestRecord>();
let requestsSinceCleanup = 0;

function cleanupExpiredEntries(now: number): void {
  requestsSinceCleanup += 1;
  if (requestsSinceCleanup < 500) return;
  requestsSinceCleanup = 0;
  for (const [key, record] of requestStore.entries()) {
    if (record.resetTime < now) requestStore.delete(key);
  }
}

/**
 * Rate limit configurations for different endpoints
 */
export const RATE_LIMITS = {
  // Auth endpoints - strict limits to prevent brute force
  AUTH_LOGIN: { maxRequests: 5, windowMs: 60 * 1000 }, // 5 requests per minute
  AUTH_REGISTER: { maxRequests: 3, windowMs: 60 * 1000 }, // 3 requests per minute
  
  API_DOCUMENTS: { maxRequests: 50, windowMs: 60 * 1000 }, // 50 requests per minute
  API_SIGNATURES: { maxRequests: 30, windowMs: 60 * 1000 }, // 30 requests per minute
  API_PROFILE: { maxRequests: 20, windowMs: 60 * 1000 }, // 20 profile updates per minute
} as const;

/**
 * Get client identifier (IP address or session)
 */
function getClientId(request: NextRequest): string {
  return getClientIp(request) ?? 'unknown-client';
}

/**
 * Check if request is rate limited
 * Returns null if allowed, or NextResponse with 429 if rate limited
 */
export async function checkRateLimit(
  request: NextRequest,
  config: RateLimitConfig,
  identifier?: string
): Promise<NextResponse | null> {
  const clientId = identifier || getClientId(request);
  const key = `${request.method}:${request.nextUrl.pathname}:${clientId}`;
  const now = Date.now();
  cleanupExpiredEntries(now);
  
  const record = requestStore.get(key);
  
  if (!record || record.resetTime < now) {
    // First request or window expired - create new record
    requestStore.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return null;
  }
  
  if (record.count >= config.maxRequests) {
    // Rate limit exceeded
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    
    return NextResponse.json(
      {
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter,
      },
      {
        status: 429,
        headers: {
          'Retry-After': retryAfter.toString(),
          'X-RateLimit-Limit': config.maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(record.resetTime).toISOString(),
        },
      }
    );
  }
  
  // Increment counter
  record.count++;
  requestStore.set(key, record);
  
  return null;
}
