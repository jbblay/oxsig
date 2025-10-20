import { NextRequest, NextResponse } from 'next/server';

// Required for static export
export const dynamic = 'force-static';
export const revalidate = false;

/**
 * POST /api/documents/sync
 * Sync document from offline storage to backend
 * 
 * Note: This route is not used in Tauri builds (static export).
 * For desktop app, use Tauri commands instead.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const {
      id,
      hash,
      name,
      content,
      signatures,
      timestamp,
      metadata,
    } = body;

    // Validate required fields
    if (!id || !hash || !name) {
      return NextResponse.json(
        { error: 'Missing required fields: id, hash, name' },
        { status: 400 }
      );
    }

    // TODO: Implement actual backend storage
    // For now, just acknowledge the sync
    // In production, you would:
    // 1. Validate the document hash
    // 2. Store in your database (Supabase, PostgreSQL, etc.)
    // 3. Verify signatures
    // 4. Update sync status
    
    console.log('📥 Syncing document:', {
      id,
      name,
      hash: hash.substring(0, 16) + '...',
      signaturesCount: signatures?.length || 0,
      timestamp: new Date(timestamp).toISOString(),
    });

    // Simulate successful sync
    const response = {
      success: true,
      documentId: id,
      syncedAt: new Date().toISOString(),
      message: 'Document synced successfully',
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to sync document',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/documents/sync?since=timestamp
 * Get documents that need to be synced to client
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const since = searchParams.get('since');

    // TODO: Implement actual backend retrieval
    // Query documents modified since the given timestamp
    
    const documents: unknown[] = [];
    
    return NextResponse.json({
      documents,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Sync retrieval error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve documents' },
      { status: 500 }
    );
  }
}
