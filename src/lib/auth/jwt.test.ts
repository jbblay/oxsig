import { describe, expect, it } from 'vitest';
import { generateTokenPair, signJWT, verifyJWT } from './jwt';

describe('Ed25519 sessions', () => {
  it('signs and verifies typed access and refresh tokens', async () => {
    const tokens = await generateTokenPair('user-123', 'boss@example.com', 'user');
    const secondPair = await generateTokenPair('user-123', 'boss@example.com', 'user');

    expect(tokens.accessToken).not.toBe(secondPair.accessToken);
    expect(tokens.refreshToken).not.toBe(secondPair.refreshToken);

    await expect(verifyJWT(tokens.accessToken)).resolves.toMatchObject({
      sub: 'user-123',
      email: 'boss@example.com',
      role: 'user',
      type: 'access',
    });
    await expect(verifyJWT(tokens.refreshToken)).resolves.toMatchObject({
      sub: 'user-123',
      type: 'refresh',
    });
  });

  it('rejects a tampered token', async () => {
    const token = await signJWT('user-123');
    const parts = token.split('.');
    parts[1] = `${parts[1].slice(0, -1)}${parts[1].endsWith('a') ? 'b' : 'a'}`;

    await expect(verifyJWT(parts.join('.'))).resolves.toBeNull();
  });

  it('rejects malformed tokens', async () => {
    await expect(verifyJWT('not.a.jwt')).resolves.toBeNull();
  });
});
