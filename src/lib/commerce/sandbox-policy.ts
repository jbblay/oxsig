import { z } from 'zod';
import { isProductionDeployment } from '@/lib/runtime/deployment-environment';

/** Catalog prices are DISPLAY-ONLY test data. Never connect this catalog to a real processor. */
export const SANDBOX_PLANS = {
  plus: { label: 'Academy Plus (demo)', priceCents: 800, days: 30 },
  professional: { label: 'Professional (demo)', priceCents: 1800, days: 30 },
} as const;
export const SANDBOX_PACKAGES = {
  starter: { label: 'Starter credit pack (demo)', priceCents: 200, credits: 100 },
  builder: { label: 'Builder credit pack (demo)', priceCents: 500, credits: 300 },
} as const;
export const SANDBOX_EARNING_CENTS_PER_SESSION = 200;
export const SANDBOX_CURRENCY = 'USD' as const;
export const SANDBOX_MAX_CREDIT_BALANCE = 10_000;
export const SANDBOX_MAX_MONTHLY_CHECKOUTS = 12;
export const SANDBOX_MAX_MONTHLY_REDEMPTIONS = 20;

export type SandboxPlan = keyof typeof SANDBOX_PLANS;
export type SandboxPackage = keyof typeof SANDBOX_PACKAGES;

export const sandboxCommerceCommandSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('checkout'),
    productType: z.enum(['plan','credit_pack']),
    productId: z.string().max(40),
    requestId: z.string().uuid(),
  }).strict(),
  z.object({
    action: z.literal('redeem'),
    amount: z.number().int().min(1).max(300),
    requestId: z.string().uuid(),
  }).strict(),
  z.object({
    action: z.literal('record_mentoring'),
    sessionId: z.string().uuid(),
  }).strict(),
]);

export function demoProduct(productType: 'plan' | 'credit_pack', productId: string) {
  if (productType === 'plan' && Object.prototype.hasOwnProperty.call(SANDBOX_PLANS, productId)) {
    return { kind: 'plan' as const, id: productId as SandboxPlan, ...SANDBOX_PLANS[productId as SandboxPlan] };
  }
  if (productType === 'credit_pack' && Object.prototype.hasOwnProperty.call(SANDBOX_PACKAGES, productId)) {
    return { kind: 'credit_pack' as const, id: productId as SandboxPackage, ...SANDBOX_PACKAGES[productId as SandboxPackage] };
  }
  return null;
}

export function sandboxCreditsAfter(current: number, delta: number) {
  if (!Number.isSafeInteger(current) || current < 0 || !Number.isSafeInteger(delta) || delta === 0) {
    return null;
  }
  const result = current + delta;
  return Number.isSafeInteger(result) && result >= 0 && result <= SANDBOX_MAX_CREDIT_BALANCE ? result : null;
}

/** Explicitly disabled unless switched on. The flag changes fake ledger access, never real charging. */
export function sandboxCommerceEnabled() {
  return process.env.OXSIG_SANDBOX_COMMERCE_ENABLED === 'true' && !isProductionDeployment();
}
