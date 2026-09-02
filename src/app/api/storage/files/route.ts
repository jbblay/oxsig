import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';

function retiredResponse() {
  return NextResponse.json(
    {
      error: 'Legacy storage metadata API retired',
      message:
        'This endpoint targeted the deprecated migration-003 storage schema. Use the authenticated /api/storage routes instead.',
    },
    { status: 410 }
  );
}

export async function GET(request: NextRequest) {
  return requireAuth(request, async () => retiredResponse());
}

export async function POST(request: NextRequest) {
  return requireAuth(request, async () => retiredResponse());
}
