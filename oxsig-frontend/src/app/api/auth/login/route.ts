/**
 * Authentication API - POST /api/auth/login
 * Authenticates user with email/password
 * Returns JWT tokens in httpOnly cookies (Ed25519 signed)
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateTokenPair, verifyPassword } from '@/lib/auth/jwt';
import { getPool } from '@/lib/db/pool';

export async function POST(request: NextRequest) {
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
      return NextResponse.json(
        { error: 'Invalid credentials', message: 'Invalid email or password' },
        { status: 401 }
      );
    }
    
    const user = result.rows[0];
    
    // Check if user is active
    if (!user.is_active) {
      return NextResponse.json(
        { error: 'Account disabled', message: 'Your account has been disabled' },
        { status: 403 }
      );
    }
    
    // Verify password with bcrypt
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
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
    
    // Generate Ed25519 signed tokens
    const { accessToken, refreshToken } = await generateTokenPair(user.id, user.email);
    
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
