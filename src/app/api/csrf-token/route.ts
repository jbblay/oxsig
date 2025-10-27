/**
 * CSRF Token API - GET /api/csrf-token
 * Returns CSRF token for client-side use
 */

import { NextRequest } from 'next/server';
import { handleGetCsrfToken } from '@/lib/security/csrf';

export async function GET(request: NextRequest) {
  return handleGetCsrfToken(request);
}
