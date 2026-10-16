import 'server-only';

import { NextResponse } from 'next/server';
import { MentorshipError } from './server';

export const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export function mentorshipErrorResponse(error: unknown, context: string) {
  if (error instanceof MentorshipError) {
    return NextResponse.json(
      { error: error.message, code: error.code, ...(error.details ? { details: error.details } : {}) },
      { status: error.status, headers: NO_STORE }
    );
  }
  console.error(`${context} failed:`, error);
  return NextResponse.json(
    { error: 'Mentorship is temporarily unavailable. Check that migration 061 has been applied.' },
    { status: 503, headers: NO_STORE }
  );
}
