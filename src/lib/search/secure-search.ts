"use client";

export function deriveSearchToken(query: string, salt: string): string {
  // Simple deterministic token; replace with SSE scheme (e.g., PRF) in production.
  const data = `${query}|${salt}`;
  const enc = new TextEncoder().encode(data);
  // Not cryptographically secure; stub only.
  let h = 0;
  for (let i = 0; i < enc.length; i++) h = (h * 131 + enc[i]) >>> 0;
  return `tok-${h.toString(16)}`;
}