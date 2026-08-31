import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateTokenPair } from '@/lib/auth/jwt';
import { verifyPassword } from '@/lib/auth/password';
import { setAuthCookies } from '@/lib/auth/cookies';
import { fingerprintSessionToken } from '@/lib/auth/session-token';
import { getPool } from '@/lib/db/pool';
import { getClientIp, getUserAgent } from '@/lib/http/client-info';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { logAuthEvent, AUDIT_ACTIONS } from '@/lib/audit/logger';

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(128),
});

// A fixed non-secret hash keeps unknown-account and wrong-password checks comparable.
const DUMMY_PASSWORD_HASH = '$2b$12$0MfFPVeuG0gdRwttZTE1C.ks1QkPunSk5UOLXZC1XOLyoftTDvzlO';

export async function POST(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.AUTH_LOGIN);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const parsed = loginSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid credentials', message: 'Enter a valid email and password' },
        { status: 400 },
      );
    }

    const email = parsed.data.email.toLowerCase();
    const accountRateLimitResponse = await checkRateLimit(
      request,
      RATE_LIMITS.AUTH_LOGIN,
      `account:${email}`,
    );
    if (accountRateLimitResponse) return accountRateLimitResponse;
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, email, display_name, password_hash, is_active, COALESCE(role, 'user') AS role
       FROM users
       WHERE LOWER(email) = $1`,
      [email],
    );
    const user = result.rows[0];
    const passwordMatches = await verifyPassword(
      parsed.data.password,
      user?.password_hash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user?.password_hash || !passwordMatches) {
      await logAuthEvent(AUDIT_ACTIONS.LOGIN_FAILED, user?.id ?? null, request, false, { email });
      return NextResponse.json(
        { error: 'Invalid credentials', message: 'Invalid email or password' },
        { status: 401 },
      );
    }

    if (!user.is_active) {
      await logAuthEvent(AUDIT_ACTIONS.LOGIN_FAILED, user.id, request, false, { reason: 'account_disabled' });
      return NextResponse.json(
        { error: 'Account disabled', message: 'This account has been disabled' },
        { status: 403 },
      );
    }

    const tokens = await generateTokenPair(user.id, user.email, user.role);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE users SET last_login_at = NOW(), last_seen_at = NOW() WHERE id = $1`,
        [user.id],
      );
      await client.query(
        `DELETE FROM sessions WHERE user_id = $1 AND (expires_at <= NOW() OR revoked_at IS NOT NULL)`,
        [user.id],
      );
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
      await client.query(
        `DELETE FROM sessions
         WHERE user_id = $1
           AND id NOT IN (
             SELECT id FROM sessions
             WHERE user_id = $1 AND revoked_at IS NULL
             ORDER BY created_at DESC
             LIMIT 10
           )`,
        [user.id],
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
        email: user.email,
        displayName: user.display_name,
        role: user.role,
      },
    });
    setAuthCookies(response, tokens);
    return response;
  } catch (error) {
    console.error('Login failed:', error);
    return NextResponse.json(
      { error: 'Login failed', message: 'Unable to sign in' },
      { status: 500 },
    );
  }
}
