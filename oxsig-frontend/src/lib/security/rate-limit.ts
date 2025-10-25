/**
 * Rate Limiting Middleware
 * 
 * In-memory rate limiter with sliding window algorithm.
 * For production with multiple servers, replace with Redis-backed solution.
 */

import { NextRequest, NextResponse } from 'next/server';

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

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of requestStore.entries()) {
    if (record.resetTime < now) {
      requestStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Rate limit configurations for different endpoints
 */
export const RATE_LIMITS = {
  // Auth endpoints - strict limits to prevent brute force
  AUTH_LOGIN: { maxRequests: 5, windowMs: 60 * 1000 }, // 5 requests per minute
  AUTH_REGISTER: { maxRequests: 3, windowMs: 60 * 1000 }, // 3 requests per minute
  
  // API endpoints - moderate limits
  API_DEFAULT: { maxRequests: 100, windowMs: 60 * 1000 }, // 100 requests per minute
  API_DOCUMENTS: { maxRequests: 50, windowMs: 60 * 1000 }, // 50 requests per minute
  API_SIGNATURES: { maxRequests: 30, windowMs: 60 * 1000 }, // 30 requests per minute
  
  // Public endpoints - looser limits
  PUBLIC: { maxRequests: 200, windowMs: 60 * 1000 }, // 200 requests per minute
} as const;

/**
 * Get client identifier (IP address or session)
 */
function getClientId(request: NextRequest): string {
  // Try to get real IP from headers (for proxied requests)
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  
  if (realIp) {
    return realIp;
  }
  
  // Fallback to generic identifier
  return 'client-' + request.headers.get('user-agent')?.substring(0, 50) || 'unknown';
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
  const key = `${request.url}:${clientId}`;
  const now = Date.now();
  
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

/**
 * Rate limit middleware wrapper for API routes
 */
export function withRateLimit(
  handler: (request: NextRequest) => Promise<NextResponse>,
  config: RateLimitConfig = RATE_LIMITS.API_DEFAULT
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const rateLimitResponse = await checkRateLimit(request, config);
    
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    
    return handler(request);
  };
}

/**
 * Get rate limit info for client
 */
export function getRateLimitInfo(
  request: NextRequest,
  config: RateLimitConfig
): {
  limit: number;
  remaining: number;
  reset: Date;
} {
  const clientId = getClientId(request);
  const key = `${request.url}:${clientId}`;
  const record = requestStore.get(key);
  
  if (!record) {
    return {
      limit: config.maxRequests,
      remaining: config.maxRequests,
      reset: new Date(Date.now() + config.windowMs),
    };
  }
  
  return {
    limit: config.maxRequests,
    remaining: Math.max(0, config.maxRequests - record.count),
    reset: new Date(record.resetTime),
  };
}

/**
 * Clear rate limit for a specific client (useful for testing)
 */
export function clearRateLimit(request: NextRequest): void {
  const clientId = getClientId(request);
  const key = `${request.url}:${clientId}`;
  requestStore.delete(key);
}

/**
 * Clear all rate limits (useful for testing)
 */
export function clearAllRateLimits(): void {
  requestStore.clear();
}
