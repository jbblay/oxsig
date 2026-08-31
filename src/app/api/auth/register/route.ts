import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateTokenPair } from '@/lib/auth/jwt';
import { hashPassword } from '@/lib/auth/password';
import { setAuthCookies } from '@/lib/auth/cookies';
import { fingerprintSessionToken } from '@/lib/auth/session-token';
import { getPool } from '@/lib/db/pool';
import { getClientIp, getUserAgent } from '@/lib/http/client-info';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { logAuthEvent, AUDIT_ACTIONS } from '@/lib/audit/logger';

const registrationSchema = z.object({
  email: z.string().trim().email('Enter a valid email address').max(320),
  password: z.string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[0-9]/, 'Password must contain a number')
    .regex(/[^a-zA-Z0-9]/, 'Password must contain a special character'),
  displayName: z.string().trim().min(1).max(100).optional(),
  display_name: z.string().trim().min(1).max(100).optional(),
});

export async function POST(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.AUTH_REGISTER);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const parsed = registrationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid registration', message: parsed.error.issues[0]?.message },
        { status: 400 },
      );
    }

    const email = parsed.data.email.toLowerCase();
    const accountRateLimitResponse = await checkRateLimit(
      request,
      RATE_LIMITS.AUTH_REGISTER,
      `account:${email}`,
    );
    if (accountRateLimitResponse) return accountRateLimitResponse;
    const displayName = parsed.data.displayName ?? parsed.data.display_name ?? null;
    const passwordHash = await hashPassword(parsed.data.password);
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO users (email, password_hash, display_name, is_active, role)
         VALUES ($1, $2, $3, true, 'user')
         RETURNING id, email, display_name, role`,
        [email, passwordHash, displayName],
      );

      const user = result.rows[0];
      const tokens = await generateTokenPair(user.id, user.email, user.role);
      await client.query(
        `INSERT INTO sessions (user_id, refresh_token, device_info, ip_address, expires_at)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')`,
        [
          user.id,
          fingerprintSessionToken(tokens.refreshToken),
          getUserAgent(request),
          getClientIp(request),
        ],
      );
      await client.query('COMMIT');

      await logAuthEvent(AUDIT_ACTIONS.REGISTER, user.id, request, true);
      const response = NextResponse.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          role: user.role,
        },
      }, { status: 201 });
      setAuthCookies(response, tokens);
      return response;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json(
        { error: 'Account exists', message: 'An account with this email already exists' },
        { status: 409 },
      );
    }
    console.error('Registration failed:', error);
    return NextResponse.json(
      { error: 'Registration failed', message: 'Unable to create the account' },
      { status: 500 },
    );
  }
}
