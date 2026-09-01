import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { fetchOAuthIdentity, isOAuthProvider } from "@/lib/auth/oauth";
import { generateTokenPair } from "@/lib/auth/jwt";
import { hashRefreshToken } from "@/lib/auth/session";
import { getPool } from "@/lib/db/pool";

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const expected = (await cookies()).get("oauth_state")?.value;
  const fail = (reason: string) => NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(reason)}`, request.url));
  if (!isOAuthProvider(provider) || !code || !state || expected !== `${provider}.${state}`) return fail("OAuth request expired. Please try again.");

  try {
    const redirectUri = `${requestUrl.origin}/api/auth/oauth/${provider}/callback`;
    const identity = await fetchOAuthIdentity(provider, code, redirectUri);
    const pool = getPool();
    const client = await pool.connect();
    let user;
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO users (email, display_name, avatar_url, email_verified, is_active, role)
         VALUES ($1, $2, $3, true, true, 'user')
         ON CONFLICT (lower(email)) WHERE email IS NOT NULL
         DO UPDATE SET display_name = COALESCE(users.display_name, EXCLUDED.display_name), avatar_url = COALESCE(users.avatar_url, EXCLUDED.avatar_url), email_verified = true, updated_at = NOW()
         RETURNING id, email, display_name, avatar_url, role`,
        [identity.email, identity.displayName, identity.avatarUrl],
      );
      user = result.rows[0];
      await client.query(
        `INSERT INTO oauth_accounts (user_id, provider, provider_account_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (provider, provider_account_id) DO UPDATE SET user_id = EXCLUDED.user_id`,
        [user.id, provider, identity.providerId],
      );
      const tokens = await generateTokenPair(user.id, user.email, user.role || "user");
      const userAgent = request.headers.get("user-agent") || "unknown";
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
      await client.query(`INSERT INTO sessions (user_id, refresh_token, device_info, ip_address, expires_at) VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')`, [user.id, hashRefreshToken(tokens.refreshToken), userAgent, ip]);
      await client.query("COMMIT");

      const response = NextResponse.redirect(new URL("/home", request.url));
      response.cookies.delete("oauth_state");
      response.cookies.set("accessToken", tokens.accessToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", maxAge: 900, path: "/" });
      response.cookies.set("refreshToken", tokens.refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", maxAge: 604800, path: "/" });
      return response;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("OAuth callback failed", error);
    return fail("OAuth sign-in failed. Please try again.");
  }
}
