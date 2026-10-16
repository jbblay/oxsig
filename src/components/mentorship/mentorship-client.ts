'use client';

import { getCsrfToken } from '@/lib/security/csrf-client';

export class MentorshipRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

async function parse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new MentorshipRequestError(body?.error || `Request failed (${response.status})`, response.status, body?.code);
  }
  return body as T;
}

export async function mentorshipGet<T>(url: string): Promise<T> {
  return parse<T>(await fetch(url, { cache: 'no-store', credentials: 'include' }));
}

export async function mentorshipMutate<T>(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<T> {
  return parse<T>(
    await fetch(url, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': await getCsrfToken() },
      body: JSON.stringify(body),
    })
  );
}
