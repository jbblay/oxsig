import { isIP } from 'node:net';

type RequestWithHeaders = { headers: { get(name: string): string | null } };

export function getClientIp(request: RequestWithHeaders): string | null {
  const candidates = [
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
    request.headers.get('x-real-ip')?.trim(),
  ];

  for (const candidate of candidates) {
    if (candidate && isIP(candidate) !== 0) return candidate;
  }
  return null;
}

export function getUserAgent(request: RequestWithHeaders): string | null {
  return request.headers.get('user-agent')?.slice(0, 1000) || null;
}
