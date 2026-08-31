import { NextRequest, NextResponse } from 'next/server';

const DEMO_COOKIE_NAME = 'oxsigDemoSession';
const DEMO_COOKIE_VALUE = 'preview-v1';
const DEMO_SESSION_MAX_AGE = 60 * 60;

export const DEMO_USER = Object.freeze({
  id: '00000000-0000-4000-8000-000000000001',
  displayName: 'Demo User',
  email: 'demo@oxsig.test',
  bio: 'Temporary read-only account for previewing OxSig.',
  role: 'demo' as const,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  lastSeenAt: null,
});

/**
 * Demo access is automatic on Vercel Preview deployments and can be opted into
 * during local development. It is deliberately impossible to enable on a
 * production deployment.
 */
export function isDemoModeEnabled(): boolean {
  if (process.env.VERCEL_ENV?.trim().toLowerCase() === 'preview') return true;
  return process.env.NODE_ENV !== 'production' && process.env.OXSIG_DEMO_MODE === 'true';
}

export function hasDemoSession(request: NextRequest): boolean {
  return isDemoModeEnabled()
    && request.cookies.get(DEMO_COOKIE_NAME)?.value === DEMO_COOKIE_VALUE;
}

export function setDemoSessionCookie(response: NextResponse): void {
  response.cookies.set(DEMO_COOKIE_NAME, DEMO_COOKIE_VALUE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: DEMO_SESSION_MAX_AGE,
    priority: 'high',
  });
}

export function clearDemoSessionCookie(response: NextResponse): void {
  response.cookies.set(DEMO_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
    priority: 'high',
  });
}

export function demoReadOnlyResponse(): NextResponse {
  return NextResponse.json(
    {
      error: 'Demo mode is read-only',
      message: 'Sign in with a real account to save changes.',
    },
    { status: 403 },
  );
}
