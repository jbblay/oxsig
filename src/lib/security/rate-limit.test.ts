import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { buildRateLimitBucketKey } from './rate-limit';

const config = { maxRequests: 20, windowMs: 60_000 };

describe('buildRateLimitBucketKey', () => {
  it('ignores query strings so they cannot create new rate-limit buckets', () => {
    const first = new NextRequest('https://oxsig.example/api/storyboards?page=1');
    const second = new NextRequest('https://oxsig.example/api/storyboards?page=999&noise=random');

    expect(buildRateLimitBucketKey(first, config, 'user-123')).toBe(
      buildRateLimitBucketKey(second, config, 'user-123')
    );
  });

  it('separates different users and different endpoint policies', () => {
    const request = new NextRequest('https://oxsig.example/api/storyboards');

    const userA = buildRateLimitBucketKey(request, config, 'user-a');
    const userB = buildRateLimitBucketKey(request, config, 'user-b');
    const stricter = buildRateLimitBucketKey(
      request,
      { maxRequests: 5, windowMs: 60_000 },
      'user-a'
    );

    expect(userA).not.toBe(userB);
    expect(userA).not.toBe(stricter);
  });

  it('lets separate routes share one named cost bucket', () => {
    const directCreate = new NextRequest('https://oxsig.example/api/labs');
    const designerExecute = new NextRequest('https://oxsig.example/api/labs/infrastructure-plan/execute');

    expect(buildRateLimitBucketKey(directCreate, config, 'user-a', 'lab-provision')).toBe(
      buildRateLimitBucketKey(designerExecute, config, 'user-a', 'lab-provision')
    );
    expect(buildRateLimitBucketKey(directCreate, config, 'user-a')).not.toBe(
      buildRateLimitBucketKey(designerExecute, config, 'user-a')
    );
  });

  it('stores only a fixed-size opaque SHA-256 bucket identifier', () => {
    const request = new NextRequest('https://oxsig.example/api/storyboards');
    const key = buildRateLimitBucketKey(request, config, 'sensitive-user-id');

    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain('sensitive-user-id');
  });
});
