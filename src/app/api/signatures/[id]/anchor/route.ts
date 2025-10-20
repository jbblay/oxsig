/**
 * Signature Anchor API - POST /api/signatures/[id]/anchor
 * Stores a fake blockchain tx hash to mark anchoring complete.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import crypto from 'crypto';

let pool: Pool | null = null;
function getPool() {
  if (!pool) {
    pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'oxsig',
      user: process.env.POSTGRES_USER || 'oxsig',
      password: process.env.POSTGRES_PASSWORD || 'oxsig_secure_password',
      max: 20,
    });
  }
  return pool;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const txHash = '0x' + crypto.randomBytes(32).toString('hex');

    const res = await getPool().query(
      `UPDATE signatures SET blockchain_tx_hash = $1 WHERE id = $2 RETURNING id`,
      [txHash, id]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Signature not found' }, { status: 404 });
    }

    return NextResponse.json({ txHash });
  } catch (error) {
    console.error('Error anchoring signature:', error);
    return NextResponse.json(
      { error: 'Failed to anchor signature', details: String(error) },
      { status: 500 }
    );
  }
}