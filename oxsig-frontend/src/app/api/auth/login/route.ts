/**
 * Authentication API - POST /api/auth/login
 * Authenticates user with email/password
 * Returns JWT tokens in httpOnly cookies (Ed25519 signed)
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateTokenPair, verifyPassword, hashPassword } from '@/lib/auth/jwt';

// Temporary in-memory user store (replace with PostgreSQL in production)
const users = new Map<string, { id: string; email: string; passwordHash: string }>();

// Initialize with a test user
const initTestUser = async () => {
  if (users.size === 0) {
    const testPasswordHash = await hashPassword('test123');
    users.set('test@example.com', {
      id: 'user-1',
      email: 'test@example.com',
      passwordHash: testPasswordHash,
    });
  }
};

export async function POST(request: NextRequest) {
  try {
    await initTestUser();
    
    const body = await request.json();
    const { email, password } = body;
    
    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Missing credentials', message: 'Email and password are required' },
        { status: 400 }
      );
    }
    
    // Find user
    const user = users.get(email);
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials', message: 'Invalid email or password' },
        { status: 401 }
      );
    }
    
    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid credentials', message: 'Invalid email or password' },
        { status: 401 }
      );
    }
    
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
