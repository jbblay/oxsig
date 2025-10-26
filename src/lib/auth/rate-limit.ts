/**
 * Rate Limiting Middleware
 * Redis-backed rate limiter for API routes
 */

import { NextRequest, NextResponse } from 'next/server';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

// In-memory store (use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Rate limit middleware
 */
export async function rateLimit(
  request: NextRequest,
  config: RateLimitConfig = { windowMs: 60000, maxRequests: 100 }
): Promise<NextResponse | null> {
  try {
    // Get client identifier (IP or user ID)
    const clientId = getClientId(request);
    const now = Date.now();

    // Get or create rate limit entry
    let entry = rateLimitStore.get(clientId);

    if (!entry || now > entry.resetAt) {
      // Create new window
      entry = {
        count: 0,
        resetAt: now + config.windowMs,
      };
      rateLimitStore.set(clientId, entry);
    }

    // Increment counter
    entry.count++;

    // Check if limit exceeded
    if (entry.count > config.maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);

      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `Too many requests. Please try again in ${retryAfter} seconds.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(config.maxRequests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(entry.resetAt / 1000)),
          },
        }
      );
    }

    // Clean up old entries periodically
    if (Math.random() < 0.01) {
      cleanupExpiredEntries();
    }

    return null; // Continue to handler
  } catch (error) {
    console.error('Rate limit error:', error);
    return null; // Allow request on error
  }
}

/**
 * Get client identifier from request
 */
function getClientId(request: NextRequest): string {
  // Try to get from auth token
  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    return `auth:${authHeader.substring(0, 32)}`;
  }

  // Fall back to IP address
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown';

  return `ip:${ip}`;
}

/**
 * Clean up expired entries
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Apply rate limit to handler
 */
export async function withRateLimit(
  request: NextRequest,
  handler: (request: NextRequest) => Promise<NextResponse>,
  config?: RateLimitConfig
): Promise<NextResponse> {
  const rateLimitResponse = await rateLimit(request, config);

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  return handler(request);
}
