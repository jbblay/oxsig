/**
 * Authentication API - POST /api/auth/register
 * Creates new user account with email/password
 * Returns JWT tokens in httpOnly cookies (Ed25519 signed)
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateTokenPair, hashPassword } from '@/lib/auth/jwt';
import { getPool } from '@/lib/db/pool';

export async function POST(request: NextRequest) {
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
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email', message: 'Please provide a valid email address' },
        { status: 400 }
      );
    }
    
    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Weak password', message: 'Password must be at least 8 characters long' },
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
    
    // Create user in database
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, is_active)
       VALUES ($1, $2, true)
       RETURNING id, email`,
      [email, passwordHash]
    );
    
    const user = result.rows[0];
    
    // Generate Ed25519 signed tokens
    const { accessToken, refreshToken } = await generateTokenPair(user.id, user.email);
    
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
