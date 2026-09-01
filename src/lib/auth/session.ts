import { createHash } from 'crypto';

/**
 * Store only a one-way digest of refresh tokens in PostgreSQL.
 *
 * Access/refresh JWTs remain verifiable with the Ed25519 public key, while the
 * sessions table can still revoke a specific refresh token without retaining
 * the bearer credential itself.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
