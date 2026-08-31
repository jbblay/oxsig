import type { NextResponse } from 'next/server';
import { TOKEN_EXPIRY } from './jwt';

const commonOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  priority: 'high' as const,
};

export function setAuthCookies(
  response: NextResponse,
  tokens: { accessToken: string; refreshToken: string },
): void {
  response.cookies.set('accessToken', tokens.accessToken, {
    ...commonOptions,
    maxAge: TOKEN_EXPIRY.ACCESS,
  });
  response.cookies.set('refreshToken', tokens.refreshToken, {
    ...commonOptions,
    maxAge: TOKEN_EXPIRY.REFRESH,
  });
}

export function clearAuthCookies(response: NextResponse): void {
  response.cookies.set('accessToken', '', { ...commonOptions, maxAge: 0 });
  response.cookies.set('refreshToken', '', { ...commonOptions, maxAge: 0 });
}
