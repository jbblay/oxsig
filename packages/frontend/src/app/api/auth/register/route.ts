/**
 * Authentication API - POST /api/auth/register
 * Registers a new user with their public key
 */

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

let pool: Pool | null = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'oxsig',
      user: process.env.POSTGRES_USER || 'oxsig',
      password: process.env.POSTGRES_PASSWORD || 'changeme',
      max: 20,
    });
  }
  return pool;
}

export interface RegisterRequest {
  publicKey: string;
  displayName?: string;
  email?: string;
  signature?: string; // Signature proving ownership of private key
}

export interface RegisterResponse {
  id: string;
  publicKey: string;
  displayName?: string;
  email?: string;
  createdAt: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: RegisterRequest = await request.json();
    const { publicKey, displayName, email, signature } = body;

    // Validate required fields
    if (!publicKey) {
      return NextResponse.json(
        { error: 'Public key is required' },
        { status: 400 }
      );
    }

    // TODO: Verify signature to prove ownership of private key
    // This prevents someone from registering with someone else's public key
    if (signature) {
      // const isValid = await verifySignature(publicKey, signature, message);
      // if (!isValid) {
      //   return NextResponse.json(
      //     { error: 'Invalid signature' },
      //     { status: 401 }
      //   );
      // }
    }

    // Check if user already exists
    const existingUser = await getPool().query(
      'SELECT id FROM users WHERE public_key = $1',
      [publicKey]
    );

    if (existingUser.rows.length > 0) {
      return NextResponse.json(
        { error: 'User with this public key already exists' },
        { status: 409 }
      );
    }

    // Create new user
    const result = await getPool().query(
      `INSERT INTO users (public_key, display_name, email, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING id, public_key, display_name, email, created_at`,
      [publicKey, displayName, email]
    );

    const user = result.rows[0];

    const response: RegisterResponse = {
      id: user.id,
      publicKey: user.public_key,
      displayName: user.display_name,
      email: user.email,
      createdAt: user.created_at,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Failed to register user', details: String(error) },
      { status: 500 }
    );
  }
}
