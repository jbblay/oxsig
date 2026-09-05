'use client';

const CSRF_ENDPOINT = '/api/csrf-token';
const CSRF_CACHE_TTL_MS = 30 * 60 * 1000;

let cachedToken: string | null = null;
let cachedUntil = 0;
let inFlight: Promise<string> | null = null;

async function requestCsrfToken(): Promise<string> {
  const response = await fetch(CSRF_ENDPOINT, {
    cache: 'no-store',
    credentials: 'same-origin',
  });

  if (!response.ok) {
    throw new Error(`Could not prepare secure request (${response.status})`);
  }

  const body = await response.json().catch(() => ({}));
  if (typeof body?.token !== 'string' || !body.token) {
    throw new Error('Could not prepare secure request: token missing');
  }

  const token = body.token;
  cachedToken = token;
  cachedUntil = Date.now() + CSRF_CACHE_TTL_MS;
  return token;
}

export function clearCsrfTokenCache(): void {
  cachedToken = null;
  cachedUntil = 0;
}

export async function getCsrfToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedUntil) return cachedToken;
  if (inFlight) return inFlight;

  inFlight = requestCsrfToken();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
