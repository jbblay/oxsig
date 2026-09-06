import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDesktopAccessEvidenceTicket,
  desktopAccessEvidenceTicketTtlMs,
  verifyDesktopAccessEvidenceTicket,
} from './desktop-access-evidence-ticket';

const ORIGINAL_SECRET = process.env.OXSIG_TERMINAL_BRIDGE_SECRET;

const input = {
  ownerId: '11111111-1111-4111-8111-111111111111',
  labInstanceId: '22222222-2222-4222-8222-222222222222',
  deploymentAuthorizationId: '33333333-3333-4333-8333-333333333333',
  deploymentExecutionId: '44444444-4444-4444-8444-444444444444',
  planId: 'plan-1',
  planHash: 'a'.repeat(64),
  prerequisiteGuestEvidenceId: '55555555-5555-4555-8555-555555555555',
  sessionId: 'session-1',
  target: 'i-0123456789abcdef0',
  platform: 'linux' as const,
  port: 5901,
};

beforeEach(() => {
  process.env.OXSIG_TERMINAL_BRIDGE_SECRET = 'test-secret-that-is-long-enough-for-desktop-access-evidence';
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T03:10:00.000Z'));
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.OXSIG_TERMINAL_BRIDGE_SECRET;
  else process.env.OXSIG_TERMINAL_BRIDGE_SECRET = ORIGINAL_SECRET;
  vi.useRealTimers();
});

describe('desktop access evidence ticket', () => {
  it('round-trips an encrypted short-lived claim bound to the exact session', () => {
    const issued = createDesktopAccessEvidenceTicket(input, 90_000);
    const claims = verifyDesktopAccessEvidenceTicket(issued.ticket);

    expect(claims).toMatchObject({
      ...input,
      v: 1,
    });
    expect(claims.evidenceExecutionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(claims.exp - claims.iat).toBe(90_000);
    expect(issued.ttlMs).toBe(90_000);
    expect(issued.expiresAt).toBe('2026-09-06T03:11:30.000Z');
  });

  it('rejects tampering and expiry', () => {
    const issued = createDesktopAccessEvidenceTicket(input, 5_000);
    const parts = issued.ticket.split('.');
    parts[2] = `${parts[2].slice(0, -1)}${parts[2].endsWith('A') ? 'B' : 'A'}`;
    expect(() => verifyDesktopAccessEvidenceTicket(parts.join('.'))).toThrow(/Invalid desktop access evidence ticket/);

    vi.setSystemTime(new Date('2026-09-06T03:10:06.000Z'));
    expect(() => verifyDesktopAccessEvidenceTicket(issued.ticket)).toThrow(/expired/i);
  });

  it('clamps the evidence window so browser reports cannot remain valid indefinitely', () => {
    expect(desktopAccessEvidenceTicketTtlMs(1)).toBe(5_000);
    expect(desktopAccessEvidenceTicketTtlMs(999_999)).toBe(300_000);
  });
});
