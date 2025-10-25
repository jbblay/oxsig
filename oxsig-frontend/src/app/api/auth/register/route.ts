/**
 * Authentication API - POST /api/auth/register
 * Creates new user account with email/password
 * Returns JWT tokens in httpOnly cookies (Ed25519 signed)
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateTokenPair, hashPassword } from '@/lib/auth/jwt';

// Temporary in-memory user store (replace with PostgreSQL in production)
// Note: This should be the same Map instance as login route
// In production, use a shared database
const users = new Map<string, { id: string; email: string; passwordHash: string }>();

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
    if (users.has(email)) {
      return NextResponse.json(
        { error: 'User exists', message: 'An account with this email already exists' },
        { status: 409 }
      );
    }
    
    // Hash password
    const passwordHash = await hashPassword(password);
    
    // Create user
    const userId = `user-${crypto.randomUUID()}`;
    users.set(email, {
      id: userId,
      email,
      passwordHash,
    });
    
    // Generate Ed25519 signed tokens
    const { accessToken, refreshToken } = await generateTokenPair(userId, email);
    
    // Create response with httpOnly cookies
    const response = NextResponse.json({
      success: true,
      user: {
        id: userId,
        email,
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
