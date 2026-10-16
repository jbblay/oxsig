# Phase 5 — Sandbox-only commerce (review branch)

This is an **illustrative simulator**, not a payment-provider sandbox integration. No real charges, invoices, transfers or withdrawable balances. Existing free mentor bookings remain free at the database and API level. There are no paid entitlement changes.

## Contents
- `/academy/sandbox-commerce`: simulated plans, demo credit packs, redemption, and a hypothetical mentor earnings history.
- `/api/academy/sandbox-commerce`: authenticated, CSRF-protected, strictly validated, rate-limited API with no money-moving actions.
- `sandbox_checkouts`: fixed server-owned test prices; idempotent `owner_id + request_id` and product-mismatch rejection.
- `sandbox_subscriptions`: illustrative 30-day plan label; never referenced by actual entitlement checks.
- `sandbox_credit_entries`: signed demo credits, bounded balance/redemptions and idempotent requests. No real purchasing power.
- `sandbox_mentor_earnings`: one hypothetical $2 record per completed, jointly attended mentor session; never payable or withdrawable.
- Forward-only migration `066_sandbox_commerce.sql`, checksum manifest, runtime schema parity, account export, pure policy tests.
- Flag `OXSIG_SANDBOX_COMMERCE_ENABLED` defaults off and cannot enable in `OXSIG_DEPLOY_ENV=production` or `VERCEL_ENV=production`.

## Important distinction
This deliberately **does not integrate Stripe, Adyen or another payment provider**, create real subscription renewals, handle chargebacks, maintain an externally reconcilable double-entry monetary ledger, or issue redeemable rewards. Calling this financially production-ready would be incorrect.

## Manual smoke test on disposable infrastructure
1. Apply migrations through 066 in strict sequence to an empty, nonproduction database; re-run migrations and compare immutable checksums, parity and account-deletion foreign keys.
2. With the flag absent, confirm the page shows disabled and POST returns 403.
3. On a nonproduction deployment, set `OXSIG_SANDBOX_COMMERCE_ENABLED=true`. Sign in as learner A and simulate a demo plan and starter credits.
4. Repeat the same checkout request ID; verify one checkout/credit entry only. Reuse the request ID for a different product; must fail.
5. Try repeated redemption, insufficient credits and maximum caps; verify balances never go negative.
6. Sign in as learner B; verify they cannot read or mutate learner A's data.
7. Create a genuinely completed, mutually attended free Rescue Room as an approved mentor. Simulate one mentor earning; repeat and confirm one entry per session; reject unattested/cancelled/unrelated sessions.
8. Export/delete user data; confirm sandbox records export and cascade properly.
9. Force `OXSIG_DEPLOY_ENV=production`; even with flag true, API must refuse mutations.
10. Run typecheck, unit tests, database replay, schema parity, full Next build and desktop/mobile browser smoke tests.

## Known dependencies and blockers
- Stacked on #259 / #258 / #242 / #241 / #239; do not merge or deploy these branches until independently verified.
- #259 initially failed CodeBuild Playwright on a slow, never-completed Mentor Forge evidence loading state. A follow-up commit switches the E2E server from Next dev to the existing production build; **the new head needs CI**.
- Phase 5 still requires real provider sandbox integration and documented monetary ledger, subscription lifecycle, refunds, reconciliation, policy/legal/identity checks before any live billing is considered.
- No live AWS lab / Ably or payment-provider test is claimed.
