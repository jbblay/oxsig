import 'server-only';

import { getPool, transaction } from '@/lib/db/pool';
import {
  SANDBOX_CURRENCY,
  SANDBOX_EARNING_CENTS_PER_SESSION,
  SANDBOX_MAX_MONTHLY_CHECKOUTS,
  SANDBOX_MAX_MONTHLY_REDEMPTIONS,
  SANDBOX_MAX_CREDIT_BALANCE,
  demoProduct,
  sandboxCommerceEnabled,
  sandboxCreditsAfter,
  type SandboxPlan,
} from './sandbox-policy';
import type { z } from 'zod';
import type { sandboxCommerceCommandSchema } from './sandbox-policy';

export class SandboxCommerceError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
    this.name = 'SandboxCommerceError';
  }
}

function assertEnabled() {
  if (!sandboxCommerceEnabled()) {
    throw new SandboxCommerceError('Simulated commerce is disabled by default.', 403);
  }
}

export async function getSandboxCommerceState(ownerId: string) {
  if (!sandboxCommerceEnabled()) {
    return { enabled: false, message: 'Sandbox commerce is off. Existing mentorship bookings remain free.', currency: SANDBOX_CURRENCY };
  }
  const db = getPool();
  const [subscription, balance, earnings, checkouts, creditHistory, earningHistory] = await Promise.all([
    db.query(`SELECT plan_id,state,starts_at,ends_at FROM sandbox_subscriptions WHERE owner_id=$1`, [ownerId]),
    db.query(`SELECT COALESCE(SUM(delta),0)::int AS total FROM sandbox_credit_entries WHERE owner_id=$1`, [ownerId]),
    db.query(`SELECT COALESCE(SUM(amount_cents),0)::int AS total FROM sandbox_mentor_earnings WHERE mentor_id=$1`, [ownerId]),
    db.query(`SELECT id,product_type,product_id,price_cents,currency,status,created_at FROM sandbox_checkouts WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 20`, [ownerId]),
    db.query(`SELECT id,delta,reason,created_at FROM sandbox_credit_entries WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 30`, [ownerId]),
    db.query(`SELECT id,session_id,amount_cents,state,created_at FROM sandbox_mentor_earnings WHERE mentor_id=$1 ORDER BY created_at DESC LIMIT 20`, [ownerId]),
  ]);
  const plan = subscription.rows[0] ?? null;
  return {
    enabled: true,
    demoOnly: true,
    currency: SANDBOX_CURRENCY,
    subscription: plan ? { ...plan, active: new Date(plan.ends_at).getTime() > Date.now() } : null,
    learningCredits: Number(balance.rows[0]?.total ?? 0),
    mentorEarningsCents: Number(earnings.rows[0]?.total ?? 0),
    checkouts: checkouts.rows,
    creditHistory: creditHistory.rows,
    earningHistory: earningHistory.rows,
    disclaimer: 'This is a simulation. No money was charged, collected, transferred or earned. No withdrawal is possible. Demo subscriptions do not change real application entitlements.',
  };
}

type Command = z.infer<typeof sandboxCommerceCommandSchema>;

