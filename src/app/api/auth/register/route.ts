/**
 * Authentication API - POST /api/auth/register
 * Creates new user account with email/password
 * Returns JWT tokens in httpOnly cookies (Ed25519 signed)
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateTokenPair, hashPassword } from '@/lib/auth/jwt';
import { getPool } from '@/lib/db/pool';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { z } from 'zod';

// Strong password validation schema
const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character');

const emailSchema = z.string().email('Invalid email address');

export async function POST(request: NextRequest) {
  // Rate limit: 3 requests per minute to prevent spam registration
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.AUTH_REGISTER);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  try {
    const body = await request.json();
    const { email, password } = body;
    
    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Missing fields', message: 'Email and password are required' },
        { status: 400 }
      );
    }
    
    // Validate email format
    const emailValidation = emailSchema.safeParse(email);
    if (!emailValidation.success) {
      return NextResponse.json(
        { error: 'Invalid email', message: emailValidation.error.errors[0].message },
        { status: 400 }
      );
    }
    
    // Validate password strength
    const passwordValidation = passwordSchema.safeParse(password);
    if (!passwordValidation.success) {
      return NextResponse.json(
        { error: 'Weak password', message: passwordValidation.error.errors[0].message },
        { status: 400 }
      );
    }
    
    // Check if user already exists
    const pool = getPool();
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    
    if (existingUser.rows.length > 0) {
      return NextResponse.json(
        { error: 'User exists', message: 'An account with this email already exists' },
        { status: 409 }
      );
    }
    
    // Hash password with bcrypt
    const passwordHash = await hashPassword(password);
    
    // Create user in database with default role
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, is_active, role)
       VALUES ($1, $2, true, 'user')
       RETURNING id, email, role`,
      [email, passwordHash]
    );
    
    const user = result.rows[0];
    
    // Generate Ed25519 signed tokens with role
    const { accessToken, refreshToken } = await generateTokenPair(user.id, user.email, user.role);

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
    
    // Create response with httpOnly cookies
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
      },
    }, { status: 201 });
    
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
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Server error', message: 'An error occurred during registration' },
      { status: 500 }
    );
  }
}
