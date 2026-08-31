import { NextResponse } from 'next/server';
import { clearAuthCookies } from '@/lib/auth/cookies';
import { DEMO_USER, isDemoModeEnabled, setDemoSessionCookie } from '@/lib/auth/demo';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { enabled: isDemoModeEnabled() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST() {
  if (!isDemoModeEnabled()) {
    return NextResponse.json(
      { error: 'Demo unavailable', message: 'Demo access is only available in Preview.' },
      { status: 404 },
    );
  }

  const response = NextResponse.json({
    success: true,
    user: DEMO_USER,
  });
  clearAuthCookies(response);
  setDemoSessionCookie(response);
  return response;
}
