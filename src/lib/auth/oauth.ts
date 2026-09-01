export type OAuthProvider = "google" | "github";

type ProviderConfig = {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string;
};

export function getOAuthConfig(provider: OAuthProvider): ProviderConfig | null {
  const config = provider === "google"
    ? {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: "openid email profile",
      }
    : {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        authorizeUrl: "https://github.com/login/oauth/authorize",
        tokenUrl: "https://github.com/login/oauth/access_token",
        scopes: "read:user user:email",
      };

  return config.clientId && config.clientSecret
    ? { ...config, clientId: config.clientId, clientSecret: config.clientSecret }
    : null;
}

export function isOAuthProvider(value: string): value is OAuthProvider {
  return value === "google" || value === "github";
}

export async function fetchOAuthIdentity(
  provider: OAuthProvider,
  code: string,
  redirectUri: string,
): Promise<{ providerId: string; email: string; displayName: string | null; avatarUrl: string | null }> {
  const config = getOAuthConfig(provider);
  if (!config) throw new Error("OAuth provider is not configured");

  const tokenResponse = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    cache: "no-store",
  });
  const token = await tokenResponse.json();
  if (!tokenResponse.ok || !token.access_token) throw new Error("OAuth token exchange failed");

  if (provider === "google") {
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store" });
    const profile = await response.json();
    if (!response.ok || !profile.sub || !profile.email || profile.email_verified !== true) throw new Error("Google did not return a verified email");
    return { providerId: String(profile.sub), email: String(profile.email).toLowerCase(), displayName: profile.name || null, avatarUrl: profile.picture || null };
  }

  const headers = { Authorization: `Bearer ${token.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "OXSIG" };
  const [profileResponse, emailsResponse] = await Promise.all([
    fetch("https://api.github.com/user", { headers, cache: "no-store" }),
    fetch("https://api.github.com/user/emails", { headers, cache: "no-store" }),
  ]);
  const profile = await profileResponse.json();
  const emails = await emailsResponse.json();
  const verified = Array.isArray(emails) ? emails.find((item) => item.primary && item.verified) || emails.find((item) => item.verified) : null;
  if (!profileResponse.ok || !profile.id || !verified?.email) throw new Error("GitHub did not return a verified email");
  return { providerId: String(profile.id), email: String(verified.email).toLowerCase(), displayName: profile.name || profile.login || null, avatarUrl: profile.avatar_url || null };
}
