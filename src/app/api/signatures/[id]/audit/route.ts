/**
 * Signature Audit Trail API - GET /api/signatures/[id]/audit
 * Returns a minimal audit trail list for the signature.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  const audit = [
    {
      id: `evt-${id}-created`,
      type: 'signature_created',
      signatureId: id,
      timestamp: new Date().toISOString(),
      metadata: {},
    },
  ];

  return NextResponse.json(audit);
}