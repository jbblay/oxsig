/**
 * User Cryptographic Keys API
 * GET /api/users/me/keys - Get user's cryptographic keys
 * POST /api/users/me/keys - Generate new key pair
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    try {
      // Get keys from database
      const result = await getPool().query(
        `SELECT 
          id,
          key_type,
          public_key,
          algorithm,
          created_at,
          status,
          usage_count
         FROM user_crypto_keys
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [user.id]
      );

      const keys = result.rows.map((row: any, index: number) => ({
        id: row.id,
        name: getKeyName(row.key_type, index),
        type: row.algorithm || 'Ed25519',
        created: new Date(row.created_at).toLocaleDateString('en-US', { 
          month: 'short', 
          year: 'numeric' 
        }),
        uses: row.usage_count || 0,
        status: row.status || 'active',
        publicKey: row.public_key
      }));

      // Return keys (no fallback needed - empty array is fine)
      return NextResponse.json({ keys });
    } catch (error) {
      console.error('Failed to get keys:', error);
      return NextResponse.json(
        { error: 'Failed to retrieve keys' },
        { status: 500 }
      );
    }
  });
}

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    try {
      const body = await req.json();
      const { keyType = 'signing', algorithm = 'Ed25519' } = body;

      // Validate algorithm
      const validAlgorithms = ['Ed25519', 'CRYSTALS-Dilithium', 'SPHINCS+', 'RSA-4096'];
      if (!validAlgorithms.includes(algorithm)) {
        return NextResponse.json(
          { error: 'Invalid algorithm' },
          { status: 400 }
        );
      }

      // In a real implementation, this would generate actual keys
      // For now, we'll create a placeholder entry
      const publicKey = `pk_${algorithm}_${Date.now()}`;

      const result = await getPool().query(
        `INSERT INTO user_crypto_keys 
         (user_id, key_type, algorithm, public_key, status, created_at, usage_count)
         VALUES ($1, $2, $3, $4, $5, NOW(), 0)
         RETURNING id, key_type, algorithm, public_key, created_at, status`,
        [user.id, keyType, algorithm, publicKey, 'active']
      );

      const newKey = result.rows[0];

      return NextResponse.json({
        success: true,
        key: {
          id: newKey.id,
          name: getKeyName(newKey.key_type, 0),
          type: newKey.algorithm,
          created: new Date(newKey.created_at).toLocaleDateString('en-US', { 
            month: 'short', 
            year: 'numeric' 
          }),
          uses: 0,
          status: newKey.status,
          publicKey: newKey.public_key
        }
      });
    } catch (error) {
      console.error('Failed to generate key:', error);
      return NextResponse.json(
        { error: 'Failed to generate key' },
        { status: 500 }
      );
    }
  });
}

function getKeyName(keyType: string, index: number): string {
  const types: Record<string, string> = {
    signing: 'Signing Key',
    encryption: 'Encryption Key',
    recovery: 'Recovery Key',
    backup: 'Backup Key'
  };

  const name = types[keyType] || 'Cryptographic Key';
  return index === 0 ? `Primary ${name}` : `${name} #${index + 1}`;
}
