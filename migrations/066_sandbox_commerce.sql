-- Phase 5: strictly simulated commerce. This schema has no payment-provider,
-- payout destination, transfer, settlement or withdrawal functionality.
-- Existing mentorship offerings and bookings remain constrained to price_cents=0.
CREATE TABLE IF NOT EXISTS sandbox_checkouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  product_type TEXT NOT NULL CHECK(product_type IN ('plan','credit_pack')),
  product_id TEXT NOT NULL CHECK(length(product_id) BETWEEN 1 AND 40),
  price_cents INTEGER NOT NULL CHECK(price_cents BETWEEN 0 AND 100000),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
  status TEXT NOT NULL DEFAULT 'simulated' CHECK(status='simulated'),
  processor TEXT NOT NULL DEFAULT 'none' CHECK(processor='none'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_id,request_id)
);
CREATE INDEX IF NOT EXISTS idx_sandbox_checkouts_owner ON sandbox_checkouts(owner_id,created_at DESC);

CREATE TABLE IF NOT EXISTS sandbox_subscriptions (
  owner_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL CHECK(plan_id IN ('plus','professional')),
  state TEXT NOT NULL DEFAULT 'simulated' CHECK(state='simulated'),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  checkout_id UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(ends_at>starts_at)
);

CREATE TABLE IF NOT EXISTS sandbox_credit_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  delta INTEGER NOT NULL CHECK(delta BETWEEN -300 AND 300 AND delta<>0),
  reason TEXT NOT NULL CHECK(reason IN ('simulated_checkout','simulated_redemption')),
  checkout_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_id,request_id),
  CHECK ((reason='simulated_checkout' AND delta>0 AND checkout_id IS NOT NULL) OR
         (reason='simulated_redemption' AND delta<0 AND checkout_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_sandbox_credit_entries_owner ON sandbox_credit_entries(owner_id,created_at DESC);

CREATE TABLE IF NOT EXISTS sandbox_mentor_earnings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mentor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL UNIQUE,
  amount_cents INTEGER NOT NULL CHECK(amount_cents=200),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
  state TEXT NOT NULL DEFAULT 'simulated_nonwithdrawable' CHECK(state='simulated_nonwithdrawable'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sandbox_mentor_earnings_owner ON sandbox_mentor_earnings(mentor_id,created_at DESC);

COMMENT ON TABLE sandbox_checkouts IS 'No provider calls: purchases are fictional demonstrations, not charges.';
COMMENT ON TABLE sandbox_subscriptions IS 'Illustrative entitlement state only; does not grant paid app permissions.';
COMMENT ON TABLE sandbox_credit_entries IS 'Promotional demo units; no cash value or redemption into real services.';
COMMENT ON TABLE sandbox_mentor_earnings IS 'Nonwithdrawable simulations: no money is owed or payable.';
