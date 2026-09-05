# Final audit remediation

This note records the targeted production hardening performed after the second canonical-main audit.

## Code fixes

- `pnpm prod:check` now loads `.env` and `.env.local` with the same precedence model used by readiness checks, while preserving already-exported process environment values.
- Sentry build configuration uses `webpack.treeshake.removeDebugLogging` instead of the deprecated `disableLogger` option.
- Windows browser-desktop bootstrap pins TightVNC 2.8.88 and verifies the downloaded 64-bit MSI SHA-256 before `msiexec` is allowed to execute. The pinned digest is `FA86D817AC29C5FFE1E8E7095E738D9BA5CA28AA62304AC234580916622A8CA2`.

## Repository governance

Canonical `main` should require the CI workflow before changes can merge. GitHub branch protection/rulesets are repository administration settings and are not encoded in application source. After this remediation PR is merged, verify in GitHub repository settings that `main` is protected and that the `verify` CI job is required.

Historical open PRs from superseded architectures should remain closed once confirmed obsolete; closing a PR does not delete its branch or commit history.

## Local configuration note

Local `.env.local` remains untracked and must never be committed. A local `next.config.ts` modification should be compared with canonical `main` after this PR lands; the canonical Sentry deprecation fix should be preserved, and any additional intentional local behavior should be reviewed separately before committing.
