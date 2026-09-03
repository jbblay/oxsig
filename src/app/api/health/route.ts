import { NextResponse } from 'next/server';
import { checkConnection, isDatabaseConfigured } from '@/lib/db/pool';

export async function GET() {
  const databaseConfigured = isDatabaseConfigured();
  const databaseReady = databaseConfigured ? await checkConnection() : false;
  return NextResponse.json({
    ok: databaseReady,
    clerkConfigured: Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY),
    databaseConfigured,
    databaseReady,
    storageConfigured: Boolean(process.env.STORAGE_BUCKET),
    labEnabled: process.env.LAB_AWS_ENABLED === 'true',
    timestamp: new Date().toISOString(),
  }, { status: databaseReady ? 200 : 503 });
}
