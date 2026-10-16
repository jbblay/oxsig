import { afterEach, describe, expect, it } from 'vitest';
import {
  demoProduct, sandboxCreditsAfter, sandboxCommerceCommandSchema,
  sandboxCommerceEnabled, SANDBOX_MAX_CREDIT_BALANCE,
} from './sandbox-policy';

afterEach(() => { delete process.env.OXSIG_SANDBOX_COMMERCE_ENABLED; });
describe('sandbox commerce safety policy', () => {
  it('is disabled unless expressly enabled', () => {
    expect(sandboxCommerceEnabled()).toBe(false);
    process.env.OXSIG_SANDBOX_COMMERCE_ENABLED = 'true';
    expect(sandboxCommerceEnabled()).toBe(true);
  });
  it('has no payout, real charge, price override, or paid booking mutation', () => {
    expect(sandboxCommerceCommandSchema.safeParse({ action: 'withdraw', amount: 100 }).success).toBe(false);
    expect(sandboxCommerceCommandSchema.safeParse({ action: 'checkout', productType: 'plan', productId: 'plus', priceCents: 1, requestId: '11111111-1111-4111-8111-111111111111' }).success).toBe(false);
    expect(sandboxCommerceCommandSchema.safeParse({ action: 'checkout', productType: 'plan', productId: 'plus', realCharge: true, requestId: '11111111-1111-4111-8111-111111111111' }).success).toBe(false);
  });
  it('accepts only configured example products', () => {
    expect(demoProduct('plan','plus')?.priceCents).toBe(800);
    expect(demoProduct('credit_pack','starter')?.credits).toBe(100);
    expect(demoProduct('plan','constructor')).toBeNull();
    expect(demoProduct('credit_pack','prototype')).toBeNull();
  });
  it('requires valid idempotency IDs and bounded redemptions', () => {
    expect(sandboxCommerceCommandSchema.safeParse({ action:'checkout', productType:'credit_pack', productId:'starter', requestId:'not-a-uuid' }).success).toBe(false);
    expect(sandboxCommerceCommandSchema.safeParse({ action:'redeem', amount:0, requestId:'11111111-1111-4111-8111-111111111111' }).success).toBe(false);
    expect(sandboxCommerceCommandSchema.safeParse({ action:'redeem', amount:301, requestId:'11111111-1111-4111-8111-111111111111' }).success).toBe(false);
  });
  it('prevents negative and unlimited credit balances', () => {
    expect(sandboxCreditsAfter(100,-101)).toBeNull();
    expect(sandboxCreditsAfter(SANDBOX_MAX_CREDIT_BALANCE,1)).toBeNull();
    expect(sandboxCreditsAfter(100,-25)).toBe(75);
    expect(sandboxCreditsAfter(-1,100)).toBeNull();
    expect(sandboxCreditsAfter(100,0)).toBeNull();
  });
});
