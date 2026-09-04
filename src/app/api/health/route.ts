import { NextResponse } from 'next/server';
import { checkConnection, isDatabaseConfigured } from '@/lib/db/pool';

export async function GET() {
  const databaseReady = isDatabaseConfigured() ? await checkConnection() : false;

  // Keep the public health response intentionally small. Configuration details
  // (identity provider, storage, lab provider, etc.) are operational metadata
  // and should not be exposed to unauthenticated callers.
  return NextResponse.json(
    {
      ok: databaseReady,
      timestamp: new Date().toISOString(),
    },
    {
      status: databaseReady ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
