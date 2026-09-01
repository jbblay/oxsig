/**
 * Authentication API - POST /api/auth/login
 * Authenticates user with email/password and creates an Ed25519-backed session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateTokenPair, verifyPassword } from '@/lib/auth/jwt';
import { hashRefreshToken } from '@/lib/auth/session';
import { getPool } from '@/lib/db/pool';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { logAuthEvent, AUDIT_ACTIONS } from '@/lib/audit/logger';

export async function POST(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.AUTH_LOGIN);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Missing credentials', message: 'Email and password are required' },
        { status: 400 }
      );
    }

    const pool = getPool();
    const result = await pool.query(
      `SELECT id, email, password_hash, is_active, role, display_name, public_key
       FROM users
       WHERE lower(email) = $1
       LIMIT 1`,
      [email]
    );

    if (result.rows.length === 0) {
      await logAuthEvent(AUDIT_ACTIONS.LOGIN_FAILED, null, request, false, { email });
      return NextResponse.json(
        { error: 'Invalid credentials', message: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const user = result.rows[0];

    if (!user.is_active) {
      await logAuthEvent(AUDIT_ACTIONS.LOGIN_FAILED, user.id, request, false, {
        reason: 'account_disabled',
      });
      return NextResponse.json(
        { error: 'Account disabled', message: 'Your account has been disabled' },
        { status: 403 }
      );
    }

    if (!user.password_hash || !(await verifyPassword(password, user.password_hash))) {
      await logAuthEvent(AUDIT_ACTIONS.LOGIN_FAILED, user.id, request, false, { email });
      return NextResponse.json(
        { error: 'Invalid credentials', message: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const userRole = user.role || 'user';
    const { accessToken, refreshToken } = await generateTokenPair(
      user.id,
      user.email,
      userRole
    );

    const userAgent = request.headers.get('user-agent') || 'unknown';
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE users
         SET last_seen_at = NOW(), last_login_at = NOW()
         WHERE id = $1`,
        [user.id]
      );
      await client.query(
        `INSERT INTO sessions (user_id, refresh_token, device_info, ip_address, expires_at)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')`,
        [user.id, hashRefreshToken(refreshToken), userAgent, ipAddress]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await logAuthEvent(AUDIT_ACTIONS.LOGIN_SUCCESS, user.id, request, true);

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        publicKey: user.public_key || '',
        displayName: user.display_name || user.email,
        email: user.email,
        role: userRole,
      },
    });

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
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Server error', message: 'An error occurred during login' },
      { status: 500 }
    );
  }
}
