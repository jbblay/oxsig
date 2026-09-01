import { NextRequest, NextResponse } from "next/server";
import { getOAuthConfig, isOAuthProvider } from "@/lib/auth/oauth";

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  if (!isOAuthProvider(provider)) return NextResponse.json({ error: "Unsupported OAuth provider" }, { status: 404 });
  const config = getOAuthConfig(provider);
  if (!config) return NextResponse.json({ error: "OAuth provider is not configured" }, { status: 503 });

  const state = crypto.randomUUID().replaceAll("-", "");
  const requestUrl = new URL(request.url);
  const redirectUri = `${requestUrl.origin}/api/auth/oauth/${provider}/callback`;
  const authorize = new URL(config.authorizeUrl);
  authorize.searchParams.set("client_id", config.clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", config.scopes);
  authorize.searchParams.set("state", state);
  if (provider === "google") authorize.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(authorize);
  response.cookies.set("oauth_state", `${provider}.${state}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/api/auth/oauth" });
  return response;
}
