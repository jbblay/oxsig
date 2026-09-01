/**
 * Authentication API - POST /api/auth/register
 * Creates a new email/password account and an Ed25519-backed session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateTokenPair, hashPassword } from '@/lib/auth/jwt';
import { hashRefreshToken } from '@/lib/auth/session';
import { getPool } from '@/lib/db/pool';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { z } from 'zod';

const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character');

const emailSchema = z.string().email('Invalid email address');

export async function POST(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.AUTH_REGISTER);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const rawDisplayName = body.displayName ?? body.display_name;
    const displayName =
      typeof rawDisplayName === 'string' && rawDisplayName.trim()
        ? rawDisplayName.trim().slice(0, 255)
        : null;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Missing fields', message: 'Email and password are required' },
        { status: 400 }
      );
    }

    const emailValidation = emailSchema.safeParse(email);
    if (!emailValidation.success) {
      return NextResponse.json(
        { error: 'Invalid email', message: emailValidation.error.errors[0].message },
        { status: 400 }
      );
    }

    const passwordValidation = passwordSchema.safeParse(password);
    if (!passwordValidation.success) {
      return NextResponse.json(
        { error: 'Weak password', message: passwordValidation.error.errors[0].message },
        { status: 400 }
      );
    }

    const pool = getPool();
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE lower(email) = $1 LIMIT 1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return NextResponse.json(
        { error: 'User exists', message: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO users (email, password_hash, display_name, is_active, role)
         VALUES ($1, $2, $3, true, 'user')
         RETURNING id, email, display_name, public_key, role`,
        [email, passwordHash, displayName]
      );

      const user = result.rows[0];
      const { accessToken, refreshToken } = await generateTokenPair(
        user.id,
        user.email,
        user.role || 'user'
      );

      await client.query(
        `INSERT INTO sessions (user_id, refresh_token, device_info, ip_address, expires_at)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')`,
        [user.id, hashRefreshToken(refreshToken), userAgent, ipAddress]
      );

      await client.query('COMMIT');

      const response = NextResponse.json(
        {
          success: true,
          user: {
            id: user.id,
            publicKey: user.public_key || '',
            displayName: user.display_name || user.email,
            email: user.email,
            role: user.role || 'user',
          },
        },
        { status: 201 }
      );

      response.cookies.set('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60,
        path: '/',
      });

      response.cookies.set('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60,
        path: '/',
      });

      return response;
    } catch (error: any) {
      await client.query('ROLLBACK');

      if (error?.code === '23505') {
        return NextResponse.json(
          { error: 'User exists', message: 'An account with this email already exists' },
          { status: 409 }
        );
      }

      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Server error', message: 'An error occurred during registration' },
      { status: 500 }
    );
  }
}