export async function applySandboxCommerceCommand(ownerId: string, command: Command) {
  assertEnabled();
  await transaction(async (db) => {
    await db.query(`SELECT pg_advisory_xact_lock(hashtext('oxsig-demo-commerce:' || $1::text))`, [ownerId]);

    if (command.action === 'checkout') {
      const product = demoProduct(command.productType, command.productId);
      if (!product) throw new SandboxCommerceError('Unknown simulated product.', 400);
      const existing = await db.query(
        `SELECT id,product_type,product_id FROM sandbox_checkouts WHERE owner_id=$1 AND request_id=$2`,
        [ownerId, command.requestId]
      );
      if (existing.rows[0]) {
        if (existing.rows[0].product_type !== product.kind || existing.rows[0].product_id !== product.id) {
          throw new SandboxCommerceError('This request ID already belongs to another simulated product.');
        }
        return;
      }
      const limit = await db.query(
        `SELECT COUNT(*)::int AS n FROM sandbox_checkouts WHERE owner_id=$1 AND created_at>NOW()-INTERVAL '30 days'`,
        [ownerId]
      );
      if (Number(limit.rows[0]?.n) >= SANDBOX_MAX_MONTHLY_CHECKOUTS) {
        throw new SandboxCommerceError('Monthly sandbox checkout limit reached.', 429);
      }
      if (product.kind === 'credit_pack') {
        const balance = await db.query(`SELECT COALESCE(SUM(delta),0)::int AS total FROM sandbox_credit_entries WHERE owner_id=$1`, [ownerId]);
        if (sandboxCreditsAfter(Number(balance.rows[0]?.total ?? 0), product.credits) === null) {
          throw new SandboxCommerceError('Maximum simulated credit balance reached.');
        }
      }
      const created = await db.query(
        `INSERT INTO sandbox_checkouts(owner_id,request_id,product_type,product_id,price_cents) VALUES($1,$2,$3,$4,$5) RETURNING id`,
        [ownerId, command.requestId, product.kind, product.id, product.priceCents]
      );
      if (product.kind === 'plan') {
        // A test subscription is display-only. It never grants production entitlements.
        await db.query(
          `INSERT INTO sandbox_subscriptions(owner_id,plan_id,ends_at,checkout_id)
           VALUES($1,$2,NOW()+INTERVAL '30 days',$3)
           ON CONFLICT(owner_id) DO UPDATE SET plan_id=EXCLUDED.plan_id,starts_at=NOW(),
             ends_at=EXCLUDED.ends_at,checkout_id=EXCLUDED.checkout_id,updated_at=NOW()`,
          [ownerId, product.id as SandboxPlan, created.rows[0].id]
        );
      } else {
        await db.query(
          `INSERT INTO sandbox_credit_entries(owner_id,request_id,delta,reason,checkout_id)
           VALUES($1,$2,$3,'simulated_checkout',$4)`,
          [ownerId, command.requestId, product.credits, created.rows[0].id]
        );
      }
      return;
    }

    if (command.action === 'redeem') {
      const previous = await db.query(
        `SELECT delta,reason FROM sandbox_credit_entries WHERE owner_id=$1 AND request_id=$2`,
        [ownerId, command.requestId]
      );
      if (previous.rows[0]) {
        if (previous.rows[0].delta !== -command.amount || previous.rows[0].reason !== 'simulated_redemption') {
          throw new SandboxCommerceError('This request ID was already used.');
        }
        return;
      }
      const count = await db.query(
        `SELECT COUNT(*)::int AS n FROM sandbox_credit_entries
          WHERE owner_id=$1 AND reason='simulated_redemption' AND created_at>NOW()-INTERVAL '30 days'`,
        [ownerId]
      );
      if (Number(count.rows[0]?.n) >= SANDBOX_MAX_MONTHLY_REDEMPTIONS) {
        throw new SandboxCommerceError('Monthly sandbox redemption limit reached.', 429);
      }
      const balance = await db.query(
        `SELECT COALESCE(SUM(delta),0)::int AS total FROM sandbox_credit_entries WHERE owner_id=$1`,
        [ownerId]
      );
      if (sandboxCreditsAfter(Number(balance.rows[0]?.total ?? 0), -command.amount) === null) {
        throw new SandboxCommerceError('Insufficient simulated learning credits.');
      }
      await db.query(
        `INSERT INTO sandbox_credit_entries(owner_id,request_id,delta,reason)
          VALUES($1,$2,$3,'simulated_redemption')`,
        [ownerId, command.requestId, -command.amount]
      );
      return;
    }

    // Mentor entries represent hypothetical demonstration earnings. No payment
    // is calculated from the free session price and no payouts can be requested.
    const attendance = await db.query(
      `SELECT session.id FROM mentorship_sessions session
         WHERE session.id=$1 AND session.mentor_id=$2 AND session.status='completed'
           AND (SELECT COUNT(DISTINCT a.owner_id) FROM mentorship_attendance a
                WHERE a.session_id=session.id AND a.owner_id IN (session.learner_id,session.mentor_id))=2`,
      [command.sessionId, ownerId]
    );
    if (!attendance.rows[0]) {
      throw new SandboxCommerceError('Only an approved mentor with a completed, attended session can simulate an earning.', 403);
    }
    await db.query(
      `INSERT INTO sandbox_mentor_earnings(mentor_id,session_id,amount_cents)
       VALUES($1,$2,$3)
       ON CONFLICT(session_id) DO NOTHING`,
      [ownerId, command.sessionId, SANDBOX_EARNING_CENTS_PER_SESSION]
    );
  });
  return getSandboxCommerceState(ownerId);
}
