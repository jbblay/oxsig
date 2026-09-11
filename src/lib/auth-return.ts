const DEFAULT_AUTH_RETURN = '/home';

/**
 * Keep post-auth navigation inside OXSIG. Auth return targets are allowed to
 * contain query/hash state, but never an origin, protocol-relative URL, or a
 * backslash variant that a browser/proxy could reinterpret.
 */
export function safeAuthReturnTo(
  value: string | string[] | null | undefined,
  fallback = DEFAULT_AUTH_RETURN,
) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || candidate.length > 2048) return fallback;
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\') || candidate.includes('\0')) {
    return fallback;
  }

  try {
    const base = new URL('https://oxsig.local');
    const parsed = new URL(candidate, base);
    if (parsed.origin !== base.origin) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || fallback;
  } catch {
    return fallback;
  }
}

export function authPathWithReturnTo(
  authPath: '/sign-in' | '/sign-up',
  returnTo: string,
) {
  return `${authPath}?redirect_url=${encodeURIComponent(safeAuthReturnTo(returnTo))}`;
}
