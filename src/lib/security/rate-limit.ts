/**
 * Shared API rate limiting.
 *
 * Production requests coordinate through PostgreSQL so limits survive
 * serverless cold starts and apply consistently across application instances.
 * A small in-memory bucket remains as an availability fallback for ordinary
 * endpoints. Cost-bearing or security-sensitive callers can opt into
 * fail-closed behavior so a shared-limiter outage never weakens their policy.
 */

import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getPool, isDatabaseConfigured } from '@/lib/db/pool';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitOptions {
  failClosed?: boolean;
}

interface RequestRecord {
  count: number;
  resetTime: number;
}

interface ConsumedBucket {
  count: number;
  resetTime: number;
}

const requestStore = new Map<string, RequestRecord>();

export const RATE_LIMITS = {
  AUTH_LOGIN: { maxRequests: 5, windowMs: 60 * 1000 },
  AUTH_REGISTER: { maxRequests: 3, windowMs: 60 * 1000 },
  API_DEFAULT: { maxRequests: 100, windowMs: 60 * 1000 },
  API_DOCUMENTS: { maxRequests: 50, windowMs: 60 * 1000 },
  API_SIGNATURES: { maxRequests: 30, windowMs: 60 * 1000 },
  PUBLIC: { maxRequests: 200, windowMs: 60 * 1000 },
  LAB_PROVISION: { maxRequests: 2, windowMs: 60 * 60 * 1000 },
} as const;

function getClientId(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');

  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  if (realIp) return realIp.trim();

  const userAgent = request.headers.get('user-agent')?.substring(0, 50) || 'unknown';
  return `client-${userAgent}`;
}

function normalizedPath(request: NextRequest): string {
  try {
    return new URL(request.url).pathname || '/';
  } catch {
    return '/';
  }
}

/**
 * Build the opaque shared bucket key. Query strings are deliberately excluded
 * so callers cannot evade a limit by adding arbitrary query parameters.
 *
 * `bucketScope` lets multiple endpoints intentionally share one policy bucket.
 * This is useful for cost-bearing operations exposed through more than one
 * product surface, such as normal lab creation and Designer deployment.
 */
export function buildRateLimitBucketKey(
  request: NextRequest,
  config: RateLimitConfig,
  identifier?: string,
  bucketScope?: string
): string {
  const clientId = identifier || getClientId(request);
  const material = [
    bucketScope?.trim() || normalizedPath(request),
    clientId,
    String(config.maxRequests),
    String(config.windowMs),
  ].join('\0');
  return createHash('sha256').update(material).digest('hex');
}

function consumeMemoryBucket(key: string, config: RateLimitConfig): ConsumedBucket {
  const now = Date.now();
  const existing = requestStore.get(key);

  if (!existing || existing.resetTime <= now) {
    const created = { count: 1, resetTime: now + config.windowMs };
    requestStore.set(key, created);
    return created;
  }

  existing.count += 1;
  requestStore.set(key, existing);
  return existing;
}

async function consumeDatabaseBucket(key: string, config: RateLimitConfig): Promise<ConsumedBucket> {
  const result = await getPool().query(
    `INSERT INTO rate_limit_buckets (key_hash, request_count, reset_at, updated_at)
     VALUES ($1, 1, NOW() + ($2::double precision * INTERVAL '1 millisecond'), NOW())
     ON CONFLICT (key_hash) DO UPDATE
     SET request_count = CASE
           WHEN rate_limit_buckets.reset_at <= NOW() THEN 1
           ELSE rate_limit_buckets.request_count + 1
         END,
         reset_at = CASE
           WHEN rate_limit_buckets.reset_at <= NOW()
             THEN NOW() + ($2::double precision * INTERVAL '1 millisecond')
           ELSE rate_limit_buckets.reset_at
         END,
         updated_at = NOW()
     RETURNING request_count, reset_at`,
    [key, config.windowMs]
  );

  const row = result.rows[0];
  if (!row) throw new Error('Rate-limit bucket update returned no row');

  return {
    count: Number(row.request_count),
    resetTime: new Date(row.reset_at).getTime(),
  };
}

function limitedResponse(config: RateLimitConfig, bucket: ConsumedBucket): NextResponse {
  const now = Date.now();
  const retryAfter = Math.max(1, Math.ceil((bucket.resetTime - now) / 1000));

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
        'X-RateLimit-Reset': new Date(bucket.resetTime).toISOString(),
      },
    }
  );
}

function unavailableResponse(): NextResponse {
  return NextResponse.json(
    {
      error: 'Rate Limit Unavailable',
      message: 'This protected operation is temporarily unavailable because its shared safety limit could not be verified.',
    },
    {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}

export async function checkRateLimit(
  request: NextRequest,
  config: RateLimitConfig,
  identifier?: string,
  bucketScope?: string,
  options: RateLimitOptions = {}
): Promise<NextResponse | null> {
  if (!Number.isFinite(config.maxRequests) || config.maxRequests < 1) {
    throw new Error('Rate-limit maxRequests must be at least 1');
  }
  if (!Number.isFinite(config.windowMs) || config.windowMs < 1) {
    throw new Error('Rate-limit windowMs must be at least 1');
  }

  const key = buildRateLimitBucketKey(request, config, identifier, bucketScope);
  let bucket: ConsumedBucket;

  if (isDatabaseConfigured()) {
    try {
      bucket = await consumeDatabaseBucket(key, config);
    } catch (error) {
      if (options.failClosed) {
        console.error('Shared rate limiter unavailable; protected operation denied:', error);
        return unavailableResponse();
      }
      console.error('Shared rate limiter unavailable; using local fallback:', error);
      bucket = consumeMemoryBucket(key, config);
    }
  } else if (options.failClosed) {
    console.error('Shared rate limiter unavailable; protected operation denied because DATABASE_URL is not configured.');
    return unavailableResponse();
  } else {
    bucket = consumeMemoryBucket(key, config);
  }

  return bucket.count > config.maxRequests ? limitedResponse(config, bucket) : null;
}

export function withRateLimit(
  handler: (request: NextRequest) => Promise<NextResponse>,
  config: RateLimitConfig = RATE_LIMITS.API_DEFAULT
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const rateLimitResponse = await checkRateLimit(request, config);
    if (rateLimitResponse) return rateLimitResponse;
    return handler(request);
  };
}

/**
 * Local fallback diagnostics retained for tests/development. Production shared
 * bucket state lives in PostgreSQL and is intentionally not exposed here.
 */
export function getRateLimitInfo(
  request: NextRequest,
  config: RateLimitConfig
): {
  limit: number;
  remaining: number;
  reset: Date;
} {
  const key = buildRateLimitBucketKey(request, config);
  const record = requestStore.get(key);

  if (!record || record.resetTime <= Date.now()) {
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

export function clearRateLimit(request: NextRequest, config: RateLimitConfig = RATE_LIMITS.API_DEFAULT): void {
  requestStore.delete(buildRateLimitBucketKey(request, config));
}

export function clearAllRateLimits(): void {
  requestStore.clear();
}
