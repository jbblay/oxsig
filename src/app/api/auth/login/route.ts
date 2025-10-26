/**
 * Authentication API - POST /api/auth/login
 * Authenticates user with email/password
 * Returns JWT tokens in httpOnly cookies (Ed25519 signed)
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateTokenPair, verifyPassword } from '@/lib/auth/jwt';
import { getPool } from '@/lib/db/pool';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { logAuthEvent, AUDIT_ACTIONS } from '@/lib/audit/logger';

export async function POST(request: NextRequest) {
  // Rate limit: 5 requests per minute to prevent brute force
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.AUTH_LOGIN);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  try {
    const body = await request.json();
    const { email, password } = body;
    
    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Missing credentials', message: 'Email and password are required' },
        { status: 400 }
      );
    }
    
    // Query user from database
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, email, password_hash, is_active 
       FROM users 
       WHERE email = $1`,
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
    
    // Check if user is active
    if (!user.is_active) {
      await logAuthEvent(AUDIT_ACTIONS.LOGIN_FAILED, user.id, request, false, { reason: 'account_disabled' });
      return NextResponse.json(
        { error: 'Account disabled', message: 'Your account has been disabled' },
        { status: 403 }
      );
    }
    
    // Verify password with bcrypt
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      await logAuthEvent(AUDIT_ACTIONS.LOGIN_FAILED, user.id, request, false, { email });
      return NextResponse.json(
        { error: 'Invalid credentials', message: 'Invalid email or password' },
        { status: 401 }
      );
    }
    
    // Update last seen
    await pool.query(
      'UPDATE users SET last_seen_at = NOW() WHERE id = $1',
      [user.id]
    );

    // Get user role
    const roleResult = await pool.query(
      'SELECT role FROM users WHERE id = $1',
      [user.id]
    );
    const userRole = roleResult.rows[0]?.role || 'user';
    
    // Generate Ed25519 signed tokens with role
    const { accessToken, refreshToken } = await generateTokenPair(user.id, user.email, userRole);

    // Store refresh token in sessions table
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                      request.headers.get('x-real-ip') || 
                      'unknown';
    
    await pool.query(
      `INSERT INTO sessions (user_id, refresh_token, device_info, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')`,
      [user.id, refreshToken, userAgent, ipAddress]
    );

    // Log successful login
    await logAuthEvent(AUDIT_ACTIONS.LOGIN_SUCCESS, user.id, request, true);
    
    // Create response with httpOnly cookies
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
      },
    });
    
    // Set httpOnly cookies for security
    response.cookies.set('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60, // 15 minutes
      path: '/',
    });
    
    response.cookies.set('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60, // 7 days
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
