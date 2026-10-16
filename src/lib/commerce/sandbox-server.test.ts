import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/pool', () => ({
  getPool: () => ({ query: mocks.query }),
  transaction: (fn: (db: { query: typeof mocks.query }) => unknown) => fn({ query: mocks.query }),
}));
import { applySandboxCommerceCommand, SandboxCommerceError } from './sandbox-server';

const owner = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  process.env.OXSIG_SANDBOX_COMMERCE_ENABLED = 'true';
  process.env.OXSIG_DEPLOY_ENV = 'development';
  delete process.env.VERCEL_ENV;
  mocks.query.mockReset().mockResolvedValue({ rows: [] });
});
afterEach(() => {
  delete process.env.OXSIG_SANDBOX_COMMERCE_ENABLED;
  delete process.env.OXSIG_DEPLOY_ENV;
});
describe('sandbox commerce security and replay resistance', () => {
  it('refuses all mutations when the feature flag is off', async () => {
    process.env.OXSIG_SANDBOX_COMMERCE_ENABLED = 'false';
    await expect(applySandboxCommerceCommand(owner, { action: 'redeem', amount: 5, requestId })).rejects.toMatchObject({ status: 403 });
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('refuses the feature in a production deployment even if requested', async () => {
    process.env.OXSIG_DEPLOY_ENV = 'production';
    await expect(applySandboxCommerceCommand(owner, { action: 'redeem', amount: 5, requestId })).rejects.toMatchObject({ status: 403 });
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('does not allow request-id reuse to change the simulated product', async () => {
    mocks.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('SELECT id,product_type,product_id FROM sandbox_checkouts') ?
        [{ id: sessionId, product_type: 'plan', product_id: 'plus' }] : [],
    }));
    await expect(applySandboxCommerceCommand(owner, { action:'checkout', productType:'plan', productId:'professional', requestId }))
      .rejects.toThrow('already belongs to another simulated product');
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO sandbox_checkouts'))).toBe(false);
  });
  it('does not duplicate a checkout when the request ID and product match', async () => {
    mocks.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('SELECT id,product_type,product_id FROM sandbox_checkouts') ?
        [{ id: sessionId, product_type: 'plan', product_id: 'plus' }] : [],
    }));
    await applySandboxCommerceCommand(owner, { action:'checkout', productType:'plan', productId:'plus', requestId });
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO sandbox_checkouts'))).toBe(false);
  });
  it('requires verified joint attendance and completion before recording an earning', async () => {
    await expect(applySandboxCommerceCommand(owner, { action: 'record_mentoring', sessionId }))
      .rejects.toMatchObject({ status: 403 });
    const calls = mocks.query.mock.calls;
    expect(calls.some(([sql]) => String(sql).includes('INSERT INTO sandbox_mentor_earnings'))).toBe(false);
    const attendance = calls.find(([sql]) => String(sql).includes('SELECT session.id FROM mentorship_sessions'));
    expect(attendance?.[1]).toEqual([sessionId, owner]);
    expect(attendance?.[0]).toContain("session.status='completed'");
  });
  it('refuses a redemption that would make the demo balance negative', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT COALESCE(SUM(delta),0)::int AS total FROM sandbox_credit_entries'))
        return { rows: [{ total: 10 }] };
      return { rows: [{ n: 0 }] };
    });
    await expect(applySandboxCommerceCommand(owner, { action: 'redeem', amount: 25, requestId }))
      .rejects.toThrow('Insufficient simulated learning credits');
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO sandbox_credit_entries'))).toBe(false);
  });
});
